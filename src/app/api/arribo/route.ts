import { NextResponse } from "next/server";
import { queryList, tx } from "@/lib/db";
import { getScope, guard } from "@/lib/guard";
import { isSite, type Site } from "@/lib/hsp";
import { isSuper, today } from "@/lib/workflow";

/**
 * Arribo e ingreso a almacén en destino (pasos 3 y 4), igual que el embarque y zarpe de Iquitos:
 * 3. Arribo: las naves que zarparon y aún no llegan; se marcan y se registra el arribo
 *    → todas sus unidades pasan de «Tránsito fluvial» a «Arribo puerto» (fecha d_arribo).
 * 4. Ingreso a almacén: se elige la nave que llegó y se marcan sus contenedores
 *    → sus unidades pasan de «Arribo puerto» a «En almacén» (fecha d_almacen).
 *
 * GET  ?site=PCL
 * POST { action: "arrive", site, naves: [], date, lateReason? }
 * POST { action: "store", site, items: [{ nave, container }], date, lateReason? }
 */

type Who = { id: number; role: string };

async function can(s: Who, site: Site) {
  if (isSuper(s.role as never)) return { arrive: s.role === "admin", store: s.role === "admin", carrier: null as string | null };
  if (s.role !== "operator") return { arrive: false, store: false, carrier: null };
  const sc = await getScope(s.id);
  const has = (f: string) => sc.stages.some((st) => st.site === site && st.field === f);
  return { arrive: has("d_arribo"), store: has("d_almacen"), carrier: sc.carrier };
}

const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const NO_NAVE = "(sin nave)";
const NO_CONT = "(sin contenedor)";

export async function GET(req: Request) {
  const { s, err } = await guard(["dev", "admin", "operator"]);
  if (err) return err;
  const site = new URL(req.url).searchParams.get("site");
  if (!isSite(site)) return NextResponse.json({ error: "Módulo inválido" }, { status: 400 });
  const perm = await can(s, site);
  const scope = perm.carrier ? " AND carrier = ?" : "";
  const args = perm.carrier ? [site, perm.carrier] : [site];

  // 3. Naves en camino (zarparon, aún sin arribo)
  const naves = await queryList<{ nave: string; containers: number; w2: number; w3: number; total: number; sailed: string; need: number }>(
    `SELECT COALESCE(nave, '${NO_NAVE}') nave, COUNT(DISTINCT container) containers,
       SUM(category = '2W') w2, SUM(category = '3W') w3, COUNT(*) total, MAX(d_zarpe) sailed,
       SUM(est_date < CURDATE() AND delay_reason IS NULL) need
     FROM v_units WHERE site = ? AND next_step = 'd_arribo'${scope}
     GROUP BY COALESCE(nave, '${NO_NAVE}') ORDER BY MAX(d_zarpe), nave`,
    args,
  );

  // 4. Contenedores en puerto (llegaron, aún sin ingreso a almacén), por nave
  const conts = await queryList<{ nave: string; container: string; w2: number; w3: number; total: number; arrived: string; need: number; guias: number }>(
    `SELECT COALESCE(nave, '${NO_NAVE}') nave, COALESCE(container, '${NO_CONT}') container,
       SUM(category = '2W') w2, SUM(category = '3W') w3, COUNT(*) total, MAX(d_arribo) arrived,
       SUM(est_date < CURDATE() AND delay_reason IS NULL) need, COUNT(DISTINCT guia) guias
     FROM v_units WHERE site = ? AND next_step = 'd_almacen'${scope}
     GROUP BY COALESCE(nave, '${NO_NAVE}'), COALESCE(container, '${NO_CONT}') ORDER BY MAX(d_arribo), nave, container`,
    args,
  );

  const num = (v: unknown) => Number(v ?? 0);
  return NextResponse.json({
    site, canArrive: perm.arrive, canStore: perm.store,
    naves: naves.map((n) => ({ ...n, containers: num(n.containers), w2: num(n.w2), w3: num(n.w3), total: num(n.total), need: num(n.need) })),
    port: conts.map((c) => ({ ...c, w2: num(c.w2), w3: num(c.w3), total: num(c.total), need: num(c.need), guias: num(c.guias) })),
  });
}

