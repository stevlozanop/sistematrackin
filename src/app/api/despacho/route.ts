import { NextResponse } from "next/server";
import { queryList, tx } from "@/lib/db";
import { getScope, guard } from "@/lib/guard";
import { isSite, type Site } from "@/lib/hsp";
import { isSuper, today } from "@/lib/workflow";

/**
 * 5. Despacho de almacén: se arma el viaje del camión con las guías que lleva, el chofer, la placa y la fecha
 *    → sus unidades pasan de «En almacén» a «Tránsito dealer» (fecha d_despacho) y quedan en ese viaje.
 *
 * GET  ?site=PCL               -> permisos, choferes conocidos y resumen de viajes recientes
 * GET  ?site=PCL&guia=…        -> unidades de esa guía listas para despachar
 * GET  ?site=PCL&trip=12       -> detalle del viaje: destino, dealer, factura, guía, cantidad y tipo
 * POST { action: "dispatch", site, guias: [], driver, plate, date, lateReason? }
 */

type Who = { id: number; role: string };
async function can(s: Who, site: Site) {
  if (isSuper(s.role as never)) return { ok: s.role === "admin", carrier: null as string | null };
  if (s.role !== "operator") return { ok: false, carrier: null };
  const sc = await getScope(s.id);
  return { ok: sc.stages.some((st) => st.site === site && st.field === "d_despacho"), carrier: sc.carrier };
}
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const text = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase().slice(0, max);
const num = (v: unknown) => Number(v ?? 0);

export async function GET(req: Request) {
  const { s, err } = await guard(["dev", "admin", "operator"]);
  if (err) return err;
  const p = new URL(req.url).searchParams;
  const site = p.get("site");
  if (!isSite(site)) return NextResponse.json({ error: "Módulo inválido" }, { status: 400 });
  const perm = await can(s, site);
  const scope = perm.carrier ? " AND carrier = ?" : "";
  const sargs = perm.carrier ? [perm.carrier] : [];

  const guia = p.get("guia")?.trim();
  if (guia) {
    const units = await queryList<{ id: number; district: string | null; dealer: string | null; category: string | null; status: string; next_step: string | null; need: number }>(
      `SELECT id, district, dealer, category, status, next_step, (est_date < CURDATE() AND delay_reason IS NULL) need FROM v_units WHERE site = ? AND guia = ?${scope}`,
      [site, guia, ...sargs]);
    if (!units.length) return NextResponse.json({ error: "No se encontró esa guía de remisión en este módulo" }, { status: 404 });
    const ready = units.filter((u) => u.next_step === "d_despacho");
    if (!ready.length) return NextResponse.json({ error: `Esa guía está en «${units[0].status}»: no hay unidades en almacén para despachar` }, { status: 409 });
    const uniq = (k: "district" | "dealer") => [...new Set(ready.map((u) => u[k]).filter(Boolean))].join(" · ");
    return NextResponse.json({
      guia, district: uniq("district"), dealer: uniq("dealer"),
      w2: ready.filter((u) => u.category === "2W").length, w3: ready.filter((u) => u.category === "3W").length, total: ready.length,
      need: ready.filter((u) => Number(u.need)).length, skipped: units.length - ready.length,
    });
  }

  const trip = Number(p.get("trip"));
  if (trip) {
    const rows = await queryList<{ guia: string | null; district: string | null; dealer: string | null; invoice: string | null; w2: number; w3: number; total: number; delivered: number }>(
      `SELECT guia, district, dealer, string_agg(DISTINCT invoice::text, ', ') invoice,
         SUM(category = '2W') w2, SUM(category = '3W') w3, COUNT(*) total, SUM(d_entrega IS NOT NULL) delivered
       FROM v_units WHERE dispatch_id = ? GROUP BY guia, district, dealer ORDER BY district, dealer, guia`, [trip]);
    return NextResponse.json({ rows: rows.map((r) => ({ ...r, w2: num(r.w2), w3: num(r.w3), total: num(r.total), delivered: num(r.delivered) })) });
  }

  const [trips, drivers] = await Promise.all([
    queryList<{ id: number; dispatched_on: string; driver: string; plate: string | null; destinos: string | null; dealers: string | null; w2: number; w3: number; total: number; delivered: number }>(
      `SELECT d.id, d.dispatched_on, d.driver, d.plate,
         string_agg(DISTINCT v.district::text, ', ') destinos, string_agg(DISTINCT v.dealer::text, ', ') dealers,
         SUM(v.category = '2W') w2, SUM(v.category = '3W') w3, COUNT(v.id) total, SUM(v.d_entrega IS NOT NULL) delivered
       FROM dispatches d JOIN v_units v ON v.dispatch_id = d.id
       WHERE d.site = ?${perm.carrier ? " AND v.carrier = ?" : ""}
       GROUP BY d.id, d.dispatched_on, d.driver, d.plate ORDER BY d.dispatched_on DESC, d.id DESC LIMIT 60`, [site, ...sargs]),
    queryList<{ v: string }>("SELECT DISTINCT driver v FROM dispatches WHERE site = ? ORDER BY v LIMIT 200", [site]),
  ]);
  return NextResponse.json({
    site, canDispatch: perm.ok, drivers: drivers.map((d) => d.v),
    trips: trips.map((t) => ({ ...t, w2: num(t.w2), w3: num(t.w3), total: num(t.total), delivered: num(t.delivered) })),
  });
}

