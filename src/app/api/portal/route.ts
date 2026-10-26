import { NextResponse } from "next/server";
import { query, queryList } from "@/lib/db";
import { guard } from "@/lib/guard";

/**
 * Portal del dealer (solo lectura): sus unidades, en qué etapa van y si llegan a tiempo.
 * El dealer se toma de la cuenta (users.dealer_id), nunca de la URL.
 * GET /api/portal?tab=open|delivered|all&q=&page=1
 */
const PAGE = 20;

export async function GET(req: Request) {
  const { s, err } = await guard(["dealer"]);
  if (err) return err;
  const [d] = await query<{ id: number; name: string; department: string | null; district: string | null; coast: number }>(
    "SELECT d.id, d.name, d.department, d.district, d.coast FROM users u JOIN dealers d ON d.id = u.dealer_id WHERE u.id = ?",
    [s.id],
  );
  if (!d) return NextResponse.json({ error: "Tu cuenta no tiene un dealer asignado. Avisa al administrador." }, { status: 404 });

  const p = new URL(req.url).searchParams;
  const where = ["dealer_id = ?"];
  const args: unknown[] = [d.id];
  const tab = p.get("tab") ?? "open";
  if (tab === "open") where.push("d_entrega IS NULL");
  if (tab === "delivered") where.push("d_entrega IS NOT NULL");
  if (tab === "late") where.push("d_entrega IS NULL AND alert = 'VENCIDA'");
  const q = (p.get("q") ?? "").trim();
  if (q) {
    where.push("(chassis LIKE ? OR motor LIKE ? OR material LIKE ? OR guia LIKE ? OR invoice LIKE ?)");
    args.push(...Array(5).fill(`%${q}%`));
  }
  const w = where.join(" AND ");
  const page = Math.max(1, Number(p.get("page")) || 1);

  const [[stats], [{ total }], units] = await Promise.all([
    query<{ all: number; open: number; delivered: number; on_time: number; late: number; soon: number; next_eta: string | null }>(
      `SELECT COUNT(*) \`all\`, SUM(d_entrega IS NULL) open, SUM(d_entrega IS NOT NULL) delivered,
         SUM(d_entrega IS NOT NULL AND service = 'A TIEMPO') on_time,
         SUM(alert = 'VENCIDA') late, SUM(alert = 'POR VENCER') soon,
         MIN(IF(d_entrega IS NULL AND est_date >= CURDATE(), est_date, NULL)) next_eta
       FROM v_units WHERE dealer_id = ?`,
      [d.id],
    ),
    queryList<{ total: number }>(`SELECT COUNT(*) total FROM v_units WHERE ${w}`, args),
    queryList(
      `SELECT id, site, chassis, motor, material, category, guia, invoice, billing_date, status, est_date, service, days_left, alert,
         real_days, lead_time, via_lima, d_carga, d_zarpe, d_arribo, d_almacen, d_despacho, d_alm_lima, d_sal_lima, d_entrega
       FROM v_units WHERE ${w}
       ORDER BY d_entrega IS NOT NULL, IF(d_entrega IS NULL, days_left, NULL) ASC, d_entrega DESC, billing_date DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...args, PAGE, (page - 1) * PAGE],
    ),
  ]);

  return NextResponse.json({
    dealer: d,
    stats: Object.fromEntries(Object.entries(stats ?? {}).map(([k, v]) => [k, k === "next_eta" ? v : Number(v ?? 0)])),
    total: Number(total), page, size: PAGE, units,
  });
}
