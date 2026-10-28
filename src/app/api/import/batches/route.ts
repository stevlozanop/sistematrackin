import { NextResponse } from "next/server";
import { queryList, tx } from "@/lib/db";
import { guard } from "@/lib/guard";
import { DATE_FIELDS } from "@/lib/hsp";

/**
 * Cargas de Excel guardadas (lotes) y eliminar lo que guardó una carga.
 * - Carga de unidades (facturación / HSP): se borran las unidades que esa carga creó y que todavía nadie trabajó
 *   (sin ningún registro de los encargados). Las que ya avanzaron se quedan, para no perder ese trabajo.
 * - Carga por etapa (fechas de un encargado): cada fecha vuelve a como estaba, si nadie registró algo después en esa unidad.
 * La empresa (Leyva) puede eliminar cualquier carga; cada persona, las suyas.
 *
 * GET               -> últimas 40 cargas (la empresa ve todas; los demás, las suyas) + unidades por ruta
 * POST { id }       -> elimina lo que guardó esa carga
 * POST { action: "wipe", sites: ["PCL", "YUR"], confirm: "ELIMINAR" } -> vacía esas rutas (solo la empresa) y lo registra
 */
const EDITABLE = new Set<string>([...DATE_FIELDS, "delay_reason", "carrier"]);

export async function GET() {
  const { s, err } = await guard(["dev", "admin", "operator", "viewer"]);
  if (err) return err;
  const all = s.role === "admin" || s.role === "dev";
  const rows = await queryList(
    `SELECT b.id, b.kind, b.file_name, DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i') created_at, b.created, b.updated, b.dates,
       DATE_FORMAT(b.undone_at, '%Y-%m-%d %H:%i') undone_at, u.name user_name, ub.name undone_by_name, (b.user_id = ?) mine,
       (SELECT COUNT(*) FROM units x WHERE x.import_batch_id = b.id) remaining
     FROM import_batches b LEFT JOIN users u ON u.id = b.user_id LEFT JOIN users ub ON ub.id = b.undone_by
     ${all ? "" : "WHERE b.user_id = ?"}
     ORDER BY b.id DESC LIMIT 40`,
    all ? [s.id] : [s.id, s.id],
  );
  // La empresa ve cuántas unidades tiene cada ruta (para «Vaciar datos»)
  const sites = s.role === "admin" ? await queryList<{ site: string; n: number }>("SELECT site, COUNT(*) n FROM units GROUP BY site") : [];
  return NextResponse.json({ batches: rows, canUndoAll: s.role === "admin", sites: Object.fromEntries(sites.map((x) => [x.site, Number(x.n)])) });
}

export async function POST(req: Request) {
  const { s, err } = await guard(["admin", "operator", "viewer"]);
  if (err) return err;
  const body = await req.json().catch(() => ({}));

  // Vaciar datos: borra todas las unidades de las rutas elegidas (con sus fechas, motivos e historial)
  if (body.action === "wipe") {
    if (s.role !== "admin") return NextResponse.json({ error: "Solo la empresa puede vaciar los datos" }, { status: 403 });
    if (String(body.confirm ?? "").trim().toUpperCase() !== "ELIMINAR") return NextResponse.json({ error: "Escribe ELIMINAR para confirmar" }, { status: 400 });
    const sites = (Array.isArray(body.sites) ? body.sites : []).filter((x: unknown) => x === "PCL" || x === "YUR") as string[];
    if (!sites.length) return NextResponse.json({ error: "Elige la ruta que quieres vaciar" }, { status: 400 });
    const deleted = await tx(async (c) => {
      const [r] = await c.query("DELETE FROM units WHERE site IN (?)", [sites]);
      await c.query("DELETE FROM containers WHERE site IN (?)", [sites]);
      const n = (r as { affectedRows: number }).affectedRows;
      await c.query("INSERT INTO import_batches(kind, file_name, user_id, created) VALUES ('wipe', ?, ?, ?)", [`Vaciado de ${sites.join(" y ")}`, s.id, n]);
      return n;
    });
    return NextResponse.json({ ok: true, deleted, sites });
  }

  const { id } = body;
  const [b] = await queryList<{ id: number; kind: string; user_id: number | null; undone_at: string | null }>(
    "SELECT id, kind, user_id, undone_at FROM import_batches WHERE id = ?", [Number(id)],
  );
  if (!b) return NextResponse.json({ error: "Esa carga no existe" }, { status: 404 });
  if (s.role !== "admin" && b.user_id !== s.id) return NextResponse.json({ error: "Solo puedes eliminar tus propias cargas" }, { status: 403 });
  if (b.undone_at) return NextResponse.json({ error: "Esa carga ya fue eliminada" }, { status: 409 });
  if (b.kind === "wipe") return NextResponse.json({ error: "Un vaciado no se puede deshacer: vuelve a subir el Excel" }, { status: 409 });

  if (b.kind === "units") {
    const res = await tx(async (c) => {
      // Solo las unidades que esta carga creó y que nadie trabajó todavía (sin registros de encargados ni embarques)
      const [del] = await c.query(
        `DELETE FROM units u WHERE u.import_batch_id = ? AND u.container_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM unit_events e WHERE e.unit_id = u.id) RETURNING u.id`,
        [b.id],
      );
      const [left] = await c.query("SELECT COUNT(*) n FROM units WHERE import_batch_id = ?", [b.id]);
      await c.query("UPDATE import_batches SET undone_at = LOCALTIMESTAMP(0), undone_by = ? WHERE id = ?", [s.id, b.id]);
      return { deleted: (del as unknown[]).length, kept: Number((left as { n: number }[])[0].n) };
    });
    return NextResponse.json({ ok: true, kind: "units", ...res });
  }

  // Carga por etapa: devolver cada fecha a como estaba, si nadie registró algo después en esa unidad
  const res = await tx(async (c) => {
    const [evs] = await c.query(
      `SELECT e.id, e.unit_id, e.field, e.old_value, e.new_value FROM unit_events e
       WHERE e.batch_id = ? AND NOT EXISTS (
         SELECT 1 FROM unit_events x WHERE x.unit_id = e.unit_id AND x.id > e.id AND x.batch_id IS DISTINCT FROM e.batch_id)
       ORDER BY e.id DESC`,
      [b.id],
    );
    const list = (evs as { id: number; unit_id: number; field: string; old_value: string | null; new_value: string | null }[]).filter((e) => EDITABLE.has(e.field));
    let undone = 0;
    const back: unknown[][] = [];
    for (const e of list) {
      const [r] = await c.query(`UPDATE units SET ${e.field} = ? WHERE id = ? AND ${e.field}::text IS NOT DISTINCT FROM ?`, [e.old_value, e.unit_id, e.new_value]);
      if ((r as { affectedRows: number }).affectedRows) { undone++; back.push([e.unit_id, s.id, e.field, e.new_value, e.old_value]); }
    }
    for (let i = 0; i < back.length; i += 1000) await c.query("INSERT INTO unit_events(unit_id, user_id, field, old_value, new_value) VALUES ?", [back.slice(i, i + 1000)]);
    const [all] = await c.query("SELECT COUNT(*) n FROM unit_events WHERE batch_id = ?", [b.id]);
    await c.query("UPDATE import_batches SET undone_at = LOCALTIMESTAMP(0), undone_by = ? WHERE id = ?", [s.id, b.id]);
    return { undone, kept: Number((all as { n: number }[])[0].n) - undone };
  });
  return NextResponse.json({ ok: true, kind: "stage", ...res });
}
