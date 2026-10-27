import { NextResponse } from "next/server";
import { queryList } from "@/lib/db";
import { guard, READ } from "@/lib/guard";

/**
 * Tablero de Honda (por año de facturación), por ruta (PCL Pucallpa · YUR Yurimaguas) y mes:
 * - months: facturadas, entregadas, a tiempo, medidas (con plazo) y días promedio de demora de las fuera de tiempo
 * - reasons: motivos de demora de las unidades fuera de tiempo
 * - transit: unidades por estado, separadas en a tiempo / fuera de tiempo (tabla «Tránsito»)
 * GET /api/board?year=2026
 */
export async function GET(req: Request) {
  const { err } = await guard(READ);
  if (err) return err;

  const years = await queryList<{ v: number }>(
    "SELECT DISTINCT YEAR(billing_date) v FROM units WHERE billing_date IS NOT NULL ORDER BY v DESC",
  );
  const asked = Number(new URL(req.url).searchParams.get("year"));
  const year = years.some((y) => y.v === asked) ? asked : years[0]?.v ?? new Date().getFullYear();

  const [months, reasons, transit, [settings]] = await Promise.all([
    queryList<{ site: string; m: number; total: number; delivered: number; on_time: number; measured: number; delay: number | null }>(
      `SELECT site, MONTH(billing_date) m, COUNT(*) total, SUM(d_entrega IS NOT NULL) delivered,
         SUM(service = 'A TIEMPO') on_time, SUM(service IS NOT NULL) measured,
         ROUND(AVG(CASE WHEN service = 'FUERA DE TIEMPO' THEN DATEDIFF(COALESCE(d_entrega, CURDATE()), est_date) END), 1) delay
       FROM v_units WHERE YEAR(billing_date) = ?
       GROUP BY site, m ORDER BY site ASC, m ASC`,
      [year],
    ),
    queryList<{ site: string; m: number; reason: string; n: number }>(
      `SELECT site, MONTH(billing_date) m, COALESCE(delay_reason, 'SIN MOTIVO') reason, COUNT(*) n
       FROM v_units WHERE YEAR(billing_date) = ? AND service = 'FUERA DE TIEMPO'
       GROUP BY site, m, reason ORDER BY site ASC, m ASC, n DESC`,
      [year],
    ),
    queryList<{ site: string; m: number; service: string | null; status: string; n: number }>(
      `SELECT site, MONTH(billing_date) m, service, status, COUNT(*) n
       FROM v_units WHERE YEAR(billing_date) = ?
       GROUP BY site, m, service, status ORDER BY site ASC, m ASC, service ASC, status ASC`,
      [year],
    ),
    queryList<{ target: number }>("SELECT target FROM settings WHERE id = 1"),
  ]);

  return NextResponse.json({ year, years: years.map((y) => y.v), target: settings?.target ?? 85, months, reasons, transit });
}
