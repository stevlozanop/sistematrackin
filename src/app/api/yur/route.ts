import { NextResponse } from "next/server";
import { queryList, run, tx } from "@/lib/db";
import { getScope, guard } from "@/lib/guard";
import { isSuper, today } from "@/lib/workflow";
import { YUR_CHATAS, YUR_ROUTES, roadRoute, routeInfo } from "@/lib/yur";
import { notifyNextStage, pushLater } from "@/lib/push";

/**
 * Ruta Yurimaguas (YUR), sin contenedores: las motos van sueltas en la chata y luego en camión por carretera.
 *
 * GET  ?view=carga  -> chatas cargando en Iquitos (aún sin zarpar) con sus guías + chatas conocidas
 * GET  ?view=ruta   -> lo que hay en ENAPU listo para despachar, agrupado por ruta de carretera y destino
 * POST { action: "load", guias: [], nave, date, lateReason? }   -> 1.1 carga a la chata (IQT-Port → Embarque)
 * POST { action: "unload", nave, guia }                         -> saca una guía de la chata (vuelve a IQT-Port)
 * POST { action: "sail", naves: [], date, lateReason? }         -> 2. zarpe de la chata (→ Tránsito fluvial)
 * GET  ?view=viajes[&driver=…] -> camiones en la carretera (y los entregados hace poco) con sus paradas, para el mapa
 * POST { action: "route", guia, route, note }                   -> el planificador cambia la ruta de una guía (con motivo)
 * POST { action: "arrive", trip, district, date }               -> el camión llegó a esa parada
 * El despacho del camión y la entrega usan /api/despacho y /api/entrega.
 */
const SITE = "YUR";
type Who = { id: number; role: string };

async function can(s: Who) {
  if (isSuper(s.role as never)) {
    const a = s.role === "admin";
    return { load: a, sail: a, dispatch: a, deliver: a, carrier: null as string | null };
  }
  if (s.role !== "operator") return { load: false, sail: false, dispatch: false, deliver: false, carrier: null };
  const sc = await getScope(s.id);
  const has = (f: string) => sc.stages.some((st) => st.site === SITE && st.field === f);
  return { load: has("d_carga"), sail: has("d_zarpe"), dispatch: has("d_despacho"), deliver: has("d_entrega"), carrier: sc.carrier };
}
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const text = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase().slice(0, max);
const num = (v: unknown) => Number(v ?? 0);
const reasonOf = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase().slice(0, 60) : null);

