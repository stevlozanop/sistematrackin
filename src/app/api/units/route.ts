import { NextResponse } from "next/server";
import { queryList, run, tx } from "@/lib/db";
import { getScope, guard, SUPER } from "@/lib/guard";
import { DATE_FIELDS, isSite, type DateField, type Site } from "@/lib/hsp";
import { checkDateEdit, isSuper, needsDelayReason, pendingSql } from "@/lib/workflow";

const SORTABLE = new Set([
  "days_left", "chassis", "material", "dealer", "zone", "billing_date", "est_date", "status", "service", "delay_reason", "real_days",
  ...DATE_FIELDS,
]);

/** Campos que se pueden editar desde el sistema. */
const EDITABLE = new Set<string>([
  ...DATE_FIELDS, "delay_reason", "observation", "nave", "container", "carrier", "driver", "plan_almacen", "route", "department",
]);
const UPPER = new Set(["delay_reason", "route", "department", "carrier"]);

/**
 * GET /api/units?site=PCL&q=&status=&service=&dealer=&zone=&reason=&year=&month=&page=1&size=25&sort=billing_date&dir=desc
 * GET /api/units?site=PCL&meta=1  -> opciones para los filtros
 */
export async function GET(req: Request) {
  const { s, err } = await guard();
  if (err) return err;
  const p = new URL(req.url).searchParams;
  const site = p.get("site");
  if (!isSite(site)) return NextResponse.json({ error: "Módulo inválido" }, { status: 400 });
  // Encargado: solo el módulo donde tiene etapas (y, si es de una empresa de transporte, solo sus unidades)
  const scope = isSuper(s.role) ? null : await getScope(s.id);
  if (scope && !scope.stages.some((st) => st.site === site)) {
    return NextResponse.json({ error: "No tienes acceso a este módulo" }, { status: 403 });
  }

  if (p.get("meta")) {
    const [dealers, zones, years, reasons] = await Promise.all([
      queryList<{ v: string }>("SELECT DISTINCT d.name v FROM units u JOIN dealers d ON d.id=u.dealer_id WHERE u.site=? ORDER BY v", [site]),
      queryList<{ v: string }>(`SELECT DISTINCT ${site === "PCL" ? "department" : "route"} v FROM units WHERE site=? AND ${site === "PCL" ? "department" : "route"} IS NOT NULL ORDER BY v`, [site]),
      queryList<{ v: number }>("SELECT DISTINCT YEAR(billing_date) v FROM units WHERE site=? AND billing_date IS NOT NULL ORDER BY v DESC", [site]),
      queryList<{ v: string }>("SELECT DISTINCT delay_reason v FROM units WHERE site=? AND delay_reason IS NOT NULL ORDER BY v", [site]),
    ]);
    return NextResponse.json({
      dealers: dealers.map((r) => r.v), zones: zones.map((r) => r.v), years: years.map((r) => r.v), reasons: reasons.map((r) => r.v),
    });
  }

  const where = ["site = ?"];
  const args: unknown[] = [site];
  const q = p.get("q")?.trim();
  if (q) {
    where.push("(chassis LIKE ? OR motor LIKE ? OR lote LIKE ? OR invoice LIKE ? OR guia LIKE ? OR material LIKE ? OR order_sap LIKE ?)");
    args.push(...Array(7).fill(`%${q}%`));
  }
  const eq: [string, string][] = [["status", "status"], ["service", "service"], ["dealer", "dealer"], ["zone", "zone"], ["reason", "delay_reason"]];
  for (const [param, col] of eq) {
    const v = p.get(param);
    if (v === "__none") where.push(`${col} IS NULL`);
    else if (v) { where.push(`${col} = ?`); args.push(v); }
  }
  // Bandeja: unidades que esperan una etapa (pending=d_zarpe) o las etapas del usuario (mine=1)
  const pending = p.get("pending");
  if (pending && (DATE_FIELDS as string[]).includes(pending)) where.push(`(${pendingSql(site, pending as DateField)})`);
  if (scope?.carrier) { where.push("carrier = ?"); args.push(scope.carrier); }
  if (p.get("mine")) {
    const mine = (scope?.stages ?? []).filter((st) => st.site === site);
    where.push(mine.length ? `(${mine.map((st) => `(${pendingSql(site, st.field)})`).join(" OR ")})` : "1=0");
  }
  // Alertas: VENCIDA, POR VENCER o SIN_MOTIVO (fuera de tiempo sin motivo de demora)
  const alert = p.get("alert");
  if (alert === "VENCIDA" || alert === "POR VENCER") { where.push("alert = ?"); args.push(alert); }
  if (alert === "SIN_MOTIVO") where.push("service = 'FUERA DE TIEMPO' AND delay_reason IS NULL");
  const year = Number(p.get("year")), month = Number(p.get("month"));
  if (year) { where.push("YEAR(billing_date) = ?"); args.push(year); }
  if (month) { where.push("MONTH(billing_date) = ?"); args.push(month); }

  const size = Math.min(200, Math.max(5, Number(p.get("size")) || 25));
  const page = Math.max(1, Number(p.get("page")) || 1);
  const sort = p.get("sort") === "recent" || SORTABLE.has(p.get("sort") ?? "") ? p.get("sort")! : "billing_date";
  const dir = p.get("dir") === "asc" ? "ASC" : "DESC";
  const w = where.join(" AND ");

  // «Últimos cambios»: primero las unidades con la fecha registrada más reciente (historial unit_events,
  // no updated_at, que la carga de Excel cambia en todas). Las que nunca se tocaron siguen por facturación.
  const page_ = [size, (page - 1) * size];
  const rowsSql = sort === "recent"
    ? `SELECT v.* FROM v_units v
       LEFT JOIN (SELECT unit_id, MAX(id) ev FROM unit_events GROUP BY unit_id) le ON le.unit_id = v.id
       WHERE ${w} ORDER BY le.ev IS NULL, le.ev ${dir}, v.billing_date DESC, v.id DESC LIMIT ? OFFSET ?`
    : `SELECT * FROM v_units WHERE ${w} ORDER BY ${sort} ${dir}, id ${dir} LIMIT ? OFFSET ?`;
  const [[{ total }], rows] = await Promise.all([
    queryList<{ total: number }>(`SELECT COUNT(*) total FROM v_units WHERE ${w}`, args),
    queryList<Record<string, unknown>>(rowsSql, [...args, ...page_]),
  ]);
  // Último registro de cada unidad (quién y cuándo) para seguir el trabajo en tiempo real
  if (rows.length) {
    const last = await queryList<{ unit_id: number; field: string; at: string; by: string | null }>(
      `SELECT e.unit_id, e.field, DATE_FORMAT(e.at,'%Y-%m-%d %H:%i') at, us.name \`by\`
       FROM unit_events e
       JOIN (SELECT unit_id, MAX(id) id FROM unit_events WHERE unit_id IN (?) GROUP BY unit_id) m ON m.id = e.id
       LEFT JOIN users us ON us.id = e.user_id`,
      [rows.map((r) => r.id)],
    );
    const byUnit = new Map(last.map((l) => [l.unit_id, l]));
    for (const r of rows) {
      const l = byUnit.get(r.id as number);
      if (l) Object.assign(r, { last_field: l.field, last_at: l.at, last_by: l.by });
    }
  }
  return NextResponse.json({ total, page, size, rows });
}

