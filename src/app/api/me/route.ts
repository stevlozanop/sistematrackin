import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getScope, guard } from "@/lib/guard";
import { isSuper, pendingSql } from "@/lib/workflow";

/** Usuario actual: etapas, área, empresa, pendientes por etapa y lo que registró hoy. */
export async function GET() {
  const { s, err } = await guard();
  if (err) return err;
  const scope = await getScope(s.id);
  const carrierSql = scope.carrier ? " AND carrier = ?" : "";
  const pending = await Promise.all(
    scope.stages.map(async (st) => {
      const [r] = await query<{ n: number }>(
        `SELECT COUNT(*) n FROM v_units WHERE site = ? AND (${pendingSql(st.site, st.field)})${carrierSql}`,
        scope.carrier ? [st.site, scope.carrier] : [st.site],
      );
      return { ...st, pending: Number(r?.n ?? 0) };
    }),
  );
  const today = isSuper(s.role) ? [] : await query(
    `SELECT e.id, DATE_FORMAT(e.at,'%H:%i') at, e.field, e.new_value, u.site, u.chassis
     FROM unit_events e JOIN units u ON u.id = e.unit_id
     WHERE e.user_id = ? AND e.at >= CURDATE() ORDER BY e.id DESC LIMIT 30`,
    [s.id],
  );
  // Quien registra el despacho de PCL elige la empresa de transporte: le pasamos las conocidas
  const dispatches = scope.stages.some((st) => st.site === "PCL" && st.field === "d_despacho");
  const carriers = dispatches
    ? (await query<{ v: string }>("SELECT DISTINCT UPPER(carrier) v FROM units WHERE carrier IS NOT NULL AND carrier <> '' ORDER BY v")).map((r) => r.v)
    : [];
  return NextResponse.json({
    id: s.id, name: s.name, role: s.role,
    area: scope.area, carrier: scope.carrier, canImport: scope.canImport,
    stages: scope.stages, pending, today, carriers,
  });
}
