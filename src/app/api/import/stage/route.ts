import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { queryList, run, tx } from "@/lib/db";
import { getScope, guard } from "@/lib/guard";
import { DATE_FIELDS, SITE_INFO, type DateField, type Site } from "@/lib/hsp";
import { parseStageWorkbook } from "@/lib/stage-import";
import { checkDateEdit, needsDelayReason } from "@/lib/workflow";

export const maxDuration = 120;

type Update = { id: number; site: Site; chassis: string; changes: Partial<Record<DateField, string>>; reason: string | null; carrier: string | null };

const LABELS = Object.fromEntries(
  (Object.keys(SITE_INFO) as Site[]).flatMap((site) => SITE_INFO[site].dates.map((d) => [`${site}|${d.key}`, d.label])),
);

/**
 * Carga masiva de un encargado (con permiso): fechas de SUS etapas desde un Excel.
 * Paso 1 (multipart "file"): valida cada fila con las mismas reglas que «Mi trabajo» y devuelve la vista previa.
 * Paso 2 (JSON { token }): guarda solo lo válido, sin pisar fechas ya registradas.
 */
export async function POST(req: Request) {
  const { s, err } = await guard(["operator"]);
  if (err) return err;
  const scope = await getScope(s.id);
  if (!scope.canImport) return NextResponse.json({ error: "No tienes permiso para subir Excel. Pídelo a tu supervisor." }, { status: 403 });
  if (!scope.stages.length) return NextResponse.json({ error: "No tienes etapas asignadas" }, { status: 400 });

  // ---------- Paso 2: guardar ----------
  if (req.headers.get("content-type")?.includes("application/json")) {
    const { token } = await req.json().catch(() => ({}));
    const [row] = await queryList<{ payload: string }>(
      "SELECT payload FROM import_stash WHERE token = ? AND user_id = ? AND created_at > NOW() - INTERVAL 30 MINUTE", [String(token ?? ""), s.id],
    );
    await run("DELETE FROM import_stash WHERE token = ?", [String(token ?? "")]);
    const saved = row ? JSON.parse(row.payload) : null;
    const p = saved && (Array.isArray(saved) ? { updates: saved as Update[], name: null } : (saved as { updates: Update[]; name: string | null }));
    if (!p) return NextResponse.json({ error: "La vista previa expiró. Vuelve a subir el Excel." }, { status: 400 });
    let units = 0, dates = 0;
    await tx(async (c) => {
      const [b] = await c.query("INSERT INTO import_batches(kind, file_name, user_id) VALUES ('stage', ?, ?) RETURNING id", [p.name, s.id]);
      const batchId = (b as { id: number }[])[0].id;
      for (const u of p.updates) {
        const fields = Object.keys(u.changes) as DateField[];
        const sets = fields.map((f) => `${f}=?`);
        const vals: unknown[] = fields.map((f) => u.changes[f]);
        if (u.reason) { sets.push("delay_reason=COALESCE(delay_reason, ?)"); vals.push(u.reason); }
        if (u.carrier) { sets.push("carrier=COALESCE(carrier, ?)"); vals.push(u.carrier); }
        // Nunca pisa una fecha que alguien registró mientras tanto
        const [r] = await c.query(
          `UPDATE units SET ${sets.join(", ")} WHERE id=? AND ${fields.map((f) => `${f} IS NULL`).join(" AND ")}`,
          [...vals, u.id],
        );
        if (!(r as { affectedRows: number }).affectedRows) continue;
        units++; dates += fields.length;
        const ev = [
          ...fields.map((f) => [u.id, s.id, f, null, u.changes[f]]),
          ...(u.reason ? [[u.id, s.id, "delay_reason", null, u.reason]] : []),
          ...(u.carrier ? [[u.id, s.id, "carrier", null, u.carrier]] : []),
        ];
        await c.query("INSERT INTO unit_events(unit_id, user_id, field, old_value, new_value, batch_id) VALUES ?", [ev.map((e) => [...e, batchId])]);
      }
      await c.query("UPDATE import_batches SET updated = ?, dates = ? WHERE id = ?", [units, dates, batchId]);
    });
    return NextResponse.json({ units, dates });
  }

  // ---------- Paso 1: leer y validar ----------
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  let parsed;
  try {
    parsed = parseStageWorkbook(Buffer.from(await file.arrayBuffer()), scope.stages, LABELS);
  } catch (e) {
    console.error("[import/stage]", e);
    parsed = null;
  }
  if (!parsed) {
    const cols = scope.stages.map((st) => `"${LABELS[`${st.site}|${st.field}`]}"`).join(", ");
    return NextResponse.json({ error: `No se encontraron las columnas. El Excel debe tener "Número Chasis" y ${cols}. Descarga la plantilla.` }, { status: 400 });
  }

  const sites = [...new Set(scope.stages.map((st) => st.site))];
  const chassisList = [...new Set(parsed.rows.map((r) => r.chassis))];
  const units: Record<string, unknown>[] = [];
  for (let i = 0; i < chassisList.length; i += 2000) {
    units.push(...(await queryList(
      `SELECT id, site, chassis, ${DATE_FIELDS.join(",")}, via_lima, est_date, delay_reason, carrier
       FROM v_units WHERE site IN (?) AND chassis IN (?)${scope.carrier ? " AND carrier = ?" : ""}`,
      scope.carrier ? [sites, chassisList.slice(i, i + 2000), scope.carrier] : [sites, chassisList.slice(i, i + 2000)],
    )));
  }
  const byChassis = new Map<string, Record<string, unknown>>();
  for (const u of units) if (!byChassis.has(u.chassis as string)) byChassis.set(u.chassis as string, u);

  const updates: Update[] = [];
  const skipped: { line: number; chassis: string; reason: string }[] = [];
  const seen = new Set<number>();
  for (const row of parsed.rows) {
    const unit = byChassis.get(row.chassis);
    if (!unit) { skipped.push({ line: row.line, chassis: row.chassis, reason: "No existe en tu módulo" }); continue; }
    if (seen.has(unit.id as number)) { skipped.push({ line: row.line, chassis: row.chassis, reason: "Chasis repetido en el Excel" }); continue; }
    seen.add(unit.id as number);
    const site = unit.site as Site;
    const work: Record<string, unknown> = { ...unit };
    const changes: Update["changes"] = {};
    let needReason = false, why: string | null = null;
    // En el orden del recorrido, así una fila puede registrar dos etapas seguidas (ej. 4 y 5)
    for (const { key } of SITE_INFO[site].dates) {
      const v = row.dates[key];
      if (!v || !scope.stages.some((st) => st.site === site && st.field === key)) continue;
      why = checkDateEdit(s.role, scope.stages, site, work as never, key, v, scope.carrier);
      if (!why && needsDelayReason(work as never, v, row.reason)) why = "Está fuera de tiempo: falta el motivo de demora";
      if (!why && needsDelayReason(work as never, v, null)) needReason = true;
      if (!why && site === "PCL" && key === "d_despacho" && !work.carrier && !row.carrier) why = "Falta la empresa de transporte";
      if (why) break;
      changes[key] = v;
      work[key] = v;
    }
    if (why) skipped.push({ line: row.line, chassis: row.chassis, reason: why });
    if (Object.keys(changes).length) {
      updates.push({
        id: unit.id as number, site, chassis: row.chassis, changes,
        reason: needReason ? row.reason : null,
        // Empresa de transporte: se guarda al despachar (PCL) si la unidad aún no la tiene
        carrier: changes.d_despacho && !unit.carrier ? row.carrier : null,
      });
    }
  }

  // la vista previa se guarda en la base: en Vercel el paso 2 puede llegar a otro servidor
  await run("DELETE FROM import_stash WHERE created_at < NOW() - INTERVAL 30 MINUTE");
  const token = crypto.randomUUID();
  await run("INSERT INTO import_stash(token, user_id, payload) VALUES (?, ?, ?)", [token, s.id, JSON.stringify({ name: file.name, updates })]);

  const summary: Record<string, number> = {};
  for (const sk of skipped) summary[sk.reason] = (summary[sk.reason] ?? 0) + 1;
  return NextResponse.json({
    token,
    name: file.name,
    columns: parsed.columns.map((f) => LABELS[`${sites[0]}|${f}`] ?? f),
    rows: parsed.rows.length,
    units: updates.length,
    dates: updates.reduce((t, u) => t + Object.keys(u.changes).length, 0),
    skipped: skipped.length,
    summary,
    skippedSample: skipped.slice(0, 100),
    sample: updates.slice(0, 100).map((u) => ({ chassis: u.chassis, site: u.site, changes: u.changes })),
  });
}
