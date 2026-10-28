import { NextResponse } from "next/server";
import { queryList, tx } from "@/lib/db";
import { getScope, guard } from "@/lib/guard";
import { isSite, type Site } from "@/lib/hsp";
import { isSuper, today } from "@/lib/workflow";

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
  const nave = p.get("nave")?.trim();
  if (nave) {
    const rows = await queryList<{ cid: number; code: string; loaded_on: string; guia: string | null; district: string | null; dealer: string | null; category: string | null; chassis: string; motor: string | null; material: string | null }>(
      `SELECT c.id cid, c.code, c.loaded_on, u.guia, u.district, d.name dealer, u.category, u.chassis, u.motor, u.material
       FROM containers c JOIN units u ON u.container_id = c.id LEFT JOIN dealers d ON d.id = u.dealer_id
       WHERE c.site = ? AND c.nave = ? AND c.sailed_on IS NULL
       ORDER BY c.id, u.guia, u.chassis`,
      [site, nave],
    );
    return NextResponse.json({ rows });
  }

  const naves = await queryList<{ nave: string; containers: number; w2: number; w3: number; total: number; first: string; last: string; need: number; codes: string }>(
    `SELECT c.nave, COUNT(DISTINCT c.id) containers, SUM(u.category = '2W') w2, SUM(u.category = '3W') w3, COUNT(u.id) total,
       MIN(c.loaded_on) first, MAX(c.loaded_on) last,
       SUM(v.est_date < CURDATE() AND v.delay_reason IS NULL) need,
       string_agg(DISTINCT c.code || '|' || c.id, ',') codes
     FROM containers c JOIN units u ON u.container_id = c.id JOIN v_units v ON v.id = u.id
     WHERE c.site = ? AND c.sailed_on IS NULL
     GROUP BY c.nave ORDER BY MIN(c.loaded_on), c.nave`,
    [site],
  );
  const known = await queryList<{ v: string }>("SELECT DISTINCT UPPER(nave) v FROM units WHERE nave IS NOT NULL AND nave <> '' ORDER BY v LIMIT 300");
  return NextResponse.json({
    site, canEmbark: perm.embark, canSail: perm.sail,
    naves: naves.map((n) => ({
      ...n, containers: Number(n.containers), w2: Number(n.w2 ?? 0), w3: Number(n.w3 ?? 0), total: Number(n.total), need: Number(n.need ?? 0),
      list: (n.codes ?? "").split(",").filter(Boolean).map((x) => { const [code, id] = x.split("|"); return { code, id: Number(id) }; }),
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

  const site = b.site;
  if (!isSite(site)) return NextResponse.json({ error: "Módulo inválido" }, { status: 400 });
  const perm = await can(s, site);
  const date = day(b.date);
  if (!date) return NextResponse.json({ error: "Indica la fecha" }, { status: 400 });
  if (date > today()) return NextResponse.json({ error: "No se puede registrar una fecha futura" }, { status: 400 });

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
    if (late.length && !lateReason) return NextResponse.json({ error: `Hay ${late.length} unidades fuera de tiempo: indica el motivo de demora`, need: late.length }, { status: 400 });

    const id = await tx(async (q) => {
      const [c] = await q.query("INSERT INTO containers(site, code, nave, loaded_on, created_by) VALUES (?, ?, ?, ?, ?) RETURNING id", [site, code, nave, date, s.id]);
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
    if (late.length && !lateReason) return NextResponse.json({ error: `Hay ${late.length} unidades fuera de tiempo: indica el motivo de demora`, need: late.length }, { status: 400 });

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