export async function POST(req: Request) {
  const { s, err } = await guard(["admin", "operator"]);
  if (err) return err;
  const b = await req.json().catch(() => ({}));
  const site = b.site;
  if (!isSite(site)) return NextResponse.json({ error: "Módulo inválido" }, { status: 400 });
  const perm = await can(s, site);
  const date = day(b.date);
  if (!date) return NextResponse.json({ error: "Indica la fecha" }, { status: 400 });
  const lateReason = typeof b.lateReason === "string" && b.lateReason.trim() ? b.lateReason.trim().toUpperCase().slice(0, 60) : null;
  const scope = perm.carrier ? " AND carrier = ?" : "";

  type U = { id: number; prev: string | null; est_date: string | null; delay_reason: string | null };
  let units: U[] = [];
  let field: "d_arribo" | "d_almacen";

  if (b.action === "arrive") {
    if (!perm.arrive) return NextResponse.json({ error: "El arribo no es una etapa asignada a ti" }, { status: 403 });
    const naves: string[] = Array.isArray(b.naves) ? [...new Set(b.naves.map((n: unknown) => String(n ?? "").trim()).filter(Boolean))] as string[] : [];
    if (!naves.length) return NextResponse.json({ error: "Marca al menos una nave" }, { status: 400 });
    field = "d_arribo";
    const real = naves.filter((n) => n !== NO_NAVE);
    const cond = [real.length ? "nave IN (?)" : "", naves.includes(NO_NAVE) ? "nave IS NULL" : ""].filter(Boolean).join(" OR ");
    units = await queryList<U>(
      `SELECT id, d_zarpe prev, est_date, delay_reason FROM v_units WHERE site = ? AND next_step = 'd_arribo' AND (${cond})${scope}`,
      [site, ...(real.length ? [real] : []), ...(perm.carrier ? [perm.carrier] : [])],
    );
  } else if (b.action === "store") {
    if (!perm.store) return NextResponse.json({ error: "El ingreso a almacén no es una etapa asignada a ti" }, { status: 403 });
    const items: { nave: string; container: string }[] = Array.isArray(b.items)
      ? b.items.map((x: { nave?: unknown; container?: unknown }) => ({ nave: String(x?.nave ?? "").trim(), container: String(x?.container ?? "").trim() })).filter((x: { nave: string }) => x.nave).slice(0, 200)
      : [];
    if (!items.length) return NextResponse.json({ error: "Marca al menos un contenedor" }, { status: 400 });
    field = "d_almacen";
    for (const it of items) {
      const part = await queryList<U>(
        `SELECT id, d_arribo prev, est_date, delay_reason FROM v_units WHERE site = ? AND next_step = 'd_almacen'
           AND ${it.nave === NO_NAVE ? "nave IS NULL" : "nave = ?"} AND ${it.container === NO_CONT ? "container IS NULL" : "container = ?"}${scope}`,
        [site, ...(it.nave === NO_NAVE ? [] : [it.nave]), ...(it.container === NO_CONT ? [] : [it.container]), ...(perm.carrier ? [perm.carrier] : [])],
      );
      units.push(...part);
    }
  } else {
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  }

  if (!units.length) return NextResponse.json({ error: "No hay unidades pendientes en lo que marcaste" }, { status: 409 });
  const prev = units.reduce((m, u) => (u.prev && u.prev > m ? u.prev : m), "");
  if (prev && date < prev) return NextResponse.json({ error: `La fecha no puede ser anterior a la etapa previa (${prev})` }, { status: 400 });
  const late = units.filter((u) => u.est_date && !u.delay_reason && (date > u.est_date || today() > u.est_date));

  await tx(async (q) => {
    const ids = units.map((u) => u.id);
    for (let i = 0; i < ids.length; i += 1000) await q.query(`UPDATE units SET ${field} = ? WHERE id IN (?) AND ${field} IS NULL`, [date, ids.slice(i, i + 1000)]);
    const ev: unknown[][] = units.map((u) => [u.id, s.id, field, null, date]);
    if (late.length) {
      await q.query("UPDATE units SET delay_reason = ? WHERE id IN (?) AND delay_reason IS NULL", [lateReason, late.map((u) => u.id)]);
      ev.push(...late.map((u) => [u.id, s.id, "delay_reason", null, lateReason]));
    }
    for (let i = 0; i < ev.length; i += 1000) await q.query("INSERT INTO unit_events(unit_id, user_id, field, old_value, new_value) VALUES ?", [ev.slice(i, i + 1000)]);
  });
  return NextResponse.json({ ok: true, units: units.length, late: late.length });
}
