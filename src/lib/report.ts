import { dealerScope } from "./clients";
import type { Session } from "./auth";
import { MONTHS } from "./hsp";

/**
 * Filtros de los reportes (Excel y versión para imprimir), sobre la vista v_units.
 * ?from=2026-01&to=2026-10 (meses de facturación) · ?site=PCL|YUR · ?client=SORSA MOTORS
 * Un cliente de Honda siempre queda limitado a sus propias tiendas, pida lo que pida.
 */
export type ReportScope = { where: string; args: unknown[]; title: string; filters: string[] };

const ym = (v: string | null) => (v && /^\d{4}-\d{2}$/.test(v) ? v : null);
const monthLabel = (v: string) => `${MONTHS[Number(v.slice(5, 7)) - 1]} ${v.slice(0, 4)}`;

export async function reportScope(s: Session, p: URLSearchParams): Promise<ReportScope | null> {
  const where = ["billing_date IS NOT NULL"];
  const args: unknown[] = [];
  const filters: string[] = [];
  let title = "Todas las unidades";

  if (s.role === "dealer") {
    const sc = await dealerScope(s.id);
    if (!sc) return null;
    where.push(sc.sql);
    args.push(...sc.args);
    title = sc.client ?? "Tu tienda";
  } else {
    const client = (p.get("client") ?? "").trim().toUpperCase();
    if (client) {
      where.push("dealer_id IN (SELECT id FROM dealers WHERE client = ?)");
      args.push(client);
      title = client;
    }
  }

  const from = ym(p.get("from"));
  const to = ym(p.get("to"));
  if (from) { where.push("billing_date >= ?"); args.push(`${from}-01`); }
  if (to) { where.push("billing_date < ?::date + INTERVAL '1 month'"); args.push(`${to}-01`); }
  if (from || to) filters.push(`Facturación: ${from ? monthLabel(from) : "inicio"} a ${to ? monthLabel(to) : "hoy"}`);

  const site = p.get("site");
  if (site === "PCL" || site === "YUR") {
    where.push("site = ?");
    args.push(site);
    filters.push(site === "PCL" ? "Módulo: PCL · Pucallpa" : "Módulo: YUR · Yurimaguas");
  }
  return { where: where.join(" AND "), args, title, filters };
}