export async function POST(req: Request) {
  const { s, err } = await guard(["admin", "operator"]);
  if (err) return err;
  const b = await req.json().catch(() => ({}));
  if (b.action !== "dispatch") return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  const site = b.site;
  if (!isSite(site)) return NextResponse.json({ error: "Módulo inválido" }, { status: 400 });
  const perm = await can(s, site);
  if (!perm.ok) return NextResponse.json({ error: "El despacho no es una etapa asignada a ti" }, { status: 403 });
  const date = day(b.date);
  if (!date) return NextResponse.json({ error: "Indica la fecha" }, { status: 400 });
  const driver = text(b.driver, 80), plate = text(b.plate, 20) || null;
  if (!driver) return NextResponse.json({ error: "Indica el chofer" }, { status: 400 });
  const guias = Array.isArray(b.guias) ? [...new Set(b.guias.map((g: unknown) => String(g).trim()).filter(Boolean))].slice(0, 200) : [];
  if (!guias.length) return NextResponse.json({ error: "Agrega al menos una guía" }, { status: 400 });
  const lateReason = typeof b.lateReason === "string" && b.lateReason.trim() ? b.lateReason.trim().toUpperCase().slice(0, 60) : null;

  const units = await queryList<{ id: number; d_almacen: string | null; est_date: string | null; delay_reason: string | null; driver: string | null }>(
    `SELECT id, d_almacen, est_date, delay_reason, driver FROM v_units WHERE site = ? AND guia IN (?) AND next_step = 'd_despacho'${perm.carrier ? " AND carrier = ?" : ""}`,
    perm.carrier ? [site, guias, perm.carrier] : [site, guias]);
  if (!units.length) return NextResponse.json({ error: "Esas guías no tienen unidades en almacén para despachar" }, { status: 409 });
  const prev = units.reduce((m, u) => (u.d_almacen && u.d_almacen > m ? u.d_almacen : m), "");
  if (prev && date < prev) return NextResponse.json({ error: `La fecha no puede ser anterior al ingreso a almacén (${prev})` }, { status: 400 });
  const late = units.filter((u) => u.est_date && !u.delay_reason && (date > u.est_date || today() > u.est_date));

  const id = await tx(async (q) => {
    const [d] = await q.query("INSERT INTO dispatches(site, driver, plate, dispatched_on, created_by) VALUES (?, ?, ?, ?, ?) RETURNING id", [site, driver, plate, date, s.id]);
    const did = (d as { id: number }[])[0].id;
    const ids = units.map((u) => u.id);
    for (let i = 0; i < ids.length; i += 1000) await q.query("UPDATE units SET d_despacho = ?, driver = ?, dispatch_id = ? WHERE id IN (?) AND d_despacho IS NULL", [date, driver, did, ids.slice(i, i + 1000)]);
    const ev: unknown[][] = units.flatMap((u) => [[u.id, s.id, "d_despacho", null, date], ...(u.driver !== driver ? [[u.id, s.id, "driver", u.driver, driver]] : [])]);
    if (late.length) {
      await q.query("UPDATE units SET delay_reason = ? WHERE id IN (?) AND delay_reason IS NULL", [lateReason, late.map((u) => u.id)]);
      ev.push(...late.map((u) => [u.id, s.id, "delay_reason", null, lateReason]));
    }
    for (let i = 0; i < ev.length; i += 1000) await q.query("INSERT INTO unit_events(unit_id, user_id, field, old_value, new_value) VALUES ?", [ev.slice(i, i + 1000)]);
    return did;
  });
  return NextResponse.json({ ok: true, id, units: units.length, late: late.length, driver });
}
