import { NextResponse } from "next/server";
import { queryList } from "@/lib/db";
import { dealerScope } from "@/lib/clients";
import { guard } from "@/lib/guard";

/**
 * Portal del cliente de Honda (solo lectura): las unidades de todas sus tiendas, en qué etapa van y si llegan a tiempo.
 * El cliente se toma de la cuenta (users.client o, en cuentas antiguas, users.dealer_id), nunca de la URL.
 * GET /api/portal?tab=open|late|delivered|all&store=<id de una de sus tiendas>&q=&page=1
 */
const PAGE = 20;

export async function GET(req: Request) {
  const { s, err } = await guard(["dealer"]);
  if (err) return err;
  // Cliente de la cuenta: todas sus tiendas (o una sola, en cuentas antiguas de una tienda)
  const scope = await dealerScope(s.id);
  if (!scope) return NextResponse.json({ error: "Tu cuenta no tiene un cliente asignado. Avisa al administrador." }, { status: 404 });
  const stores = await queryList<{ id: number; name: string; department: string | null; district: string | null; coast: number }>(
    `SELECT id, name, department, district, coast FROM dealers WHERE ${scope.sql.replace("dealer_id", "id")} ORDER BY name`,
    scope.args,
  );
  if (!stores.length) return NextResponse.json({ error: "Tu cliente todavía no tiene tiendas." }, { status: 404 });

  const p = new URL(req.url).searchParams;
  const where = [scope.sql];
  const args: unknown[] = [...scope.args];
  // Filtro por tienda: solo entre las del cliente
  const asked = Number(p.get("store"));
  const store = stores.some((x) => x.id === asked) ? asked : 0; // una tienda de otro cliente se ignora
  if (store) { where.push("dealer_id = ?"); args.push(store); }
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
  // Resumen: de todas sus tiendas, o de la tienda elegida
  const sw = store ? `${scope.sql} AND dealer_id = ?` : scope.sql;
  const sargs = store ? [...scope.args, store] : scope.args;

  const [[stats], [{ total }], units] = await Promise.all([
    queryList<{ all: number; open: number; delivered: number; on_time: number; late: number; soon: number; next_eta: string | null }>(
      `SELECT COUNT(*) \`all\`, SUM(d_entrega IS NULL) open, SUM(d_entrega IS NOT NULL) delivered,
         SUM(d_entrega IS NOT NULL AND service = 'A TIEMPO') on_time,
         SUM(alert = 'VENCIDA') late, SUM(alert = 'POR VENCER') soon,
         MIN(IF(d_entrega IS NULL AND est_date >= CURDATE(), est_date, NULL)) next_eta
       FROM v_units WHERE ${sw}`,
      sargs,
    ),
    queryList<{ total: number }>(`SELECT COUNT(*) total FROM v_units WHERE ${w}`, args),
    queryList(
      `SELECT id, site, chassis, motor, material, category, guia, invoice, billing_date, status, est_date, service, days_left, alert,
         real_days, lead_time, via_lima, dealer, d_carga, d_zarpe, d_arribo, d_almacen, d_despacho, d_alm_lima, d_sal_lima, d_entrega
       FROM v_units WHERE ${w}
       ORDER BY d_entrega IS NOT NULL, IF(d_entrega IS NULL, days_left, NULL) ASC, d_entrega DESC, billing_date ASC, id ASC
       LIMIT ? OFFSET ?`,
      [...args, PAGE, (page - 1) * PAGE],
    ),
  ]);

  return NextResponse.json({
    client: scope.client ?? stores[0].name,
    stores,
    store: store || null,
    stats: Object.fromEntries(Object.entries(stats ?? {}).map(([k, v]) => [k, k === "next_eta" ? v : Number(v ?? 0)])),
    total: Number(total), page, size: PAGE, units,
  });
}
