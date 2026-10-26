import { NextResponse } from "next/server";
import { queryList, tx } from "@/lib/db";
import { guard, READ } from "@/lib/guard";
import { isSite } from "@/lib/hsp";

type LeadTime = { site: string; zone: string; days_cre: number; days_vac: number };

/** Plazos por zona, meta y meses de creciente, + zonas que tienen unidades pero aún no tienen plazo. */
export async function GET() {
  const { err } = await guard(READ);
  if (err) return err;
  const [[settings], leadTimes, missing] = await Promise.all([
    queryList<{ target: number; creciente_months: string; alert_days: number }>("SELECT target, creciente_months, alert_days FROM settings WHERE id=1"),
    queryList<LeadTime & { units: number }>(
      `SELECT lt.*, COALESCE(c.n, 0) units FROM lead_times lt
       LEFT JOIN (SELECT site, IF(site='PCL', department, route) zone, COUNT(*) n FROM units GROUP BY site, zone) c
         ON c.site = lt.site AND c.zone = lt.zone
       ORDER BY lt.site, lt.zone`,
    ),
    queryList<{ site: string; zone: string; units: number }>(
      `SELECT c.site, c.zone, c.n units FROM
         (SELECT site, IF(site='PCL', department, route) zone, COUNT(*) n FROM units GROUP BY site, zone) c
       LEFT JOIN lead_times lt ON lt.site = c.site AND lt.zone = c.zone
       WHERE lt.zone IS NULL AND c.zone IS NOT NULL ORDER BY units DESC`,
    ),
  ]);
  return NextResponse.json({
    target: settings?.target ?? 85,
    alertDays: settings?.alert_days ?? 2,
    creciente: (settings?.creciente_months ?? "").split(",").filter(Boolean).map(Number),
    leadTimes,
    missing,
  });
}

/** PUT { target, creciente: number[], leadTimes: LeadTime[] } — reemplaza la configuración completa. */
export async function PUT(req: Request) {
  const { err } = await guard(["admin"]); // plazos y meta: los cambia la empresa (The Iceberg Labs solo mira)
  if (err) return err;
  const body = await req.json().catch(() => null);
  const target = Number(body?.target);
  const alertDays = Number(body?.alertDays ?? 2);
  if (!(alertDays >= 0 && alertDays <= 30)) return NextResponse.json({ error: "Días de aviso inválidos (0 a 30)" }, { status: 400 });
  const creciente = Array.isArray(body?.creciente) ? body.creciente.map(Number).filter((m: number) => m >= 1 && m <= 12) : null;
  const list = Array.isArray(body?.leadTimes) ? (body.leadTimes as LeadTime[]) : null;
  if (!(target >= 1 && target <= 100) || !creciente || !list) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const rows = list.map((l) => ({
    site: l.site, zone: String(l.zone ?? "").trim().toUpperCase(),
    cre: Math.round(Number(l.days_cre)), vac: Math.round(Number(l.days_vac)),
  }));
  const bad = rows.find((r) => !isSite(r.site) || !r.zone || !(r.cre >= 0 && r.cre < 365) || !(r.vac >= 0 && r.vac < 365));
  if (bad) return NextResponse.json({ error: `Plazo inválido en ${bad.site} · ${bad.zone || "(sin zona)"}` }, { status: 400 });
  const keys = new Set<string>();
  for (const r of rows) {
    const k = `${r.site}|${r.zone}`;
    if (keys.has(k)) return NextResponse.json({ error: `Zona repetida: ${r.site} · ${r.zone}` }, { status: 400 });
    keys.add(k);
  }

  await tx(async (c) => {
    await c.query("UPDATE settings SET target=?, alert_days=?, creciente_months=? WHERE id=1", [target, alertDays, [...new Set(creciente)].sort((a, b) => (a as number) - (b as number)).join(",")]);
    await c.query("DELETE FROM lead_times");
    if (rows.length) await c.query("INSERT INTO lead_times(site, zone, days_cre, days_vac) VALUES ?", [rows.map((r) => [r.site, r.zone, r.cre, r.vac])]);
  });
  return NextResponse.json({ ok: true });
}
