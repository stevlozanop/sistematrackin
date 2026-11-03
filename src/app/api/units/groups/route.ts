import { NextResponse } from "next/server";
import { queryList } from "@/lib/db";
import { getScope, guard, READ } from "@/lib/guard";
import { isSite } from "@/lib/hsp";
import { seesAll } from "@/lib/workflow";
import { unitFilters } from "@/lib/unit-filters";

const num = (v: unknown) => Number(v ?? 0);

/**
 * GET /api/units/groups?site=PCL&(mismos filtros que la tabla)&page=1
 * Vista «Por guía»: una fila por guía de remisión con sus motos, 2W/3W, dealers, nave, el paso en que va
 * (el más atrasado de sus unidades) y cuántas van tarde. 50 guías por página, las más recientes primero.
 */
export async function GET(req: Request) {
  const { s, err } = await guard(READ);
  if (err) return err;
  const p = new URL(req.url).searchParams;
  const site = p.get("site");
  if (!isSite(site)) return NextResponse.json({ error: "Módulo inválido" }, { status: 400 });
  const scope = seesAll(s.role) ? null : await getScope(s.id);
  if (scope && !scope.stages.some((st) => st.site === site)) return NextResponse.json({ error: "No tienes acceso a este módulo" }, { status: 403 });
  const { where, args } = unitFilters(p, site, scope);
  const w = where.join(" AND ");
  const size = 50;
  const page = Math.max(1, Number(p.get("page")) || 1);
  const [[{ total }], rows] = await Promise.all([
    queryList<{ total: number }>(`SELECT COUNT(DISTINCT COALESCE(guia, '')) total FROM v_units WHERE ${w}`, args),
    queryList<Record<string, unknown>>(
      `SELECT COALESCE(guia, '') guia, COUNT(*) n, SUM(category = '2W') w2, SUM(category = '3W') w3,
         string_agg(DISTINCT dealer::text, ' · ') dealers, string_agg(DISTINCT nave::text, ' · ') naves,
         DATE_FORMAT(MIN(billing_date), '%Y-%m-%d') billing, DATE_FORMAT(MIN(est_date), '%Y-%m-%d') est,
         SUM(service = 'FUERA DE TIEMPO') late, SUM(d_entrega IS NOT NULL) delivered,
         string_agg(DISTINCT status::text, ',') statuses, MAX(updated_at) touched
       FROM v_units WHERE ${w} GROUP BY COALESCE(guia, '') ORDER BY MAX(updated_at) DESC, guia DESC LIMIT ? OFFSET ?`,
      [...args, size, (page - 1) * size],
    ),
  ]);
  return NextResponse.json({
    total: num(total), size, page,
    groups: rows.map((r) => ({
      guia: r.guia as string, n: num(r.n), w2: num(r.w2), w3: num(r.w3), dealers: r.dealers as string | null, naves: r.naves as string | null,
      billing: r.billing as string | null, est: r.est as string | null, late: num(r.late), delivered: num(r.delivered),
      statuses: String(r.statuses ?? "").split(",").filter(Boolean),
    })),
  });
}
