import { NextResponse } from "next/server";
import { query, queryList, tx } from "@/lib/db";
import { getScope, guard } from "@/lib/guard";
import { isSite, type Site } from "@/lib/hsp";
import { dealerScope } from "@/lib/clients";
import { isSuper, today } from "@/lib/workflow";
import { notifyDelivered, notifyObservation, notifyReceived, pushLater } from "@/lib/push";
import { CARRIER_OK, FIRST_DELIVERY, LATEST_RECEPTION, missingCarrier } from "@/lib/checks";

/**
 * 6. Entrega al dealer, desde dos lados:
 * - Conductor: busca su nombre, ve lo que lleva (guías en «Tránsito dealer») y marca lo que entregó → «Entregado».
 * - Dealer: busca su guía y confirma la recepción: completa o con observación (la empresa revisa las observaciones).
 *
 * GET  ?site=PCL&driver=VIDAL           -> guías que lleva ese chofer y aún no entrega
 * GET  ?site=PCL&drivers=1              -> choferes con entregas pendientes
 * GET  ?guia=…                          -> la guía para el dealer: tipo, dealer, total, estado y recepciones
 * GET  ?observations=1                  -> recepciones con observación (empresa)
 * GET  ?site=PCL&report=1&from&to       -> detalle de entregas: origen, distrito, dealer, guía, chofer, entregado
 * POST { action: "deliver", site, guias: [], date, lateReason? }
 * GET  ?pending=1                      -> guías despachadas que el dealer aún no confirma
 * GET  ?received=1&q=&only=one         -> historial de entregas con doble check (✓ transportista · ✓✓ cliente); only=one: solo las de un check
 * POST { action: "receive", guia | guias: [], kind: "completo" | "observacion", note?, date }
 * POST { action: "review", id }
 */

type Who = { id: number; role: string };
async function canDeliver(s: Who, site: Site) {
  if (isSuper(s.role as never)) return { ok: s.role === "admin", carrier: null as string | null };
  if (s.role !== "operator") return { ok: false, carrier: null };
  const sc = await getScope(s.id);
  return { ok: sc.stages.some((st) => st.site === site && st.field === "d_entrega"), carrier: sc.carrier };
}
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const num = (v: unknown) => Number(v ?? 0);



