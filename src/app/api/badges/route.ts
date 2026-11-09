import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { guard, READ } from "@/lib/guard";
import { licenseOfUser } from "@/lib/license";

/**
 * Contadores del menú de Leyva y de Honda (en vivo): unidades vencidas por ruta, por vencer,
 * fuera de tiempo sin motivo y personas conectadas.
 */
export async function GET() {
  const { s, err } = await guard(READ);
  if (err) return err;
  const [k] = await query<{ pcl: number; yur: number; soon: number; no_reason: number; online: number }>(
    `SELECT
       (SELECT COUNT(*) FROM v_units WHERE site = 'PCL' AND alert = 'VENCIDA')::int AS pcl,
       (SELECT COUNT(*) FROM v_units WHERE site = 'YUR' AND alert = 'VENCIDA')::int AS yur,
       (SELECT COUNT(*) FROM v_units WHERE alert = 'POR VENCER')::int AS soon,
       (SELECT COUNT(*) FROM v_units WHERE service = 'FUERA DE TIEMPO' AND delay_reason IS NULL)::int AS no_reason,
       (SELECT COUNT(*) FROM users WHERE role <> 'dev' AND last_seen > NOW() - INTERVAL 60 SECOND)::int AS online`,
  );
  // Licencia y pagos (solo la empresa): vencidos, por pagar y avisados
  let license = { overdue: 0, pending: 0, reported: 0 };
  if (s.role === "admin") {
    const lic = await licenseOfUser(s.id);
    if (lic.companyId) {
      const [p] = await query<{ overdue: number; pending: number; reported: number }>(
        `SELECT SUM(CASE WHEN status = 'pendiente' AND due_on < CURRENT_DATE THEN 1 ELSE 0 END)::int AS overdue,
                SUM(CASE WHEN status = 'pendiente' THEN 1 ELSE 0 END)::int AS pending,
                SUM(CASE WHEN status = 'reportado' THEN 1 ELSE 0 END)::int AS reported
         FROM license_payments WHERE company_id = ?`, [lic.companyId]).catch(() => []);
      license = { overdue: Number(p?.overdue ?? 0), pending: Number(p?.pending ?? 0), reported: Number(p?.reported ?? 0) };
    }
  }
  return NextResponse.json({
    license,
    pcl: Number(k?.pcl ?? 0), yur: Number(k?.yur ?? 0), soon: Number(k?.soon ?? 0),
    noReason: Number(k?.no_reason ?? 0), online: Number(k?.online ?? 0),
  });
}
