import { NextResponse } from "next/server";
import { queryList } from "@/lib/db";
import { guard, READ } from "@/lib/guard";
import { isSite } from "@/lib/hsp";

/**
 * Detalle del tablero: unidades por distrito y dealer, separadas en 2W (motos, 2 llantas) y 3W (motokares, 3 llantas).
 * GET /api/board/detail?site=YUR&year=2026[&m=10][&service=A TIEMPO][&status=ENTREGADO][&delivered=1]
 */
export async function GET(req: Request) {
  const { err } = await guard(READ);
  if (err) return err;
  const p = new URL(req.url).searchParams;
  const site = p.get("site");
  const year = Number(p.get("year"));
  if (!isSite(site) || !year) return NextResponse.json({ error: "Faltan la ruta y el año" }, { status: 400 });

  const where = ["site = ?", "YEAR(billing_date) = ?"];
  const args: unknown[] = [site, year];
  const m = Number(p.get("m"));
  if (m >= 1 && m <= 12) { where.push("MONTH(billing_date) = ?"); args.push(m); }
  const service = p.get("service");
  if (service === "A TIEMPO" || service === "FUERA DE TIEMPO") { where.push("service = ?"); args.push(service); }
  const status = p.get("status");
  if (status) { where.push("status = ?"); args.push(status.toUpperCase()); }
  if (p.get("delivered") === "1") where.push("d_entrega IS NOT NULL");
  if (p.get("delivered") === "0") where.push("d_entrega IS NULL");

  const rows = await queryList<{ district: string | null; dealer: string | null; w2: number; w3: number; total: number }>(
    `SELECT COALESCE(district, 'SIN DISTRITO') district, COALESCE(dealer, 'SIN DEALER') dealer,
       SUM(category = '2W') w2, SUM(category = '3W') w3, COUNT(*) total
     FROM v_units WHERE ${where.join(" AND ")}
     GROUP BY 1, 2 ORDER BY 1 ASC, total DESC, 2 ASC`,
    args,
  );

  // Distritos ordenados de mayor a menor, cada uno con sus dealers
  const map = new Map<string, { district: string; w2: number; w3: number; total: number; dealers: { dealer: string; w2: number; w3: number; total: number }[] }>();
  for (const r of rows) {
    const d = map.get(r.district!) ?? { district: r.district!, w2: 0, w3: 0, total: 0, dealers: [] };
    const w2 = Number(r.w2 ?? 0), w3 = Number(r.w3 ?? 0), total = Number(r.total);
    d.w2 += w2; d.w3 += w3; d.total += total;
    d.dealers.push({ dealer: r.dealer!, w2, w3, total });
    map.set(r.district!, d);
  }
  const districts = [...map.values()].sort((a, b) => b.total - a.total || a.district.localeCompare(b.district));
  return NextResponse.json({
    districts,
    totals: districts.reduce((t, d) => ({ w2: t.w2 + d.w2, w3: t.w3 + d.w3, total: t.total + d.total }), { w2: 0, w3: 0, total: 0 }),
  });
}