export async function GET(req: Request) {
  const { s, err } = await guard(["admin", "operator", "dealer", "viewer"]);
  if (err) return err;
  const p = new URL(req.url).searchParams;

  // Detalle de entregas: cada guía despachada con su origen, distrito de destino, dealer, chofer y si ya se entregó
  if (p.get("report")) {
    if (s.role === "dealer") return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    const site = p.get("site");
    if (!isSite(site)) return NextResponse.json({ error: "Módulo inválido" }, { status: 400 });
    const scope = s.role === "operator" ? (await getScope(s.id)).carrier : null;
    const where = ["v.site = ?", "v.d_despacho IS NOT NULL"];
    const args: unknown[] = [site];
    const from = day(p.get("from")), to = day(p.get("to"));
    if (from) { where.push("v.d_despacho >= ?"); args.push(from); }
    if (to) { where.push("v.d_despacho <= ?"); args.push(to); }
    if (scope) { where.push("v.carrier = ?"); args.push(scope); }
    const rows = await queryList<{
      trip: number | null; origin: string; department: string | null; district: string | null; dealer: string | null; guia: string | null;
      driver: string | null; plate: string | null; dispatched: string; delivered_on: string | null; w2: number; w3: number; total: number; delivered: number; via_lima: number;
    }>(
      `SELECT v.dispatch_id trip, CASE WHEN v.via_lima = 1 THEN 'Lima' ELSE ? END origin, v.department, v.district, v.dealer, v.guia,
         COALESCE(d.driver, v.driver) driver, d.plate, MIN(v.d_despacho) dispatched, MAX(v.d_entrega) delivered_on,
         SUM(v.category = '2W') w2, SUM(v.category = '3W') w3, COUNT(*) total, SUM(v.d_entrega IS NOT NULL) delivered, MAX(v.via_lima) via_lima
       FROM v_units v LEFT JOIN dispatches d ON d.id = v.dispatch_id
       WHERE ${where.join(" AND ")}
       GROUP BY v.dispatch_id, v.via_lima, v.department, v.district, v.dealer, v.guia, COALESCE(d.driver, v.driver), d.plate
       ORDER BY MIN(v.d_despacho) DESC, v.department, v.district, v.dealer, v.guia LIMIT 2000`,
      [site === "PCL" ? "Pucallpa" : "Yurimaguas", ...args],
    );
    // Lo último que confirmó el dealer de cada guía
    const guias = [...new Set(rows.map((r) => r.guia).filter(Boolean))] as string[];
    const recs = guias.length ? await queryList<{ guia: string; kind: string; note: string | null; received_on: string }>(
      `SELECT DISTINCT ON (guia) guia, kind, note, received_on FROM receptions WHERE site = ? AND guia IN (?) ORDER BY guia, created_at DESC`, [site, guias]) : [];
    const rec = new Map(recs.map((r) => [r.guia, r]));
    return NextResponse.json({
      rows: rows.map((r) => ({ ...r, w2: num(r.w2), w3: num(r.w3), total: num(r.total), delivered: num(r.delivered), via_lima: num(r.via_lima), reception: (r.guia && rec.get(r.guia)) || null })),
    });
  }
  if (s.role === "viewer") return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  if (p.get("observations")) {
    if (s.role !== "admin") return NextResponse.json({ error: "Solo la empresa revisa las observaciones" }, { status: 403 });
    const rows = await queryList(
      `SELECT r.id, r.site, r.guia, r.note, r.received_on, r.units, r.created_at, u.name usuario,
         (SELECT string_agg(DISTINCT v.dealer::text, ', ') FROM v_units v WHERE v.site = r.site AND v.guia = r.guia) dealer
       FROM receptions r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.kind = 'observacion' AND r.reviewed_at IS NULL ORDER BY r.created_at DESC LIMIT 100`);
    return NextResponse.json({ rows });
  }

  // Recepción: guías despachadas que aún no se confirman, y el historial de lo ya recibido
  if (p.get("pending") || p.get("received")) {
    const sc = s.role === "dealer" ? await dealerScope(s.id) : null;
    if (s.role === "dealer" && !sc) return NextResponse.json({ error: "Tu cuenta no tiene tiendas asignadas" }, { status: 403 });
    if (p.get("pending")) {
      const rows = await queryList<{ guia: string; site: string; dealer: string | null; district: string | null; driver: string | null; dispatched: string; w2: number; w3: number; total: number }>(
        `SELECT guia, MAX(site) site, MAX(dealer) dealer, MAX(district) district, MAX(driver) driver, MAX(d_despacho) dispatched,
           SUM(category = '2W') w2, SUM(category <> '2W' OR category IS NULL) w3, COUNT(*) total
         FROM v_units WHERE guia IS NOT NULL AND d_despacho IS NOT NULL AND guia NOT IN (SELECT guia FROM receptions WHERE guia IS NOT NULL)${sc ? ` AND ${sc.sql}` : ""}
         GROUP BY guia ORDER BY MAX(dealer), guia LIMIT 500`, sc?.args ?? []);
      return NextResponse.json({ rows: rows.map((r) => ({ ...r, w2: num(r.w2), w3: num(r.w3), total: num(r.total) })) });
    }
    // Historial de entregas con doble check: ✓ el transportista registró la entrega · ✓✓ el cliente confirmó lo recibido.
    // El 1.er check vale si la entrega se registró antes que la recepción (o la registró otra persona); si el cliente
    // confirmó sin que el transportista haya registrado nada, ese check queda vacío.
    const q = (p.get("q") ?? "").trim().slice(0, 60);
    const where = ["v.guia IS NOT NULL", "(v.d_entrega IS NOT NULL OR v.guia IN (SELECT guia FROM receptions))"];
    const args: unknown[] = [];
    if (sc) { where.push(`v.${sc.sql}`); args.push(...sc.args); }
    if (s.role === "operator") { const c = (await getScope(s.id)).carrier; if (c) { where.push("v.carrier = ?"); args.push(c); } }
    if (q) { where.push("(v.guia ILIKE ? OR v.dealer ILIKE ? OR v.district ILIKE ? OR v.driver ILIKE ?)"); args.push(...Array(4).fill(`%${q}%`)); }
    const only = p.get("only");
    if (only === "one") where.push("v.guia NOT IN (SELECT guia FROM receptions)");
    const rows = await queryList<{
      guia: string; site: string; dealer: string | null; district: string | null; driver: string | null; delivered_on: string | null; total: number; w2: number; w3: number;
      kind: string | null; note: string | null; received_on: string | null; received_by: string | null; delivered_by: string | null; carrier_check: boolean;
    }>(
      `WITH g AS (
         SELECT v.guia, MAX(v.site) site, MAX(v.dealer) dealer, MAX(v.district) district, MAX(v.driver) driver, MAX(v.d_entrega) delivered_on,
           COUNT(*) total, SUM(v.category = '2W') w2, SUM(v.category <> '2W' OR v.category IS NULL) w3, array_agg(v.id) ids
         FROM v_units v WHERE ${where.join(" AND ")}
         GROUP BY v.guia ORDER BY MAX(v.d_entrega) DESC NULLS LAST, v.guia LIMIT 150)
       SELECT g.guia, g.site, g.dealer, g.district, g.driver, g.delivered_on, g.total, g.w2, g.w3,
         r.kind, r.note, r.received_on, ru.name received_by, eu.name delivered_by,
         (${CARRIER_OK}) carrier_check
       FROM g
       ${LATEST_RECEPTION}
       LEFT JOIN users ru ON ru.id = r.user_id
       ${FIRST_DELIVERY}
       LEFT JOIN users eu ON eu.id = e.user_id
       ORDER BY COALESCE(g.delivered_on, r.received_on) DESC, g.guia`, args);
    return NextResponse.json({ rows: rows.map((r) => ({ ...r, total: num(r.total), w2: num(r.w2), w3: num(r.w3), carrier_check: !!r.carrier_check && r.carrier_check !== ("f" as never) })) });
  }

  // Dealer: su guía
  const guia = p.get("guia")?.trim();
  if (guia) {
    const sc = s.role === "dealer" ? await dealerScope(s.id) : null;
    if (s.role === "dealer" && !sc) return NextResponse.json({ error: "Tu cuenta no tiene tiendas asignadas" }, { status: 403 });
    const units = await queryList<{ site: string; category: string | null; dealer: string | null; district: string | null; status: string; next_step: string | null; d_despacho: string | null; d_entrega: string | null; driver: string | null }>(
      `SELECT site, category, dealer, district, status, next_step, d_despacho, d_entrega, driver FROM v_units WHERE guia = ?${sc ? ` AND ${sc.sql}` : ""}`,
      [guia, ...(sc?.args ?? [])]);
    if (!units.length) return NextResponse.json({ error: "No se encontró esa guía de remisión" }, { status: 404 });
    const recs = await queryList("SELECT kind, note, received_on, created_at FROM receptions WHERE guia = ? ORDER BY created_at DESC", [guia]);
    const uniq = (k: "dealer" | "district" | "status" | "driver") => [...new Set(units.map((u) => u[k]).filter(Boolean))].join(" · ");
    const w2 = units.filter((u) => u.category === "2W").length;
    return NextResponse.json({
      guia, site: units[0].site, dealer: uniq("dealer"), district: uniq("district"), status: uniq("status"), driver: uniq("driver"),
      tipo: w2 && units.length - w2 ? "2W y 3W" : w2 ? "2W" : "3W", w2, w3: units.length - w2, total: units.length,
      pending: units.filter((u) => u.next_step === "d_entrega").length, delivered: units.filter((u) => u.d_entrega).length,
      dispatched: units.filter((u) => u.d_despacho).length, last: units.reduce((m, u) => (u.d_despacho && u.d_despacho > m ? u.d_despacho : m), ""),
      receptions: recs,
    });
  }

  const site = p.get("site");
  if (!isSite(site)) return NextResponse.json({ error: "Módulo inválido" }, { status: 400 });
  if (s.role === "dealer") return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const perm = await canDeliver(s, site);
  const scope = perm.carrier ? " AND carrier = ?" : "";
  const sargs = perm.carrier ? [perm.carrier] : [];

  if (p.get("drivers")) {
    // Lo que falta entregar, y lo que el cliente ya recibió sin el registro del transportista
    const missing = await missingCarrier(`site = ? AND driver IS NOT NULL${scope}`, [site, ...sargs]);
    const rows = await queryList<{ v: string; n: number }>(
      `SELECT driver v, COUNT(*) n FROM v_units WHERE site = ? AND d_despacho IS NOT NULL AND driver IS NOT NULL${scope}
         AND (next_step = 'd_entrega'${missing.length ? " OR guia IN (?)" : ""}) GROUP BY driver ORDER BY driver`, [site, ...sargs, ...(missing.length ? [missing] : [])]);
    return NextResponse.json({ canDeliver: perm.ok, drivers: rows.map((r) => ({ name: r.v, units: num(r.n) })) });
  }

  const driver = p.get("driver")?.trim();
  if (!driver) return NextResponse.json({ error: "Escribe el nombre del conductor" }, { status: 400 });
  // También las guías que el cliente ya recibió sin que el transportista registrara su entrega (para completar el doble check)
  const missing = await missingCarrier(`site = ? AND driver ILIKE ?${scope}`, [site, `%${driver}%`, ...sargs]);
  const rows = await queryList<{ guia: string | null; district: string | null; department: string | null; via_lima: number; dealer: string | null; driver: string; w2: number; w3: number; total: number; dispatched: string; need: number; received: number }>(
    `SELECT guia, district, department, MAX(via_lima) via_lima, dealer, driver, SUM(category = '2W') w2, SUM(category = '3W') w3, COUNT(*) total, MAX(d_despacho) dispatched,
       SUM(next_step = 'd_entrega' AND est_date < CURDATE() AND delay_reason IS NULL) need, SUM(d_entrega IS NOT NULL) received
     FROM v_units WHERE site = ? AND d_despacho IS NOT NULL AND driver ILIKE ?${scope}
       AND (next_step = 'd_entrega'${missing.length ? " OR guia IN (?)" : ""})
     GROUP BY guia, district, department, dealer, driver ORDER BY department, district, dealer, guia`, [site, `%${driver}%`, ...sargs, ...(missing.length ? [missing] : [])]);
  return NextResponse.json({ canDeliver: perm.ok, rows: rows.map((r) => ({ ...r, via_lima: num(r.via_lima), w2: num(r.w2), w3: num(r.w3), total: num(r.total), need: num(r.need), received: num(r.received) > 0 })) });
}

