import { NextResponse } from "next/server";
import { queryList } from "@/lib/db";
import { guard } from "@/lib/guard";
import { reportScope } from "@/lib/report";

/**
 * Datos del reporte para la versión imprimible (la que Honda le entrega a su supervisor).
 * Mismos filtros que el Excel: ?from=&to= (meses de facturación) · ?site= · ?client=
 */
export async function GET(req: Request) {
  const { s, err } = await guard(["dev", "admin", "viewer", "dealer"]);
  if (err) return err;
  const sc = await reportScope(s, new URL(req.url).searchParams);
  if (!sc) return NextResponse.json({ error: "Tu cuenta no tiene un cliente asignado" }, { status: 404 });
  const { where: w, args: a } = sc;
  const vw = w.replace(/\bdealer_id\b/g, "v.dealer_id").replace(/\bbilling_date\b/g, "v.billing_date").replace(/\bsite\b/g, "v.site");

  const [[t], byMonth, byStatus, byClient, oldest, [target]] = await Promise.all([
    queryList<Record<string, number | null>>(
      `SELECT COUNT(*) total, SUM(d_entrega IS NOT NULL) delivered, SUM(d_entrega IS NULL) open,
         SUM(service='A TIEMPO') on_time, SUM(service='FUERA DE TIEMPO') late, SUM(alert='VENCIDA') overdue,
         ROUND(AVG(IF(d_entrega IS NOT NULL, real_days, NULL))) avg_days
       FROM v_units WHERE ${w}`, a,
    ),
    queryList<{ ym: string; total: number; delivered: number; open: number; on_time: number; late: number }>(
      `SELECT DATE_FORMAT(billing_date,'%Y-%m') ym, COUNT(*) total, SUM(d_entrega IS NOT NULL) delivered, SUM(d_entrega IS NULL) open,
         SUM(service='A TIEMPO') on_time, SUM(service='FUERA DE TIEMPO') late
       FROM v_units WHERE ${w} GROUP BY ym ORDER BY ym`, a,
    ),
    queryList<{ status: string; n: number; overdue: number }>(
      `SELECT status, COUNT(*) n, SUM(alert='VENCIDA') overdue FROM v_units WHERE ${w} AND d_entrega IS NULL GROUP BY status ORDER BY status ASC`, a,
    ),
    queryList<{ client: string | null; total: number; open: number; on_time: number }>(
      `SELECT d.client, COUNT(*) total, SUM(v.d_entrega IS NULL) open, SUM(v.service='A TIEMPO') on_time
       FROM v_units v LEFT JOIN dealers d ON d.id = v.dealer_id WHERE ${vw}
       GROUP BY d.client ORDER BY total DESC, d.client ASC LIMIT 15`, a,
    ),
    queryList(
      `SELECT site, chassis, guia, dealer, status, billing_date, est_date, DATEDIFF(CURDATE(), billing_date) age, delay_reason
       FROM v_units WHERE ${w} AND d_entrega IS NULL ORDER BY billing_date, id LIMIT 10`, a,
    ),
    queryList<{ target: number }>("SELECT target FROM settings WHERE id = 1"),
  ]);
  const n = (v: unknown) => Number(v ?? 0);
  return NextResponse.json({
    title: sc.title, filters: sc.filters, generatedAt: new Date().toISOString(), target: n(target?.target ?? 85),
    totals: { total: n(t?.total), delivered: n(t?.delivered), open: n(t?.open), onTime: n(t?.on_time), late: n(t?.late), overdue: n(t?.overdue), avgDays: t?.avg_days ?? null },
    byMonth: byMonth.map((m) => ({ ...m, total: n(m.total), delivered: n(m.delivered), open: n(m.open), on_time: n(m.on_time), late: n(m.late) })),
    byStatus: byStatus.map((r) => ({ ...r, n: n(r.n), overdue: n(r.overdue) })),
    byClient: byClient.map((c) => ({ ...c, total: n(c.total), open: n(c.open), on_time: n(c.on_time) })),
    oldest,
  });
}
