import { NextResponse } from "next/server";
import { queryList, tx } from "@/lib/db";
import { getScope, guard } from "@/lib/guard";
import { isSite, type Site } from "@/lib/hsp";
import { isSuper, today } from "@/lib/workflow";
import { DEFAULT_VESSEL, floating, inside, nextFree, same, slotName, type Slot, type Vessel } from "@/lib/stowage";

/**
 * Embarque y zarpe en Iquitos (pasos 1.1 y 2).
 * 1. Embarque: se buscan las guías que entran a un contenedor, se indica el contenedor, la nave y la fecha
 *    → sus unidades pasan de IQT-Port a «Embarque» (fecha d_carga). Un contenedor = un registro.
 * 2. Zarpe: cuando la nave completó su carga, se marca y se registra el zarpe
 *    → todas las unidades de sus contenedores pasan a «Tránsito fluvial» (fecha d_zarpe).
 *
 * GET  ?site=PCL                 -> naves con contenedores embarcados que aún no zarpan (+ permisos y naves usadas)
 * GET  ?site=PCL&guia=09-0T005-1 -> unidades de esa guía listas para embarcar
 * GET  ?site=PCL&nave=HENRY 3    -> detalle: contenedores, guías y chasis de esa nave
 * POST { action: "embark", site, container, nave, date, guias: [], lateReason? }
 * POST { action: "sail", site, naves: [], date, lateReason? }
 * POST { action: "undo", id }    -> quita un contenedor que todavía no zarpa (las unidades vuelven a IQT-Port)
 */

type Who = { id: number; role: string };

/** ¿Puede embarcar (d_carga) o registrar el zarpe (d_zarpe) en este módulo? La empresa siempre; el encargado, si es su etapa. */
async function can(s: Who, site: Site) {
  if (isSuper(s.role as never)) return { embark: s.role === "admin", sail: s.role === "admin", carrier: null as string | null };
  if (s.role !== "operator") return { embark: false, sail: false, carrier: null };
  const sc = await getScope(s.id);
  const has = (f: string) => sc.stages.some((st) => st.site === site && st.field === f);
  return { embark: has("d_carga"), sail: has("d_zarpe"), carrier: sc.carrier };
}

/** Tamaño de la nave (o el de siempre si aún no se configuró) */
async function vesselOf(nave: string): Promise<Vessel> {
  const [v] = await queryList<Vessel>("SELECT bays, rows, tiers FROM vessels WHERE name = ?", [nave]);
  return v ? { bays: Number(v.bays), rows: Number(v.rows), tiers: Number(v.tiers) } : DEFAULT_VESSEL;
}
/** Contenedores de la nave que aún no zarpa, con su lugar */
async function planOf(site: string, nave: string) {
  return queryList<{ id: number; code: string; bay: number | null; rw: number | null; tier: number | null; units: number; guias: number; dealers: string | null; loaded_on: string }>(
    `SELECT c.id, c.code, c.slot_bay bay, c.slot_row rw, c.slot_tier tier, c.loaded_on, COUNT(u.id) units, COUNT(DISTINCT u.guia) guias,
       string_agg(DISTINCT d.name::text, ', ') dealers
     FROM containers c LEFT JOIN units u ON u.container_id = c.id LEFT JOIN dealers d ON d.id = u.dealer_id
     WHERE c.site = ? AND c.nave = ? AND c.sailed_on IS NULL
     GROUP BY c.id, c.code, c.slot_bay, c.slot_row, c.slot_tier, c.loaded_on ORDER BY c.id`, [site, nave]);
}
const slotOf = (c: { bay: number | null; rw: number | null; tier: number | null }): Slot | null =>
  c.bay && c.rw && c.tier ? { bay: Number(c.bay), row: Number(c.rw), tier: Number(c.tier) } : null;

const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const text = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase().slice(0, max);