export async function POST(req: Request) {
  const { s, err } = await guard(["admin", "operator", "dealer"]);
  if (err) return err;
  const b = await req.json().catch(() => ({}));

  if (b.action === "review") {
    if (s.role !== "admin") return NextResponse.json({ error: "Solo la empresa revisa las observaciones" }, { status: 403 });
    await query("UPDATE receptions SET reviewed_by = ?, reviewed_at = LOCALTIMESTAMP(0) WHERE id = ?", [s.id, Number(b.id)]);
    return NextResponse.json({ ok: true });
  }

  const date = day(b.date);
  if (!date) return NextResponse.json({ error: "Indica la fecha" }, { status: 400 });

  type U = { id: number; d_despacho: string | null; est_date: string | null; delay_reason: string | null };
  async function deliver(units: U[], lateReason: string | null, needReason: boolean, notify = true) {
    const prev = units.reduce((m, u) => (u.d_despacho && u.d_despacho > m ? u.d_despacho : m), "");
    if (prev && date! < prev) return `La fecha no puede ser anterior al despacho (${prev})`;
    const late = units.filter((u) => u.est_date && !u.delay_reason && (date! > u.est_date || today() > u.est_date));
    if (needReason && late.length && !lateReason) return { need: late.length };
    await tx(async (q) => {
      const ids = units.map((u) => u.id);
      for (let i = 0; i < ids.length; i += 1000) await q.query("UPDATE units SET d_entrega = ? WHERE id IN (?) AND d_entrega IS NULL", [date, ids.slice(i, i + 1000)]);
      const ev: unknown[][] = units.map((u) => [u.id, s.id, "d_entrega", null, date]);
      if (late.length && lateReason) {
        await q.query("UPDATE units SET delay_reason = ? WHERE id IN (?) AND delay_reason IS NULL", [lateReason, late.map((u) => u.id)]);
        ev.push(...late.map((u) => [u.id, s.id, "delay_reason", null, lateReason]));
      }
      for (let i = 0; i < ev.length; i += 1000) await q.query("INSERT INTO unit_events(unit_id, user_id, field, old_value, new_value) VALUES ?", [ev.slice(i, i + 1000)]);
      // Si entregó en una parada sin marcar «Llegué», la parada queda como llegada ese día
      await q.query(`UPDATE dispatch_stops ds SET arrived_on = ?, arrived_at = LOCALTIMESTAMP(0), arrived_by = ?
        FROM units u WHERE u.id IN (?) AND ds.dispatch_id = u.dispatch_id AND upper(ds.district::text) = upper(u.district::text) AND ds.arrived_on IS NULL`,
        [date, s.id, ids.slice(0, 5000)]);
    });
    // El transporte entregó: el cliente confirma. Si quien registra es la recepción misma, no hace falta avisar
    if (notify) pushLater(() => notifyDelivered(units.map((u) => u.id)));
    return null;
  }

  // Conductor: entrega de las guías marcadas
  if (b.action === "deliver") {
    const site = b.site;
    if (!isSite(site)) return NextResponse.json({ error: "Módulo inválido" }, { status: 400 });
    const perm = await canDeliver(s, site);
    if (!perm.ok) return NextResponse.json({ error: "La entrega no es una etapa asignada a ti" }, { status: 403 });
    const guias = Array.isArray(b.guias) ? [...new Set(b.guias.map((g: unknown) => String(g).trim()).filter(Boolean))].slice(0, 200) : [];
    if (!guias.length) return NextResponse.json({ error: "Marca al menos una guía entregada" }, { status: 400 });
    const lateReason = typeof b.lateReason === "string" && b.lateReason.trim() ? b.lateReason.trim().toUpperCase().slice(0, 60) : null;
    const cs = perm.carrier ? " AND carrier = ?" : "";
    const cargs = perm.carrier ? [perm.carrier] : [];
    const units = await queryList<U>(
      `SELECT id, d_despacho, est_date, delay_reason FROM v_units WHERE site = ? AND guia IN (?) AND next_step = 'd_entrega' AND d_despacho IS NOT NULL${cs}`, [site, guias, ...cargs]);
    // Las que el cliente ya recibió: solo falta el registro del transportista (1.er check)
    const missing = await missingCarrier(`site = ? AND guia IN (?)${cs}`, [site, guias, ...cargs]);
    const done = missing.length ? await queryList<{ id: number }>(`SELECT id FROM v_units WHERE site = ? AND guia IN (?)${cs}`, [site, missing, ...cargs]) : [];
    if (!units.length && !done.length) return NextResponse.json({ error: "Esas guías no tienen unidades por entregar" }, { status: 409 });
    if (units.length) {
      const r = await deliver(units, lateReason, false);
      if (typeof r === "string") return NextResponse.json({ error: r }, { status: 400 });
    }
    // Marca del transportista: es el 1.er check del historial (aunque el cliente haya confirmado antes)
    const mark = [...units.map((u) => u.id), ...done.map((u) => u.id)];
    for (let i = 0; i < mark.length; i += 1000) {
      await query("INSERT INTO unit_events(unit_id, user_id, field, old_value, new_value) VALUES ?", [mark.slice(i, i + 1000).map((id) => [id, s.id, "entrega_transportista", null, date])]);
    }
    return NextResponse.json({ ok: true, units: units.length, confirmed: done.length });
  }

  // Dealer: confirma la recepción de una o varias guías (si llegaron juntas se marcan todas): cada una queda en el historial
  if (b.action === "receive") {
    const guias = (Array.isArray(b.guias) ? [...new Set(b.guias.map((g: unknown) => String(g).trim()).filter(Boolean))] : [String(b.guia ?? "").trim()].filter(Boolean)).slice(0, 100) as string[];
    const kind = b.kind === "observacion" ? "observacion" : b.kind === "completo" ? "completo" : null;
    const note = String(b.note ?? "").trim().slice(0, 500) || null;
    if (!guias.length) return NextResponse.json({ error: "Indica la guía" }, { status: 400 });
    if (!kind) return NextResponse.json({ error: "Elige si llegó completo o con observación" }, { status: 400 });
    if (kind === "observacion" && !note) return NextResponse.json({ error: "Escribe la observación" }, { status: 400 });
    let sc: { sql: string; args: unknown[] } | null = null;
    if (s.role === "dealer") {
      sc = await dealerScope(s.id);
      if (!sc) return NextResponse.json({ error: "Tu cuenta no tiene tiendas asignadas" }, { status: 403 });
    }
    // Primero se revisan todas (si una no se puede, no se registra ninguna)
    const list: { guia: string; site: Site; all: (U & { site: Site; next_step: string | null })[] }[] = [];
    for (const guia of guias) {
      const all = await queryList<U & { site: Site; next_step: string | null }>(
        `SELECT id, site, next_step, d_despacho, est_date, delay_reason FROM v_units WHERE guia = ? AND d_despacho IS NOT NULL${sc ? ` AND ${sc.sql}` : ""}`, [guia, ...(sc?.args ?? [])]);
      if (!all.length) return NextResponse.json({ error: `${guia}: todavía no fue despachada` }, { status: 409 });
      const [already] = await queryList<{ received_on: string }>("SELECT received_on FROM receptions WHERE guia = ? ORDER BY created_at DESC LIMIT 1", [guia]);
      if (already) return NextResponse.json({ error: `${guia}: ya se recibió el ${String(already.received_on).slice(0, 10)}` }, { status: 409 });
      if (s.role === "operator" && !(await canDeliver(s, all[0].site)).ok) return NextResponse.json({ error: "La entrega no es una etapa asignada a ti" }, { status: 403 });
      const prev = all.reduce((m, u) => (u.d_despacho && u.d_despacho > m ? u.d_despacho : m), "");
      if (prev && date < prev) return NextResponse.json({ error: `${guia}: la fecha no puede ser anterior al despacho (${prev})` }, { status: 400 });
      list.push({ guia, site: all[0].site, all });
    }
    let units = 0, delivered = 0;
    for (const { guia, site, all } of list) {
      const pending = all.filter((u) => u.next_step === "d_entrega");
      if (pending.length) {
        const r = await deliver(pending, null, false, false);
        if (typeof r === "string") return NextResponse.json({ error: `${guia}: ${r}` }, { status: 400 });
      }
      await query("INSERT INTO receptions(site, guia, kind, note, received_on, units, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)", [site, guia, kind, note, date, all.length, s.id]);
      units += all.length; delivered += pending.length;
      if (kind === "observacion" && note) {
        pushLater(async () => {
          const [d] = await queryList<{ dealer: string | null }>("SELECT MAX(dealer) dealer FROM v_units WHERE id IN (?)", [all.map((u) => u.id)]);
          await notifyObservation(guia, d?.dealer ?? null, note);
        });
      }
    }
    pushLater(async () => {
      const gs = list.map((x) => x.guia);
      await notifyReceived(gs, kind, await missingCarrier("guia IN (?)", [gs]));
    });
    return NextResponse.json({ ok: true, guias: list.length, units, delivered, kind });
  }

  return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
}
