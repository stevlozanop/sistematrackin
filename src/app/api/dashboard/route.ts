import { NextResponse } from "next/server";
import { queryList } from "@/lib/db";
import { guard, READ } from "@/lib/guard";

/**
 * GET /api/dashboard?year=2026&cl=3101,3106
 * Igual que la hoja TABLA del HSP-OFICIAL: unidades por mes de facturación × estado × nivel de servicio,
 * para PCL (filtrado por CL) y YUR.
 */
export async function GET(req: Request) {
  const { err } = await guard(READ);
  if (err) return err;
  const p = new URL(req.url).searchParams;

  const [years, centers, [settings]] = await Promise.all([
    queryList<{ v: number }>("SELECT DISTINCT YEAR(billing_date) v FROM units WHERE billing_date IS NOT NULL ORDER BY v DESC"),
    queryList<{ v: string }>("SELECT DISTINCT center v FROM units WHERE site='PCL' AND center IS NOT NULL ORDER BY v"),
    queryList<{ target: number }>("SELECT target FROM settings WHERE id=1"),
  ]);
  const year = Number(p.get("year")) || years[0]?.v || new Date().getFullYear();
  // "default" = como la TABLA del Excel: todos los CL de PCL menos 3114
  const rawCl = p.get("cl") ?? "default";
  const cl = rawCl === "default"
    ? centers.map((c) => c.v).filter((c) => c !== "3114")
    : rawCl.split(",").map((s) => s.trim()).filter(Boolean);

  const pclWhere = cl.length ? "AND center IN (?)" : "";
  const [pcl, yur, reasons] = await Promise.all([
    queryList<{ m: number; status: string; service: string | null; n: number }>(
      `SELECT MONTH(billing_date) m, status, service, COUNT(*) n FROM v_units
       WHERE site='PCL' AND YEAR(billing_date)=? ${pclWhere} GROUP BY m, status, service ORDER BY m ASC, status ASC, service ASC`,
      cl.length ? [year, cl] : [year],
    ),
    queryList<{ m: number; status: string; service: string | null; n: number }>(
      `SELECT MONTH(billing_date) m, status, service, COUNT(*) n FROM v_units
       WHERE site='YUR' AND YEAR(billing_date)=? GROUP BY m, status, service ORDER BY m ASC, status ASC, service ASC`,
      [year],
    ),
    queryList<{ site: string; reason: string | null; n: number }>(
      `SELECT site, delay_reason reason, COUNT(*) n FROM v_units
       WHERE YEAR(billing_date)=? AND service='FUERA DE TIEMPO' AND (site='YUR' OR ${cl.length ? "center IN (?)" : "1=1"})
       GROUP BY site, delay_reason ORDER BY n DESC, site ASC, delay_reason ASC`,
      cl.length ? [year, cl] : [year],
    ),
  ]);

  return NextResponse.json({
    year, years: years.map((r) => r.v), centers: centers.map((r) => r.v), cl,
    target: settings?.target ?? 85,
    pcl, yur, reasons,
  });
}
