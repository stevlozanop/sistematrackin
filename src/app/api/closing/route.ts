import { NextResponse } from "next/server";
import { queryList } from "@/lib/db";
import { guard, READ } from "@/lib/guard";

/**
 * Cierre de mes (FIFO): por mes de facturación, cuántas unidades siguen sin entregar.
 * Regla de Leyva: se cierra primero lo más antiguo; en octubre, septiembre ya debe estar cerrado.
 * - «Cerrado»: todas entregadas.
 * - «Debe cerrarse»: es un mes anterior al actual y todavía tiene unidades sin entregar.
 * - «En curso»: el mes actual.
 * También devuelve las unidades sin entregar más antiguas (las primeras que hay que cerrar).
 */
export async function GET() {
  const { err } = await guard(READ);
  if (err) return err;
  const [months, oldest] = await Promise.all([
    queryList<{ ym: string; total: number; delivered: number; open: number; late: number; pcl: number; yur: number }>(
      `SELECT DATE_FORMAT(billing_date, '%Y-%m') ym, COUNT(*) total, SUM(d_entrega IS NOT NULL) delivered,
         SUM(d_entrega IS NULL) open, SUM(alert = 'VENCIDA') late,
         SUM(d_entrega IS NULL AND site = 'PCL') pcl, SUM(d_entrega IS NULL AND site = 'YUR') yur
       FROM v_units WHERE billing_date IS NOT NULL
       GROUP BY ym
       HAVING open > 0 OR ym >= DATE_FORMAT(CURDATE() - INTERVAL 3 MONTH, '%Y-%m')
       ORDER BY ym`,
    ),
    queryList(
      `SELECT id, site, chassis, dealer, status, billing_date, est_date, DATEDIFF(CURDATE(), billing_date) age
       FROM v_units WHERE d_entrega IS NULL AND billing_date IS NOT NULL
       ORDER BY billing_date, id LIMIT 8`,
    ),
  ]);
  const d = new Date(); // mes actual en la hora del servidor (Perú)
  const current = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return NextResponse.json({
    current,
    months: months.map((m) => {
      const open = Number(m.open);
      return {
        ...m, total: Number(m.total), delivered: Number(m.delivered), open, late: Number(m.late), pcl: Number(m.pcl), yur: Number(m.yur),
        state: open === 0 ? "closed" : m.ym < current ? "overdue" : "current",
      };
    }),
    oldest,
  });
}
