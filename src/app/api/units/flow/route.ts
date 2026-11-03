import { NextResponse } from "next/server";
import { queryList } from "@/lib/db";
import { getScope, guard, READ } from "@/lib/guard";
import { isSite } from "@/lib/hsp";
import { seesAll } from "@/lib/workflow";
import { unitFilters } from "@/lib/unit-filters";

const num = (v: unknown) => Number(v ?? 0);

/**
 * GET /api/units/flow?site=PCL&(mismos filtros que la tabla)
 * Para la ruta animada: cuántas motos hay en cada estación (estado) y cuántas van tarde o por vencer,
 * las naves que están cargando y las que van por el río (con su avance según los días reales de viaje).
 */
export async function GET(req: Request) {
  const { s, err } = await guard(READ);
  if (err) return err;
  const p = new URL(req.url).searchParams;
  const site = p.get("site");
  if (!isSite(site)) return NextResponse.json({ error: "Módulo inválido" }, { status: 400 });
  const scope = seesAll(s.role) ? null : await getScope(s.id);
  if (scope && !scope.stages.some((st) => st.site === site)) return NextResponse.json({ error: "No tienes acceso a este módulo" }, { status: 403 });
  // La ruta muestra todos los estados aunque en la tabla haya uno elegido
  const { where, args } = unitFilters(p, site, scope, ["status"]);
  const w = where.join(" AND ");

  const [stages, naves, [river]] = await Promise.all([
    queryList<{ status: string; n: number; late: number; soon: number; overdue: number; no_reason: number }>(
      `SELECT status, COUNT(*) n, SUM(service = 'FUERA DE TIEMPO') late, SUM(alert = 'POR VENCER') soon, SUM(alert = 'VENCIDA') overdue,
         SUM(service = 'FUERA DE TIEMPO' AND delay_reason IS NULL) no_reason
       FROM v_units WHERE ${w} GROUP BY status`,
      args,
    ),
    // Naves: cargando (embarque sin zarpe) o en el río (zarpó y aún no llega)
    queryList<{ nave: string; status: string; n: number; late: number; containers: number; since: string | null; days: number | null }>(
      `SELECT nave, status, COUNT(*) n, SUM(service = 'FUERA DE TIEMPO') late, COUNT(DISTINCT container_id) containers,
         DATE_FORMAT(MIN(CASE WHEN status = 'TRANSITO FLUVIAL' THEN d_zarpe ELSE d_carga END), '%Y-%m-%d') since,
         (CURRENT_DATE - MIN(CASE WHEN status = 'TRANSITO FLUVIAL' THEN d_zarpe ELSE d_carga END))::int days
       FROM v_units WHERE ${w} AND status IN ('EMBARQUE', 'TRANSITO FLUVIAL') AND nave IS NOT NULL AND nave <> ''
       GROUP BY nave, status ORDER BY days DESC`,
      args,
    ),
    // Días que tarda de verdad el río (zarpe → arribo), para ubicar cada nave en su tramo
    queryList<{ avg: number | null }>(
      "SELECT ROUND(AVG(d_arribo - d_zarpe)::numeric, 1) avg FROM units WHERE site = ? AND d_zarpe IS NOT NULL AND d_arribo IS NOT NULL AND d_arribo >= d_zarpe",
      [site],
    ),
  ]);
  const riverDays = num(river?.avg) || (site === "PCL" ? 5 : 3);
  return NextResponse.json({
    stages: Object.fromEntries(stages.map((x) => [x.status, { n: num(x.n), late: num(x.late), soon: num(x.soon), overdue: num(x.overdue), noReason: num(x.no_reason) }])),
    naves: naves.map((x) => ({
      nave: x.nave, status: x.status, n: num(x.n), late: num(x.late), containers: num(x.containers), since: x.since, days: num(x.days),
      progress: x.status === "TRANSITO FLUVIAL" ? Math.min(0.95, Math.max(0.05, num(x.days) / riverDays)) : 0,
    })),
    riverDays,
  });
}