export async function GET(req: Request) {
  const { s, err } = await guard(["dev", "admin", "operator"]);
  if (err) return err;
  const p = new URL(req.url).searchParams;
  const site = p.get("site");
  if (!isSite(site)) return NextResponse.json({ error: "Módulo inválido" }, { status: 400 });
  const perm = await can(s, site);

  // Una guía para agregar al contenedor
  const guia = p.get("guia")?.trim();
  if (guia) {
    const units = await queryList<{ id: number; chassis: string; district: string | null; dealer: string | null; category: string | null; status: string; next_step: string | null; need: number }>(
      `SELECT id, chassis, district, dealer, category, status, next_step, (est_date < CURDATE() AND delay_reason IS NULL) need
       FROM v_units WHERE site = ? AND guia = ? ORDER BY chassis`,
      [site, guia],
    );
    if (!units.length) {
      const [other] = await queryList<{ site: string }>("SELECT site FROM units WHERE guia = ? LIMIT 1", [guia]);
      return NextResponse.json({ error: other ? `Esa guía es de la ruta ${other.site}` : "No se encontró esa guía de remisión" }, { status: 404 });
    }
    const ready = units.filter((u) => u.next_step === "d_carga");
    if (!ready.length) return NextResponse.json({ error: `Esa guía ya está en «${units[0].status}»: no hay unidades por embarcar` }, { status: 409 });
    const uniq = (k: "district" | "dealer") => [...new Set(ready.map((u) => u[k]).filter(Boolean))].join(" · ");
    return NextResponse.json({
      guia, district: uniq("district"), dealer: uniq("dealer"),
      w2: ready.filter((u) => u.category === "2W").length, w3: ready.filter((u) => u.category === "3W").length, total: ready.length,
      need: ready.filter((u) => Number(u.need)).length, skipped: units.length - ready.length,
      ids: ready.map((u) => u.id), chassis: ready.map((u) => u.chassis),
    });
  }

  // Detalle de una nave: contenedores → guías → chasis
  // Guías pendientes de embarque (en IQT-Port), con avisos de posible duplicado
  if (p.get("pending")) {
    const scope = perm.carrier ? " AND v.carrier = ?" : "";
    const rows = await queryList<{ guia: string; district: string | null; dealer: string | null; w2: number; w3: number; total: number; billing: string | null; est: string | null; overdue: number; models: string | null; ahead: number; ahead_status: string | null; other_site: string | null; dup_chassis: number }>(
      `SELECT v.guia, MAX(v.district) district, MAX(v.dealer) dealer, SUM(v.category = '2W') w2, SUM(v.category = '3W') w3, COUNT(*) total,
         MIN(v.billing_date) billing, MIN(v.est_date) est, SUM(v.est_date < CURDATE()) overdue,
         string_agg(DISTINCT split_part(replace(v.material::text, '_', ' '), ' ', 1), ', ') models,
         (SELECT COUNT(*) FROM v_units w WHERE w.site = v.site AND w.guia = v.guia AND w.next_step IS DISTINCT FROM 'd_carga') ahead,
         (SELECT MAX(w.status) FROM v_units w WHERE w.site = v.site AND w.guia = v.guia AND w.next_step IS DISTINCT FROM 'd_carga') ahead_status,
         (SELECT MAX(o.site) FROM units o WHERE o.guia = v.guia AND o.site <> v.site) other_site,
         (SELECT COUNT(*) FROM units o WHERE o.site <> v.site AND o.chassis IN (SELECT x.chassis FROM units x WHERE x.site = v.site AND x.guia = v.guia AND x.d_carga IS NULL)) dup_chassis
       FROM v_units v WHERE v.site = ? AND v.next_step = 'd_carga' AND v.guia IS NOT NULL${scope}
       GROUP BY v.site, v.guia ORDER BY MIN(v.billing_date), v.guia`,
      perm.carrier ? [site, perm.carrier] : [site]);
    const num = (x: unknown) => Number(x ?? 0);
    return NextResponse.json({
      canDelete: s.role === "admin",
      rows: rows.map((r) => {
        const flags: string[] = [];
        if (num(r.ahead)) flags.push(`${num(r.ahead)} unidades de esta guía ya están en «${r.ahead_status}»`);
        if (r.other_site) flags.push(`Esta guía también está cargada en ${r.other_site}`);
        if (num(r.dup_chassis)) flags.push(`${num(r.dup_chassis)} chasis también están en la otra ruta`);
        return { ...r, w2: num(r.w2), w3: num(r.w3), total: num(r.total), overdue: num(r.overdue), flags };
      }),
    });
  }

  const nave = p.get("nave")?.trim();
  // Plano de estiba de la nave
  if (nave && p.get("plan")) {
    const [vessel, plan] = await Promise.all([vesselOf(nave), planOf(site, nave)]);
    return NextResponse.json({ vessel, canEdit: perm.embark, containers: plan.map((c) => ({ ...c, units: Number(c.units), guias: Number(c.guias), slot: slotOf(c) })) });
  }
  if (nave) {
    const rows = await queryList<{ cid: number; code: string; loaded_on: string; bay: number | null; rw: number | null; tier: number | null; guia: string | null; district: string | null; dealer: string | null; category: string | null; chassis: string; motor: string | null; material: string | null }>(
      `SELECT c.id cid, c.code, c.loaded_on, c.slot_bay bay, c.slot_row rw, c.slot_tier tier, u.guia, u.district, d.name dealer, u.category, u.chassis, u.motor, u.material
       FROM containers c JOIN units u ON u.container_id = c.id LEFT JOIN dealers d ON d.id = u.dealer_id
       WHERE c.site = ? AND c.nave = ? AND c.sailed_on IS NULL
       ORDER BY c.id, u.guia, u.chassis`,
      [site, nave],
    );
    const v = await vesselOf(nave);
    return NextResponse.json({ rows: rows.map(({ bay, rw, tier, ...r }) => { const sl = slotOf({ bay, rw, tier }); return { ...r, place: sl ? slotName(sl, v) : null }; }) });
  }

  const naves = await queryList<{ nave: string; containers: number; w2: number; w3: number; total: number; first: string; last: string; need: number; codes: string; bays: number | null; rows: number | null; tiers: number | null }>(
    `SELECT c.nave, COUNT(DISTINCT c.id) containers, SUM(u.category = '2W') w2, SUM(u.category = '3W') w3, COUNT(u.id) total,
       MIN(c.loaded_on) first, MAX(c.loaded_on) last,
       SUM(v.est_date < CURDATE() AND v.delay_reason IS NULL) need,
       string_agg(DISTINCT c.code || '|' || c.id || '|' || COALESCE(c.slot_bay, 0) || '|' || COALESCE(c.slot_row, 0) || '|' || COALESCE(c.slot_tier, 0), ',') codes,
       MAX(ve.bays) bays, MAX(ve.rows) rows, MAX(ve.tiers) tiers
     FROM containers c JOIN units u ON u.container_id = c.id JOIN v_units v ON v.id = u.id LEFT JOIN vessels ve ON ve.name = c.nave
     WHERE c.site = ? AND c.sailed_on IS NULL
     GROUP BY c.nave ORDER BY MIN(c.loaded_on), c.nave`,
    [site],
  );
  const known = await queryList<{ v: string }>("SELECT DISTINCT UPPER(nave) v FROM units WHERE nave IS NOT NULL AND nave <> '' ORDER BY v LIMIT 300");
  return NextResponse.json({
    site, canEmbark: perm.embark, canSail: perm.sail,
    naves: naves.map((n) => ({
      ...n, containers: Number(n.containers), w2: Number(n.w2 ?? 0), w3: Number(n.w3 ?? 0), total: Number(n.total), need: Number(n.need ?? 0),
      // Cada contenedor con su lugar en la nave (para dibujarlo en el muelle) y el tamaño de la nave
      list: (n.codes ?? "").split(",").filter(Boolean).map((x) => {
        const [code, id, bay, row, tier] = x.split("|");
        return { code, id: Number(id), slot: Number(bay) && Number(row) && Number(tier) ? { bay: Number(bay), row: Number(row), tier: Number(tier) } : null };
      }),
      vessel: n.bays ? { bays: Number(n.bays), rows: Number(n.rows), tiers: Number(n.tiers) } : DEFAULT_VESSEL,
    })),
    known: known.map((k) => k.v),
  });
}

