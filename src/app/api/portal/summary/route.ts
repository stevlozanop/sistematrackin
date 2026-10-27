import { NextResponse } from "next/server";
import { queryList } from "@/lib/db";
import { guard } from "@/lib/guard";
import { dealerScope } from "@/lib/clients";

/**
 * Resumen («dashboard») de un cliente de Honda: solo sus pedidos (unidades de sus tiendas).
 * - Dónde están ahora sus pedidos en camino (por etapa).
 * - Sus pedidos por mes de facturación: cuántos llegaron, cuántos faltan y su % a tiempo.
 * - Por tienda y por modelo, y las últimas entregas.
 */
export async function GET() {
  const { s, err } = await guard(["dealer"]);
  if (err) return err;
  const sc = await dealerScope(s.id);
  if (!sc) return NextResponse.json({ error: "Tu cuenta no tiene un cliente asignado. Avisa al administrador." }, { status: 404 });
  const w = sc.sql;
  const a = sc.args;

  const [totals, byStatus, byMonth, byStore, byModel, recent] = await Promise.all([
    queryList<Record<string, number | string | null>>(
      `SELECT COUNT(*) total, SUM(d_entrega IS NULL) open, SUM(d_entrega IS NOT NULL) delivered,
         SUM(d_entrega IS NOT NULL AND service='A TIEMPO') on_time_delivered,
         SUM(alert='VENCIDA') late, SUM(alert='POR VENCER') soon,
         ROUND(AVG(IF(d_entrega IS NOT NULL, real_days, NULL))) avg_days,
         MIN(IF(d_entrega IS NULL AND est_date >= CURDATE(), est_date, NULL)) next_eta
       FROM v_units WHERE ${w}`, a,
    ),
    queryList<{ site: string; status: string; n: number; late: number }>(
      `SELECT site, status, COUNT(*) n, SUM(alert='VENCIDA') late FROM v_units WHERE ${w} AND d_entrega IS NULL GROUP BY site, status ORDER BY site ASC, status ASC`, a,
    ),
    queryList<{ ym: string; total: number; delivered: number; open: number; on_time: number; late: number }>(
      `SELECT DATE_FORMAT(billing_date,'%Y-%m') ym, COUNT(*) total, SUM(d_entrega IS NOT NULL) delivered, SUM(d_entrega IS NULL) open,
         SUM(service='A TIEMPO') on_time, SUM(service='FUERA DE TIEMPO') late
       FROM v_units WHERE ${w} AND billing_date >= DATE_FORMAT(CURDATE() - INTERVAL 11 MONTH, '%Y-%m-01')::date
       GROUP BY ym ORDER BY ym`, a,
    ),
    queryList<{ dealer: string; total: number; open: number; delivered: number; on_time: number; late_open: number }>(
      `SELECT dealer, COUNT(*) total, SUM(d_entrega IS NULL) open, SUM(d_entrega IS NOT NULL) delivered,
         SUM(service='A TIEMPO') on_time, SUM(alert='VENCIDA') late_open
       FROM v_units WHERE ${w} GROUP BY dealer ORDER BY open DESC, total DESC, dealer ASC`, a,
    ),
    queryList<{ material: string | null; category: string | null; open: number; total: number }>(
      `SELECT material, MAX(category) category, SUM(d_entrega IS NULL) open, COUNT(*) total
       FROM v_units WHERE ${w} GROUP BY material ORDER BY open DESC, total DESC, material ASC LIMIT 8`, a,
    ),
    queryList(
      `SELECT site, chassis, guia, material, dealer, d_entrega, service, real_days FROM v_units
       WHERE ${w} AND d_entrega IS NOT NULL ORDER BY d_entrega DESC, id DESC LIMIT 6`, a,
    ),
  ]);
  const num = (v: unknown) => Number(v ?? 0);
  const t = totals[0] ?? {};
  return NextResponse.json({
    client: sc.client,
    totals: {
      total: num(t.total), open: num(t.open), delivered: num(t.delivered), onTimeDelivered: num(t.on_time_delivered),
      late: num(t.late), soon: num(t.soon), avgDays: t.avg_days === null ? null : num(t.avg_days), nextEta: t.next_eta ?? null,
    },
    byStatus: byStatus.map((r) => ({ ...r, n: num(r.n), late: num(r.late) })),
    byMonth: byMonth.map((r) => ({ ...r, total: num(r.total), delivered: num(r.delivered), open: num(r.open), on_time: num(r.on_time), late: num(r.late) })),
    byStore: byStore.map((r) => ({ ...r, total: num(r.total), open: num(r.open), delivered: num(r.delivered), on_time: num(r.on_time), late_open: num(r.late_open) })),
    byModel: byModel.map((r) => ({ ...r, open: num(r.open), total: num(r.total) })),
    recent,
  });
}
