import { NextResponse } from "next/server";
import { query, queryList, tx } from "@/lib/db";
import { getScope, guard } from "@/lib/guard";
import { isSite, type Site } from "@/lib/hsp";
import { dealerScope } from "@/lib/clients";
import { isSuper, today } from "@/lib/workflow";

/**
 * 6. Entrega al dealer, desde dos lados:
 * - Conductor: busca su nombre, ve lo que lleva (guías en «Tránsito dealer») y marca lo que entregó → «Entregado».
 * - Dealer: busca su guía y confirma la recepción: completa o con observación (la empresa revisa las observaciones).
 *
 * GET  ?site=PCL&driver=VIDAL           -> guías que lleva ese chofer y aún no entrega
 * GET  ?site=PCL&drivers=1              -> choferes con entregas pendientes
 * GET  ?guia=…                          -> la guía para el dealer: tipo, dealer, total, estado y recepciones
 * GET  ?observations=1                  -> recepciones con observación (empresa)
 * POST { action: "deliver", site, guias: [], date, lateReason? }
 * POST { action: "receive", guia, kind: "completo" | "observacion", note?, date }
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
  const { s, err } = await guard(["admin", "operator", "dealer"]);
  if (err) return err;
  const p = new URL(req.url).searchParams;

  if (p.get("observations")) {
    if (s.role !== "admin") return NextResponse.json({ error: "Solo la empresa revisa las observaciones" }, { status: 403 });
    const rows = await queryList(
      `SELECT r.id, r.site, r.guia, r.note, r.received_on, r.units, r.created_at, u.name usuario,
         (SELECT string_agg(DISTINCT v.dealer::text, ', ') FROM v_units v WHERE v.site = r.site AND v.guia = r.guia) dealer
       FROM receptions r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.kind = 'observacion' AND r.reviewed_at IS NULL ORDER BY r.created_at DESC LIMIT 100`);
    return NextResponse.json({ rows });
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
    const rows = await queryList<{ v: string; n: number }>(
      `SELECT driver v, COUNT(*) n FROM v_units WHERE site = ? AND next_step = 'd_entrega' AND d_despacho IS NOT NULL AND driver IS NOT NULL${scope} GROUP BY driver ORDER BY driver`, [site, ...sargs]);
    return NextResponse.json({ canDeliver: perm.ok, drivers: rows.map((r) => ({ name: r.v, units: num(r.n) })) });
  }

  const driver = p.get("driver")?.trim();
  if (!driver) return NextResponse.json({ error: "Escribe el nombre del conductor" }, { status: 400 });
  const rows = await queryList<{ guia: string | null; district: string | null; dealer: string | null; driver: string; w2: number; w3: number; total: number; dispatched: string; need: number }>(
    `SELECT guia, district, dealer, driver, SUM(category = '2W') w2, SUM(category = '3W') w3, COUNT(*) total, MAX(d_despacho) dispatched,
       SUM(est_date < CURDATE() AND delay_reason IS NULL) need
     FROM v_units WHERE site = ? AND next_step = 'd_entrega' AND d_despacho IS NOT NULL AND driver ILIKE ?${scope}
     GROUP BY guia, district, dealer, driver ORDER BY district, dealer, guia`, [site, `%${driver}%`, ...sargs]);
  return NextResponse.json({ canDeliver: perm.ok, rows: rows.map((r) => ({ ...r, w2: num(r.w2), w3: num(r.w3), total: num(r.total), need: num(r.need) })) });
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
  async function deliver(units: U[], lateReason: string | null, needReason: boolean) {
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
    });
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
    const units = await queryList<U>(
      `SELECT id, d_despacho, est_date, delay_reason FROM v_units WHERE site = ? AND guia IN (?) AND next_step = 'd_entrega' AND d_despacho IS NOT NULL${perm.carrier ? " AND carrier = ?" : ""}`,
      perm.carrier ? [site, guias, perm.carrier] : [site, guias]);
    if (!units.length) return NextResponse.json({ error: "Esas guías no tienen unidades por entregar" }, { status: 409 });
    const r = await deliver(units, lateReason, true);
    if (typeof r === "string") return NextResponse.json({ error: r }, { status: 400 });
    if (r?.need) return NextResponse.json({ error: `Hay ${r.need} unidades fuera de tiempo: indica el motivo de demora`, need: r.need }, { status: 400 });
    return NextResponse.json({ ok: true, units: units.length });
  }

  // Dealer: confirma la recepción de su guía
  if (b.action === "receive") {
    const guia = String(b.guia ?? "").trim();
    const kind = b.kind === "observacion" ? "observacion" : b.kind === "completo" ? "completo" : null;
    const note = String(b.note ?? "").trim().slice(0, 500) || null;
    if (!guia) return NextResponse.json({ error: "Indica la guía" }, { status: 400 });
    if (!kind) return NextResponse.json({ error: "Elige si llegó completo o con observación" }, { status: 400 });
    if (kind === "observacion" && !note) return NextResponse.json({ error: "Escribe la observación" }, { status: 400 });
    let sc: { sql: string; args: unknown[] } | null = null;
    if (s.role === "dealer") {
      sc = await dealerScope(s.id);
      if (!sc) return NextResponse.json({ error: "Tu cuenta no tiene tiendas asignadas" }, { status: 403 });
    }
    const all = await queryList<U & { site: Site; next_step: string | null }>(
      `SELECT id, site, next_step, d_despacho, est_date, delay_reason FROM v_units WHERE guia = ? AND d_despacho IS NOT NULL${sc ? ` AND ${sc.sql}` : ""}`, [guia, ...(sc?.args ?? [])]);
    if (!all.length) return NextResponse.json({ error: "Esa guía todavía no fue despachada" }, { status: 409 });
    const site = all[0].site;
    if (s.role === "operator" && !(await canDeliver(s, site)).ok) return NextResponse.json({ error: "La entrega no es una etapa asignada a ti" }, { status: 403 });
    const pending = all.filter((u) => u.next_step === "d_entrega");
    if (pending.length) {
      const r = await deliver(pending, null, false);
      if (typeof r === "string") return NextResponse.json({ error: r }, { status: 400 });
    }
    await query("INSERT INTO receptions(site, guia, kind, note, received_on, units, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)", [site, guia, kind, note, date, all.length, s.id]);
    return NextResponse.json({ ok: true, units: all.length, delivered: pending.length, kind });
  }

  return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
}