export async function POST(req: Request) {
  const { s, err } = await guard(["admin", "operator"]);
  if (err) return err;
  const b = await req.json().catch(() => ({}));
  const lateReason = typeof b.lateReason === "string" && b.lateReason.trim() ? b.lateReason.trim().toUpperCase().slice(0, 60) : null;

  // Quitar un contenedor mal registrado (solo si su nave todavía no zarpa)
  if (b.action === "undo") {
    const [c] = await queryList<{ id: number; site: Site; sailed_on: string | null; code: string }>("SELECT id, site, sailed_on, code FROM containers WHERE id = ?", [Number(b.id)]);
    if (!c) return NextResponse.json({ error: "Ese contenedor no existe" }, { status: 404 });
    if (!(await can(s, c.site)).embark) return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 });
    if (c.sailed_on) return NextResponse.json({ error: "La nave ya zarpó: corrígelo desde el módulo" }, { status: 409 });
    const n = await tx(async (q) => {
      const [units] = await q.query("SELECT id, d_carga::text d_carga, nave, container FROM units WHERE container_id = ? AND d_zarpe IS NULL", [c.id]);
      const list = units as { id: number; d_carga: string | null; nave: string | null; container: string | null }[];
      if (list.length) {
        await q.query("UPDATE units SET d_carga = NULL, nave = NULL, container = NULL, container_id = NULL WHERE id IN (?)", [list.map((u) => u.id)]);
        await q.query("INSERT INTO unit_events(unit_id, user_id, field, old_value, new_value) VALUES ?", [list.map((u) => [u.id, s.id, "d_carga", u.d_carga, null])]);
      }
      await q.query("DELETE FROM containers WHERE id = ?", [c.id]);
      return list.length;
    });
    return NextResponse.json({ ok: true, units: n, code: c.code });
  }

  // Eliminar una guía duplicada que aún no se embarca (solo la empresa): se borran sus unidades pendientes en IQT-Port
  if (b.action === "delete-guia") {
    if (s.role !== "admin") return NextResponse.json({ error: "Solo la empresa puede eliminar guías" }, { status: 403 });
    const site = b.site, guia = String(b.guia ?? "").trim();
    if (!isSite(site) || !guia) return NextResponse.json({ error: "Indica la guía" }, { status: 400 });
    const units = await queryList<{ id: number }>("SELECT id FROM units WHERE site = ? AND guia = ? AND d_carga IS NULL AND container_id IS NULL", [site, guia]);
    if (!units.length) return NextResponse.json({ error: "Esa guía no tiene unidades pendientes de embarque" }, { status: 409 });
    await tx(async (q) => { await q.query("DELETE FROM units WHERE id IN (?)", [units.map((u) => u.id)]); });
    return NextResponse.json({ ok: true, units: units.length, guia });
  }

  // Plano de estiba: mover un contenedor a un lugar (si está ocupado, se intercambian) o dejarlo sin ubicar
  if (b.action === "place" || b.action === "unplace") {
    const [c] = await queryList<{ id: number; site: Site; nave: string; sailed_on: string | null }>("SELECT id, site, nave, sailed_on FROM containers WHERE id = ?", [Number(b.id)]);
    if (!c) return NextResponse.json({ error: "Ese contenedor no existe" }, { status: 404 });
    if (!(await can(s, c.site)).embark) return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 });
    if (c.sailed_on) return NextResponse.json({ error: "La nave ya zarpó" }, { status: 409 });
    const v = await vesselOf(c.nave);
    const plan = await planOf(c.site, c.nave);
    const me = plan.find((x) => x.id === c.id)!;
    const from = slotOf(me);
    const to: Slot | null = b.action === "place" ? { bay: Number(b.bay), row: Number(b.row), tier: Number(b.tier) } : null;
    if (to && !inside(to, v)) return NextResponse.json({ error: "Ese lugar no existe en la nave" }, { status: 400 });
    const other = to ? plan.find((x) => x.id !== c.id && slotOf(x) && same(slotOf(x)!, to)) : undefined;
    // Cómo quedaría el plano
    const after = plan.map((x) => x.id === c.id ? to : other && x.id === other.id ? from : slotOf(x)).filter(Boolean) as Slot[];
    const bad = floating(after);
    if (bad) return NextResponse.json({ error: "Así un contenedor quedaría flotando: primero ocupa el lugar de abajo" }, { status: 400 });
    await tx(async (q) => {
      await q.query("UPDATE containers SET slot_bay = ?, slot_row = ?, slot_tier = ? WHERE id = ?", [to?.bay ?? null, to?.row ?? null, to?.tier ?? null, c.id]);
      if (other) await q.query("UPDATE containers SET slot_bay = ?, slot_row = ?, slot_tier = ? WHERE id = ?", [from?.bay ?? null, from?.row ?? null, from?.tier ?? null, other.id]);
    });
    return NextResponse.json({ ok: true, swapped: other?.code ?? null });
  }
  // Tamaño de la nave
  if (b.action === "vessel") {
    const nave = text(b.nave, 60);
    if (!nave) return NextResponse.json({ error: "Indica la nave" }, { status: 400 });
    const site = isSite(b.site) ? b.site : "PCL";
    if (!(await can(s, site)).embark) return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 });
    const v: Vessel = { bays: Math.round(Number(b.bays)), rows: Math.round(Number(b.rows)), tiers: Math.round(Number(b.tiers)) };
    if (!(v.bays >= 1 && v.bays <= 20 && v.rows >= 1 && v.rows <= 6 && v.tiers >= 1 && v.tiers <= 5)) return NextResponse.json({ error: "Tamaño fuera de rango (bahías 1–20, filas 1–6, niveles 1–5)" }, { status: 400 });
    const out = (await planOf(site, nave)).filter((x) => { const sl = slotOf(x); return sl && !inside(sl, v); });
    if (out.length) return NextResponse.json({ error: `No entra: ${out.map((x) => x.code).join(", ")} quedaría fuera. Muévelos primero.` }, { status: 409 });
    await queryList("INSERT INTO vessels(name, bays, rows, tiers) VALUES (?, ?, ?, ?) ON CONFLICT (name) DO UPDATE SET bays = EXCLUDED.bays, rows = EXCLUDED.rows, tiers = EXCLUDED.tiers", [nave, v.bays, v.rows, v.tiers]);
    return NextResponse.json({ ok: true, vessel: v });
  }

  // Editar un contenedor (su nave aún no zarpa): número, nave, fecha de embarque,
  // quitar guías (vuelven a IQT-Port) y agregar guías que esperan el embarque.
  if (b.action === "edit") {
    const [c] = await queryList<{ id: number; site: Site; sailed_on: string | null; code: string; nave: string; loaded_on: string }>(
      "SELECT id, site, sailed_on, code, nave, loaded_on::text loaded_on FROM containers WHERE id = ?", [Number(b.id)]);
    if (!c) return NextResponse.json({ error: "Ese contenedor no existe" }, { status: 404 });
    const perm = await can(s, c.site);
    if (!perm.embark) return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 });
    if (c.sailed_on) return NextResponse.json({ error: "La nave ya zarpó: corrígelo desde el módulo" }, { status: 409 });
    const code = text(b.container, 40) || c.code, nave = text(b.nave, 60) || c.nave;
    const date = day(b.date) ?? c.loaded_on;
    const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map((g) => String(g).trim()).filter(Boolean))].slice(0, 100) : []);
    const remove = list(b.removeGuias), add = list(b.addGuias);
    if (code !== c.code) {
      const [dup] = await queryList<{ nave: string }>("SELECT nave FROM containers WHERE site = ? AND code = ? AND sailed_on IS NULL AND id <> ?", [c.site, code, c.id]);
      if (dup) return NextResponse.json({ error: `El contenedor ${code} ya está en la nave ${dup.nave}` }, { status: 409 });
    }
    const current = await queryList<{ id: number; guia: string | null; billing_date: string | null; d_carga: string | null; nave: string | null; container: string | null }>(
      "SELECT id, guia, billing_date::text billing_date, d_carga::text d_carga, nave, container FROM units WHERE container_id = ? AND d_zarpe IS NULL", [c.id]);
    const out = current.filter((u) => u.guia && remove.includes(u.guia));
    const stay = current.filter((u) => !out.includes(u));
    const incoming = add.length ? await queryList<{ id: number; billing_date: string | null; est_date: string | null; delay_reason: string | null; nave: string | null; container: string | null }>(
      `SELECT id, billing_date, est_date, delay_reason, nave, container FROM v_units
       WHERE site = ? AND guia IN (?) AND next_step = 'd_carga'${perm.carrier ? " AND carrier = ?" : ""}`,
      perm.carrier ? [c.site, add, perm.carrier] : [c.site, add]) : [];
    if (add.length && !incoming.length) return NextResponse.json({ error: "Esas guías no tienen unidades por embarcar" }, { status: 409 });
    if (!stay.length && !incoming.length) return NextResponse.json({ error: "El contenedor quedaría vacío: usa «Quitar» para eliminarlo" }, { status: 400 });
    const early = [...stay, ...incoming].find((u) => u.billing_date && date < u.billing_date);
    if (early) return NextResponse.json({ error: `La fecha no puede ser anterior a la facturación (${early.billing_date})` }, { status: 400 });
    const late = incoming.filter((u) => u.est_date && !u.delay_reason && (date > u.est_date || today() > u.est_date));

    await tx(async (q) => {
      await q.query("UPDATE containers SET code = ?, nave = ?, loaded_on = ? WHERE id = ?", [code, nave, date, c.id]);
      const ev: unknown[][] = [];
      if (stay.length) {
        await q.query("UPDATE units SET d_carga = ?, nave = ?, container = ? WHERE id IN (?)", [date, nave, code, stay.map((u) => u.id)]);
        for (const u of stay) {
          if (u.d_carga !== date) ev.push([u.id, s.id, "d_carga", u.d_carga, date]);
          if (u.nave !== nave) ev.push([u.id, s.id, "nave", u.nave, nave]);
          if (u.container !== code) ev.push([u.id, s.id, "container", u.container, code]);
        }
      }
      if (out.length) {
        await q.query("UPDATE units SET d_carga = NULL, nave = NULL, container = NULL, container_id = NULL WHERE id IN (?)", [out.map((u) => u.id)]);
        ev.push(...out.map((u) => [u.id, s.id, "d_carga", u.d_carga, null]));
      }
      if (incoming.length) {
        await q.query("UPDATE units SET d_carga = ?, nave = ?, container = ?, container_id = ? WHERE id IN (?) AND d_carga IS NULL", [date, nave, code, c.id, incoming.map((u) => u.id)]);
        ev.push(...incoming.flatMap((u) => [
          [u.id, s.id, "d_carga", null, date],
          ...(u.nave !== nave ? [[u.id, s.id, "nave", u.nave, nave]] : []),
          ...(u.container !== code ? [[u.id, s.id, "container", u.container, code]] : []),
        ]));
        if (late.length) {
          await q.query("UPDATE units SET delay_reason = ? WHERE id IN (?) AND delay_reason IS NULL", [lateReason, late.map((u) => u.id)]);
          ev.push(...late.map((u) => [u.id, s.id, "delay_reason", null, lateReason]));
        }
      }
      for (let i = 0; i < ev.length; i += 1000) await q.query("INSERT INTO unit_events(unit_id, user_id, field, old_value, new_value) VALUES ?", [ev.slice(i, i + 1000)]);
    });
    return NextResponse.json({ ok: true, id: c.id, code, nave, date, removed: out.length, added: incoming.length, moved: nave !== c.nave });
  }

  const site = b.site;
  if (!isSite(site)) return NextResponse.json({ error: "Módulo inválido" }, { status: 400 });
  const perm = await can(s, site);
  const date = day(b.date);
  if (!date) return NextResponse.json({ error: "Indica la fecha" }, { status: 400 });

  // 1.1 Embarque de un contenedor
  if (b.action === "embark") {
    if (!perm.embark) return NextResponse.json({ error: "El embarque no es una etapa asignada a ti" }, { status: 403 });
    const code = text(b.container, 40), nave = text(b.nave, 60);
    const guias = Array.isArray(b.guias) ? [...new Set(b.guias.map((g: unknown) => String(g).trim()).filter(Boolean))].slice(0, 100) : [];
    if (!code) return NextResponse.json({ error: "Indica el número de contenedor" }, { status: 400 });
    if (!nave) return NextResponse.json({ error: "Indica la nave" }, { status: 400 });
    if (!guias.length) return NextResponse.json({ error: "Agrega al menos una guía" }, { status: 400 });
    const [open] = await queryList<{ nave: string }>("SELECT nave FROM containers WHERE site = ? AND code = ? AND sailed_on IS NULL", [site, code]);
    if (open) return NextResponse.json({ error: `El contenedor ${code} ya está registrado en la nave ${open.nave} y aún no zarpa` }, { status: 409 });

    const units = await queryList<{ id: number; billing_date: string | null; est_date: string | null; delay_reason: string | null; carrier: string | null; nave: string | null; container: string | null }>(
      `SELECT id, billing_date, est_date, delay_reason, carrier, nave, container FROM v_units
       WHERE site = ? AND guia IN (?) AND next_step = 'd_carga'${perm.carrier ? " AND carrier = ?" : ""}`,
      perm.carrier ? [site, guias, perm.carrier] : [site, guias],
    );
    if (!units.length) return NextResponse.json({ error: "Esas guías no tienen unidades por embarcar" }, { status: 409 });
    const early = units.find((u) => u.billing_date && date < u.billing_date);
    if (early) return NextResponse.json({ error: `La fecha no puede ser anterior a la facturación (${early.billing_date})` }, { status: 400 });
    const late = units.filter((u) => u.est_date && !u.delay_reason && (date > u.est_date || today() > u.est_date));

    // Se ubica en el próximo lugar libre de la nave (de abajo hacia arriba); si está llena, queda sin ubicar
    const free = nextFree((await planOf(site, nave)).map(slotOf).filter(Boolean) as Slot[], await vesselOf(nave));
    const id = await tx(async (q) => {
      const [c] = await q.query("INSERT INTO containers(site, code, nave, loaded_on, created_by, slot_bay, slot_row, slot_tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
        [site, code, nave, date, s.id, free?.bay ?? null, free?.row ?? null, free?.tier ?? null]);
      const cid = (c as { id: number }[])[0].id;
      const ids = units.map((u) => u.id);
      await q.query("UPDATE units SET d_carga = ?, nave = ?, container = ?, container_id = ? WHERE id IN (?) AND d_carga IS NULL", [date, nave, code, cid, ids]);
      const ev: unknown[][] = units.flatMap((u) => [
        [u.id, s.id, "d_carga", null, date],
        ...(u.nave !== nave ? [[u.id, s.id, "nave", u.nave, nave]] : []),
        ...(u.container !== code ? [[u.id, s.id, "container", u.container, code]] : []),
      ]);
      if (late.length) {
        await q.query("UPDATE units SET delay_reason = ? WHERE id IN (?) AND delay_reason IS NULL", [lateReason, late.map((u) => u.id)]);
        ev.push(...late.map((u) => [u.id, s.id, "delay_reason", null, lateReason]));
      }
      for (let i = 0; i < ev.length; i += 1000) await q.query("INSERT INTO unit_events(unit_id, user_id, field, old_value, new_value) VALUES ?", [ev.slice(i, i + 1000)]);
      return cid;
    });
    return NextResponse.json({ ok: true, id, code, nave, units: units.length, late: late.length });
  }

  // 2. Zarpe de una o varias naves (todas sus unidades embarcadas)
  if (b.action === "sail") {
    if (!perm.sail) return NextResponse.json({ error: "El zarpe no es una etapa asignada a ti" }, { status: 403 });
    const naves = Array.isArray(b.naves) ? [...new Set(b.naves.map((n: unknown) => text(n, 60)).filter(Boolean))] : [];
    if (!naves.length) return NextResponse.json({ error: "Marca al menos una nave" }, { status: 400 });
    const units = await queryList<{ id: number; d_carga: string | null; est_date: string | null; delay_reason: string | null }>(
      `SELECT v.id, v.d_carga, v.est_date, v.delay_reason FROM containers c JOIN v_units v ON v.container_id = c.id
       WHERE c.site = ? AND c.nave IN (?) AND c.sailed_on IS NULL AND v.next_step = 'd_zarpe'`,
      [site, naves],
    );
    if (!units.length) return NextResponse.json({ error: "Esas naves no tienen unidades por zarpar" }, { status: 409 });
    const loaded = units.reduce((m, u) => (u.d_carga && u.d_carga > m ? u.d_carga : m), "");
    if (loaded && date < loaded) return NextResponse.json({ error: `El zarpe no puede ser antes del último embarque (${loaded})` }, { status: 400 });
    const late = units.filter((u) => u.est_date && !u.delay_reason && (date > u.est_date || today() > u.est_date));

    await tx(async (q) => {
      const ids = units.map((u) => u.id);
      for (let i = 0; i < ids.length; i += 1000) await q.query("UPDATE units SET d_zarpe = ? WHERE id IN (?) AND d_zarpe IS NULL", [date, ids.slice(i, i + 1000)]);
      await q.query("UPDATE containers SET sailed_on = ? WHERE site = ? AND nave IN (?) AND sailed_on IS NULL", [date, site, naves]);
      const ev: unknown[][] = units.map((u) => [u.id, s.id, "d_zarpe", null, date]);
      if (late.length) {
        await q.query("UPDATE units SET delay_reason = ? WHERE id IN (?) AND delay_reason IS NULL", [lateReason, late.map((u) => u.id)]);
        ev.push(...late.map((u) => [u.id, s.id, "delay_reason", null, lateReason]));
      }
      for (let i = 0; i < ev.length; i += 1000) await q.query("INSERT INTO unit_events(unit_id, user_id, field, old_value, new_value) VALUES ?", [ev.slice(i, i + 1000)]);
    });
    return NextResponse.json({ ok: true, units: units.length, naves: naves.length, late: late.length });
  }

  return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
}