export async function GET(req: Request) {
  const { s, err } = await guard(["dev", "admin", "operator", "viewer"]);
  if (err) return err;
  const perm = await can(s);
  const view = new URL(req.url).searchParams.get("view");
  const scope = perm.carrier ? " AND carrier = ?" : "";
  const sargs = perm.carrier ? [perm.carrier] : [];

  if (view === "ruta") {
    const rows = await queryList<{ route: string | null; district: string | null; dealer: string | null; guia: string | null; w2: number; w3: number; total: number; since: string | null; est: string | null; need: number; overdue: number; nave: string | null; note: string | null }>(
      `SELECT COALESCE(route, '') route, district, dealer, guia, MAX(route_note) note, SUM(category = '2W') w2, SUM(category = '3W') w3, COUNT(*) total,
         MIN(d_almacen) since, MIN(est_date) est, SUM(est_date < CURDATE() AND delay_reason IS NULL) need, SUM(est_date < CURDATE()) overdue, MAX(nave) nave
       FROM v_units WHERE site = ? AND next_step = 'd_despacho'${scope}
       GROUP BY COALESCE(route, ''), district, dealer, guia ORDER BY MIN(est_date), district, dealer, guia`, [SITE, ...sargs]);
    // Lo que va llegando: en el puerto sin ingresar a ENAPU (para que el almacén vea lo que viene)
    const [port] = await queryList<{ total: number }>(`SELECT COUNT(*) total FROM v_units WHERE site = ? AND next_step = 'd_almacen'${scope}`, [SITE, ...sargs]);
    const drivers = await queryList<{ v: string }>("SELECT DISTINCT driver v FROM dispatches WHERE site = ? ORDER BY v LIMIT 200", [SITE]);
    // Guías sin ruta: se deduce del distrito (Jaén → Oriente 5, Tarapoto → Oriente 2…) y se guarda en sus unidades
    const fill = new Map<string, string[]>();
    for (const x of rows) {
      if (x.route) continue;
      const road = roadRoute(x.district);
      if (!road) continue;
      x.route = road;
      if (x.district) fill.set(road, [...(fill.get(road) ?? []), x.district]);
    }
    for (const [road, districts] of fill) {
      await run(`UPDATE units SET route = ? WHERE site = ? AND COALESCE(route, '') = '' AND district IN (?) AND d_despacho IS NULL`, [road, SITE, [...new Set(districts)]]).catch(() => {});
    }
    const known = new Set(YUR_ROUTES.map((r) => r.route));
    const routes = [...YUR_ROUTES.map((r) => ({ ...r })), { route: "", label: "Sin ruta", places: "Distrito sin ruta conocida: revisa el distrito en Dealers", days: 2, local: false }]
      .map((r) => ({
        ...r,
        guias: rows.filter((x) => (r.route ? x.route === r.route : !known.has(String(x.route))))
          .map((x) => ({ ...x, w2: num(x.w2), w3: num(x.w3), total: num(x.total), need: num(x.need), overdue: num(x.overdue) })),
      }))
      .filter((r) => r.route || r.guias.length);
    return NextResponse.json({ canDispatch: perm.dispatch, canDeliver: perm.deliver, drivers: drivers.map((d) => d.v), inPort: num(port?.total), routes });
  }

  // Camiones en la carretera: los que no terminaron y los que terminaron hace pocos días
  if (view === "viajes") {
    const driver = new URL(req.url).searchParams.get("driver")?.trim();
    const trips = await queryList<{ id: number; dispatched_on: string; driver: string; plate: string | null; total: number; delivered: number; w2: number; w3: number; last: string | null }>(
      `SELECT d.id, d.dispatched_on, d.driver, d.plate, COUNT(v.id) total, SUM(v.d_entrega IS NOT NULL) delivered,
         SUM(v.category = '2W') w2, SUM(v.category = '3W') w3, MAX(v.d_entrega) last
       FROM dispatches d JOIN v_units v ON v.dispatch_id = d.id
       WHERE d.site = ?${perm.carrier ? " AND v.carrier = ?" : ""}${driver ? " AND d.driver ILIKE ?" : ""}
       GROUP BY d.id, d.dispatched_on, d.driver, d.plate
       HAVING SUM(v.d_entrega IS NULL) > 0 OR MAX(v.d_entrega) >= CURDATE() - 3
       ORDER BY d.dispatched_on DESC, d.id DESC LIMIT 80`, [SITE, ...sargs, ...(driver ? [`%${driver}%`] : [])]);
    const ids = trips.map((t) => t.id);
    const [stops, guias] = ids.length ? await Promise.all([
      queryList<{ dispatch_id: number; seq: number; district: string; eta: string | null; arrived_on: string | null }>(
        "SELECT dispatch_id, seq, district, eta, arrived_on FROM dispatch_stops WHERE dispatch_id IN (?) ORDER BY dispatch_id, seq", [ids]),
      queryList<{ dispatch_id: number; district: string | null; dealer: string | null; guia: string | null; route: string | null; total: number; delivered: number; w2: number; w3: number }>(
        `SELECT dispatch_id, district, dealer, guia, MAX(route) route, COUNT(*) total, SUM(d_entrega IS NOT NULL) delivered, SUM(category = '2W') w2, SUM(category = '3W') w3
         FROM v_units WHERE dispatch_id IN (?) GROUP BY dispatch_id, district, dealer, guia ORDER BY dispatch_id, district, guia`, [ids]),
    ]) : [[], []];
    const out = trips.map((t) => {
      const mine = guias.filter((g) => g.dispatch_id === t.id).map((g) => ({ ...g, total: num(g.total), delivered: num(g.delivered), w2: num(g.w2), w3: num(g.w3) }));
      let st = stops.filter((x) => x.dispatch_id === t.id);
      // Viajes de antes de las paradas: una parada por distrito, sin fecha estimada
      if (!st.length) st = [...new Set(mine.map((g) => g.district ?? "—"))].map((d, i) => ({ dispatch_id: t.id, seq: i + 1, district: d, eta: null, arrived_on: null }));
      const routes = [...new Set(mine.map((g) => routeInfo(g.route || roadRoute(g.district))?.label ?? "Sin ruta"))];
      return {
        ...t, total: num(t.total), delivered: num(t.delivered), w2: num(t.w2), w3: num(t.w3), routes,
        stops: st.map((x) => {
          const gs = mine.filter((g) => (g.district ?? "—").toUpperCase() === x.district.toUpperCase());
          return { district: x.district, seq: num(x.seq), eta: x.eta, arrived_on: x.arrived_on, guias: gs,
            total: gs.reduce((a, g) => a + g.total, 0), delivered: gs.reduce((a, g) => a + g.delivered, 0) };
        }),
      };
    });
    const [enapu] = await queryList<{ total: number }>(`SELECT COUNT(*) total FROM v_units WHERE site = ? AND next_step = 'd_despacho'${scope}`, [SITE, ...sargs]);
    return NextResponse.json({ canArrive: perm.deliver || perm.dispatch, canDeliver: perm.deliver, trips: out, enapu: num(enapu?.total) });
  }

  // Carga a chata: chatas con carga en Iquitos que aún no zarpan
  const rows = await queryList<{ nave: string; guia: string | null; dealer: string | null; district: string | null; route: string | null; w2: number; w3: number; total: number; loaded: string; need: number }>(
    `SELECT nave, guia, MAX(dealer) dealer, MAX(district) district, MAX(route) route, SUM(category = '2W') w2, SUM(category = '3W') w3, COUNT(*) total,
       MAX(d_carga) loaded, SUM(est_date < CURDATE() AND delay_reason IS NULL) need
     FROM v_units WHERE site = ? AND next_step = 'd_zarpe' AND nave IS NOT NULL${scope}
     GROUP BY nave, guia ORDER BY nave, MAX(d_carga), guia`, [SITE, ...sargs]);
  const naves = new Map<string, { nave: string; w2: number; w3: number; total: number; need: number; first: string; last: string; guias: typeof rows }>();
  for (const r of rows) {
    const n = naves.get(r.nave) ?? { nave: r.nave, w2: 0, w3: 0, total: 0, need: 0, first: r.loaded, last: r.loaded, guias: [] };
    n.w2 += num(r.w2); n.w3 += num(r.w3); n.total += num(r.total); n.need += num(r.need);
    if (r.loaded < n.first) n.first = r.loaded;
    if (r.loaded > n.last) n.last = r.loaded;
    n.guias.push({ ...r, w2: num(r.w2), w3: num(r.w3), total: num(r.total), need: num(r.need) });
    naves.set(r.nave, n);
  }
  const used = await queryList<{ v: string }>("SELECT DISTINCT UPPER(nave) v FROM units WHERE site = ? AND nave IS NOT NULL AND nave <> '' ORDER BY v LIMIT 100", [SITE]);
  const chatas = [...new Set([...YUR_CHATAS, ...used.map((u) => u.v)])];
  return NextResponse.json({ canLoad: perm.load, canSail: perm.sail, chatas, loading: [...naves.values()] });
}