/**
 * PATCH { ids: number[], changes: { d_zarpe: "2026-10-01" | null, delay_reason: "DEMORA ZARPE", ... } }
 * Encargado: solo sus etapas, solo la siguiente etapa de cada unidad, y una fecha ya guardada queda bloqueada.
 * Super admin: puede corregir cualquier campo. Cada cambio queda en unit_events (seguimiento en vivo).
 */
export async function PATCH(req: Request) {
  const { s, err } = await guard();
  if (err) return err;
  const { ids, changes } = await req.json().catch(() => ({}));
  const unitIds = Array.isArray(ids) ? [...new Set(ids.map(Number).filter(Number.isInteger))] : [];
  const entries = Object.entries((changes ?? {}) as Record<string, unknown>).filter(([k]) => EDITABLE.has(k));
  if (!unitIds.length || !entries.length) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  if (unitIds.length > 5000) return NextResponse.json({ error: "Máximo 5000 unidades por cambio" }, { status: 400 });

  const sup = isSuper(s.role);
  const scope = sup ? null : await getScope(s.id);
  const stages = scope?.stages ?? [];
  const OPERATOR_TEXT = new Set(["delay_reason", "observation"]);
  // El almacén indica la empresa de transporte al registrar el despacho (así le aparece a esa empresa)
  const keys = entries.map(([k]) => k);
  const setsCarrierOnDispatch = keys.includes("carrier") && keys.includes("d_despacho");

  // Normaliza valores
  const vals: [string, string | null][] = [];
  for (const [k, v] of entries) {
    const t = v === null || v === undefined ? "" : String(v).trim();
    if ((DATE_FIELDS as string[]).includes(k)) {
      if (t && !/^\d{4}-\d{2}-\d{2}$/.test(t)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
      vals.push([k, t || null]);
    } else {
      if (!sup && !OPERATOR_TEXT.has(k) && !(k === "carrier" && setsCarrierOnDispatch)) {
        return NextResponse.json({ error: "No tienes permiso para cambiar ese campo" }, { status: 403 });
      }
      vals.push([k, t ? (UPPER.has(k) ? t.toUpperCase() : t).slice(0, 500) : null]);
    }
  }

  // Estado actual de las unidades
  const cols = ["id", "site", ...DATE_FIELDS, ...EDITABLE].filter((c, i, a) => a.indexOf(c) === i);
  const current: Record<string, unknown>[] = [];
  for (let i = 0; i < unitIds.length; i += 1000) {
    // v_units trae via_lima (si el dealer va por Ruta Lima), necesario para validar el orden
    current.push(...(await queryList(`SELECT ${cols.join(",")}, via_lima, est_date FROM v_units WHERE id IN (?)`, [unitIds.slice(i, i + 1000)])));
  }

  // Valida unidad por unidad
  const ok: Record<string, unknown>[] = [];
  const skipped: { id: number; reason: string }[] = [];
  for (const u of current) {
    const site = u.site as Site;
    let reason: string | null = null;
    for (const [k, v] of vals) {
      if ((DATE_FIELDS as string[]).includes(k)) {
        reason = checkDateEdit(s.role, stages, site, u as never, k as DateField, v, scope?.carrier);
        // Si la unidad está fuera de tiempo y no tiene motivo, se pide antes de registrar la fecha
        if (!reason && needsDelayReason(u as never, v, vals.find(([key]) => key === "delay_reason")?.[1])) {
          reason = "La unidad está fuera de tiempo: indica primero el motivo de demora";
        }
      } else if (!sup && !stages.some((st) => st.site === site)) {
        reason = "No tienes etapas asignadas en este módulo";
      } else if (!sup && scope?.carrier && String(u.carrier ?? "").toUpperCase() !== scope.carrier.toUpperCase()) {
        reason = "La unidad es de otra empresa de transporte";
      }
      if (reason) break;
    }
    if (reason) skipped.push({ id: u.id as number, reason });
    else ok.push(u);
  }
  if (!ok.length) {
    return NextResponse.json({ error: skipped[0]?.reason ?? "Unidad no encontrada", skipped: skipped.length }, { status: 403 });
  }

  await tx(async (c) => {
    const okIds = ok.map((u) => u.id as number);
    for (let i = 0; i < okIds.length; i += 1000) {
      await c.query(`UPDATE units SET ${vals.map(([k]) => `${k}=?`).join(", ")} WHERE id IN (?)`, [...vals.map(([, v]) => v), okIds.slice(i, i + 1000)]);
    }
    const events = ok.flatMap((u) =>
      vals.filter(([k, v]) => (u[k] ?? null) !== v).map(([k, v]) => [u.id, s.id, k, (u[k] as string | null) ?? null, v]),
    );
    for (let i = 0; i < events.length; i += 1000) {
      await c.query("INSERT INTO unit_events(unit_id, user_id, field, old_value, new_value) VALUES ?", [events.slice(i, i + 1000)]);
    }
  });

  const rows = await queryList(`SELECT * FROM v_units WHERE id IN (?)`, [ok.slice(0, 500).map((u) => u.id)]);
  return NextResponse.json({ ok: true, count: ok.length, skipped: skipped.length, skipReason: skipped[0]?.reason ?? null, rows });
}

/** DELETE /api/units?site=PCL -> elimina todas las unidades de ese módulo. */
export async function DELETE(req: Request) {
  const { err } = await guard(SUPER);
  if (err) return err;
  const site = new URL(req.url).searchParams.get("site");
  if (!isSite(site)) return NextResponse.json({ error: "Módulo inválido" }, { status: 400 });
  const res = await run("DELETE FROM units WHERE site=?", [site]);
  return NextResponse.json({ ok: true, deleted: res.affectedRows });
}
