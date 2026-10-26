import { NextResponse } from "next/server";
import { query, queryList } from "@/lib/db";
import { EVERYONE, getScope, guard } from "@/lib/guard";
import { seesAll } from "@/lib/workflow";
import { dealerScope } from "@/lib/clients";

/**
 * Alertas de unidades sin entregar: VENCIDA (pasó la fecha estimada) y POR VENCER (faltan pocos días),
 * y unidades fuera de tiempo sin motivo de demora.
 * Super admin / supervisor / solo lectura: todo. Dealer: sus unidades. Encargado: solo las que esperan sus etapas (y su empresa, si tiene).
 * ?list=1 devuelve además las unidades más urgentes.
 */
export async function GET(req: Request) {
  const { s, err } = await guard(EVERYONE);
  if (err) return err;
  const sup = seesAll(s.role);
  const dealer = s.role === "dealer";
  const scope = sup || dealer ? null : await getScope(s.id);
  if (scope && !scope.stages.length) return NextResponse.json({ total: 0, bySite: [], byStage: [], noReason: 0, alertDays: 2, units: [] });

  const where: string[] = ["alert IS NOT NULL"];
  const args: unknown[] = [];
  if (scope) {
    where.push(`(${scope.stages.map(() => "(site = ? AND next_step = ?)").join(" OR ")})`);
    args.push(...scope.stages.flatMap((st) => [st.site, st.field]));
    if (scope.carrier) { where.push("carrier = ?"); args.push(scope.carrier); }
  }
  // Dealer: solo las alertas de sus propias unidades
  if (dealer) {
    // Cliente de Honda: solo las alertas de sus tiendas
    const sc = await dealerScope(s.id);
    if (!sc) return NextResponse.json({ total: 0, bySite: [], byStage: [], noReason: 0, alertDays: 2, units: [] });
    where.push(sc.sql); args.push(...sc.args);
  }
  const w = where.join(" AND ");

  const [bySite, byStage, [noReason], [settings]] = await Promise.all([
    queryList<{ site: string; alert: string; n: number }>(`SELECT site, alert, COUNT(*) n FROM v_units WHERE ${w} GROUP BY site, alert`, args),
    queryList<{ site: string; next_step: string; alert: string; n: number }>(
      `SELECT site, next_step, alert, COUNT(*) n FROM v_units WHERE ${w} GROUP BY site, next_step, alert`, args,
    ),
    sup
      ? query<{ n: number }>("SELECT COUNT(*) n FROM v_units WHERE service = 'FUERA DE TIEMPO' AND delay_reason IS NULL")
      : Promise.resolve([{ n: 0 }]),
    query<{ alert_days: number }>("SELECT alert_days FROM settings WHERE id = 1"),
  ]);

  const units = new URL(req.url).searchParams.get("list")
    ? await queryList(
        `SELECT id, site, chassis, material, dealer, status, next_step, est_date, days_left, alert, delay_reason, carrier
         FROM v_units WHERE ${w} ORDER BY days_left ASC, id LIMIT 100`, args,
      )
    : [];

  const total = bySite.reduce((t, r) => t + Number(r.n), 0);
  return NextResponse.json({ total, bySite, byStage, noReason: Number(noReason?.n ?? 0), alertDays: settings?.alert_days ?? 2, units });
}