export async function POST(req: Request) {
  const { s, err } = await guard(["admin", "operator"]);
  if (err) return err;
  const perm = await can(s);
  const b = await req.json().catch(() => ({}));
  const date = day(b.date);
  const lateReason = reasonOf(b.lateReason);
  const scope = perm.carrier ? " AND carrier = ?" : "";
  const sargs = perm.carrier ? [perm.carrier] : [];

  if (b.action === "load") {
    if (!perm.load) return NextResponse.json({ error: "La carga a la chata no es una etapa asignada a ti" }, { status: 403 });
    const nave = text(b.nave, 60);
    const guias = Array.isArray(b.guias) ? [...new Set(b.guias.map((g: unknown) => String(g).trim()).filter(Boolean))].slice(0, 200) : [];
    if (!nave) return NextResponse.json({ error: "Elige la chata" }, { status: 400 });
    if (!guias.length) return NextResponse.json({ error: "Agrega al menos una guía" }, { status: 400 });
    if (!date) return NextResponse.json({ error: "Indica la fecha de carga" }, { status: 400 });
    const units = await queryList<{ id: number; billing_date: string | null; est_date: string | null; delay_reason: string | null; nave: string | null }>(
      `SELECT id, billing_date, est_date, delay_reason, nave FROM v_units WHERE site = ? AND guia IN (?) AND next_step = 'd_carga'${scope}`, [SITE, guias, ...sargs]);
    if (!units.length) return NextResponse.json({ error: "Esas guías no tienen unidades en IQT-Port para cargar" }, { status: 409 });
    const early = units.find((u) => u.billing_date && date < u.billing_date);
    if (early) return NextResponse.json({ error: `La fecha no puede ser anterior a la facturación (${early.billing_date})` }, { status: 400 });
    const late = units.filter((u) => u.est_date && !u.delay_reason && (date > u.est_date || today() > u.est_date));
    await tx(async (q) => {
      const ids = units.map((u) => u.id);
      for (let i = 0; i < ids.length; i += 1000) await q.query("UPDATE units SET d_carga = ?, nave = ?, container = NULL, container_id = NULL WHERE id IN (?) AND d_carga IS NULL", [date, nave, ids.slice(i, i + 1000)]);
      const ev: unknown[][] = units.flatMap((u) => [[u.id, s.id, "d_carga", null, date], ...(u.nave !== nave ? [[u.id, s.id, "nave", u.nave, nave]] : [])]);
      if (late.length && lateReason) {
        await q.query("UPDATE units SET delay_reason = ? WHERE id IN (?) AND delay_reason IS NULL", [lateReason, late.map((u) => u.id)]);
        ev.push(...late.map((u) => [u.id, s.id, "delay_reason", null, lateReason]));
      }
      for (let i = 0; i < ev.length; i += 1000) await q.query("INSERT INTO unit_events(unit_id, user_id, field, old_value, new_value) VALUES ?", [ev.slice(i, i + 1000)]);
    });
    pushLater(() => notifyNextStage(units.map((u) => u.id), s.id));
    return NextResponse.json({ ok: true, nave, units: units.length, late: lateReason ? 0 : late.length });
  }

  if (b.action === "unload") {
    if (!perm.load) return NextResponse.json({ error: "La carga a la chata no es una etapa asignada a ti" }, { status: 403 });
    const nave = text(b.nave, 60), guia = String(b.guia ?? "").trim();
    const units = await queryList<{ id: number; d_carga: string }>(
      `SELECT id, d_carga FROM v_units WHERE site = ? AND nave = ? AND guia = ? AND next_step = 'd_zarpe'${scope}`, [SITE, nave, guia, ...sargs]);
    if (!units.length) return NextResponse.json({ error: "Esa guía no está en la chata (o ya zarpó)" }, { status: 409 });
    await tx(async (q) => {
      const ids = units.map((u) => u.id);
      await q.query("UPDATE units SET d_carga = NULL, nave = NULL WHERE id IN (?) AND d_zarpe IS NULL", [ids]);
      await q.query("INSERT INTO unit_events(unit_id, user_id, field, old_value, new_value) VALUES ?", [units.map((u) => [u.id, s.id, "d_carga", u.d_carga, null])]);
    });
    return NextResponse.json({ ok: true, units: units.length });
  }

  if (b.action === "sail") {
    if (!perm.sail) return NextResponse.json({ error: "El zarpe no es una etapa asignada a ti" }, { status: 403 });
    const naves = Array.isArray(b.naves) ? [...new Set(b.naves.map((n: unknown) => text(n, 60)).filter(Boolean))] : [];
    if (!naves.length) return NextResponse.json({ error: "Marca la chata que zarpa" }, { status: 400 });
    if (!date) return NextResponse.json({ error: "Indica la fecha de zarpe" }, { status: 400 });
    const units = await queryList<{ id: number; d_carga: string | null; est_date: string | null; delay_reason: string | null }>(
      `SELECT id, d_carga, est_date, delay_reason FROM v_units WHERE site = ? AND nave IN (?) AND next_step = 'd_zarpe'${scope}`, [SITE, naves, ...sargs]);
    if (!units.length) return NextResponse.json({ error: "Esas chatas no tienen carga por zarpar" }, { status: 409 });
    const loaded = units.reduce((m, u) => (u.d_carga && u.d_carga > m ? u.d_carga : m), "");
    if (loaded && date < loaded) return NextResponse.json({ error: `El zarpe no puede ser antes de la última carga (${loaded})` }, { status: 400 });
    const late = units.filter((u) => u.est_date && !u.delay_reason && (date > u.est_date || today() > u.est_date));
    await tx(async (q) => {
      const ids = units.map((u) => u.id);
      for (let i = 0; i < ids.length; i += 1000) await q.query("UPDATE units SET d_zarpe = ? WHERE id IN (?) AND d_zarpe IS NULL", [date, ids.slice(i, i + 1000)]);
      const ev: unknown[][] = units.map((u) => [u.id, s.id, "d_zarpe", null, date]);
      if (late.length && lateReason) {
        await q.query("UPDATE units SET delay_reason = ? WHERE id IN (?) AND delay_reason IS NULL", [lateReason, late.map((u) => u.id)]);
        ev.push(...late.map((u) => [u.id, s.id, "delay_reason", null, lateReason]));
      }
      for (let i = 0; i < ev.length; i += 1000) await q.query("INSERT INTO unit_events(unit_id, user_id, field, old_value, new_value) VALUES ?", [ev.slice(i, i + 1000)]);
    });
    // Zarpó: avisa a quienes reciben en Yurimaguas
    pushLater(() => notifyNextStage(units.map((u) => u.id), s.id));
    return NextResponse.json({ ok: true, units: units.length, naves: naves.length, late: lateReason ? 0 : late.length });
  }

  // El planificador cambia la ruta de una guía que aún no sale (ej.: «va en el camión de Tarapoto, hay espacio»)
  if (b.action === "route") {
    if (!perm.dispatch) return NextResponse.json({ error: "Planificar rutas no es una etapa asignada a ti" }, { status: 403 });
    const guia = String(b.guia ?? "").trim(), route = text(b.route, 40), note = String(b.note ?? "").trim().slice(0, 200) || null;
    if (!guia) return NextResponse.json({ error: "Indica la guía" }, { status: 400 });
    if (!routeInfo(route)) return NextResponse.json({ error: "Elige una ruta" }, { status: 400 });
    const units = await queryList<{ id: number; route: string | null; district: string | null }>(
      `SELECT id, route, district FROM v_units WHERE site = ? AND guia = ? AND d_despacho IS NULL${scope}`, [SITE, guia, ...sargs]);
    if (!units.length) return NextResponse.json({ error: "Esa guía ya salió o no está en Yurimaguas" }, { status: 409 });
    const normal = roadRoute(units[0].district);
    if (route !== normal && !note) return NextResponse.json({ error: "Escribe por qué cambia de ruta" }, { status: 400 });
    await tx(async (q) => {
      await q.query("UPDATE units SET route = ?, route_note = ? WHERE id IN (?)", [route, route === normal ? null : note, units.map((u) => u.id)]);
      const ev = units.filter((u) => (u.route ?? "") !== route).map((u) => [u.id, s.id, "route", u.route, route]);
      if (ev.length) await q.query("INSERT INTO unit_events(unit_id, user_id, field, old_value, new_value) VALUES ?", [ev]);
    });
    return NextResponse.json({ ok: true, units: units.length, route });
  }

  // El camión llegó a una parada (lo marca el conductor o el planificador)
  if (b.action === "arrive") {
    if (!perm.deliver && !perm.dispatch) return NextResponse.json({ error: "Sin permiso para registrar la llegada" }, { status: 403 });
    const trip = Number(b.trip), district = String(b.district ?? "").trim();
    if (!trip || !district || !date) return NextResponse.json({ error: "Faltan datos de la parada" }, { status: 400 });
    const [d] = await queryList<{ dispatched_on: string }>("SELECT dispatched_on FROM dispatches WHERE id = ? AND site = ?", [trip, SITE]);
    if (!d) return NextResponse.json({ error: "No se encontró ese viaje" }, { status: 404 });
    if (date < String(d.dispatched_on).slice(0, 10)) return NextResponse.json({ error: "La llegada no puede ser antes del despacho" }, { status: 400 });
    const r = await run("UPDATE dispatch_stops SET arrived_on = ?, arrived_at = LOCALTIMESTAMP(0), arrived_by = ? WHERE dispatch_id = ? AND district = ?", [date, s.id, trip, district]);
    if (!r.affectedRows) {
      // Viaje de antes de las paradas: se crea la parada al llegar
      const [m] = await queryList<{ n: number }>("SELECT COALESCE(MAX(seq), 0) n FROM dispatch_stops WHERE dispatch_id = ?", [trip]);
      await run("INSERT INTO dispatch_stops(dispatch_id, seq, district, arrived_on, arrived_at, arrived_by) VALUES (?, ?, ?, ?, LOCALTIMESTAMP(0), ?)", [trip, num(m?.n) + 1, district, date, s.id]);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
}
