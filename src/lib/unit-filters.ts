import { DATE_FIELDS, type DateField, type Site } from "./hsp";
import { pendingSql } from "./workflow";

type Scope = { stages: { site: string; field: DateField }[]; carrier?: string | null } | null;

/**
 * Filtros de las pantallas PCL / YUR (búsqueda, estado, servicio, dealer, zona, motivo, nave, bandeja, alertas, año y mes),
 * sobre la vista v_units. Los usan la tabla (/api/units) y la ruta animada (/api/units/flow).
 * skip: parámetros que no se aplican (la ruta muestra todos los estados aunque haya uno elegido).
 */
export function unitFilters(p: URLSearchParams, site: Site, scope: Scope, skip: string[] = []) {
  const where = ["site = ?"];
  const args: unknown[] = [site];
  const q = p.get("q")?.trim();
  if (q) {
    where.push("(chassis LIKE ? OR motor LIKE ? OR lote LIKE ? OR invoice LIKE ? OR guia LIKE ? OR material LIKE ? OR order_sap LIKE ?)");
    args.push(...Array(7).fill(`%${q}%`));
  }
  const eq: [string, string][] = [["status", "status"], ["service", "service"], ["dealer", "dealer"], ["zone", "zone"], ["reason", "delay_reason"], ["nave", "nave"]];
  for (const [param, col] of eq) {
    if (skip.includes(param)) continue;
    const v = p.get(param);
    if (v === "__none") where.push(`${col} IS NULL`);
    // estado y servicio se guardan en mayúsculas: «entregado» también encuentra ENTREGADO
    else if (v) { where.push(`${col} = ?`); args.push(col === "status" || col === "service" ? v.toUpperCase() : v); }
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

  return { where, args };
}
