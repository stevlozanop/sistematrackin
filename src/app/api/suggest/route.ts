import { NextResponse } from "next/server";
import { queryList } from "@/lib/db";
import { getScope, guard } from "@/lib/guard";
import { isSite } from "@/lib/hsp";
import { dealerScope } from "@/lib/clients";

/**
 * Sugerencias para los buscadores mientras se escribe (desde la primera letra):
 * GET ?kind=guia&site=PCL&step=d_carga&q=157   -> guías con unidades que esperan ese paso
 * GET ?kind=guia&step=dispatched&q=…            -> guías ya despachadas (recepción del dealer)
 * GET ?kind=driver&site=PCL&q=vi                -> choferes con entregas pendientes
 * GET ?kind=mine&q=…                            -> guías y chasis del dealer (su portal)
 * Primero las que empiezan con lo escrito, luego las que lo contienen. Máximo 12.
 */
const STEPS = ["d_carga", "d_zarpe", "d_arribo", "d_almacen", "d_despacho", "d_entrega"];

export async function GET(req: Request) {
  const { s, err } = await guard(["admin", "operator", "dealer", "viewer"]);
  if (err) return err;
  const p = new URL(req.url).searchParams;
  const kind = p.get("kind");
  const q = (p.get("q") ?? "").trim().slice(0, 60);
  const like = `%${q}%`, starts = `${q}%`;
  const site = p.get("site");
  const where: string[] = [];
  const args: unknown[] = [];

  // Alcance de la cuenta: el dealer solo lo suyo; el encargado, su transportista
  if (s.role === "dealer") {
    const sc = await dealerScope(s.id);
    if (!sc) return NextResponse.json({ items: [] });
    where.push(sc.sql); args.push(...sc.args);
  } else if (s.role === "operator") {
    const sc = await getScope(s.id);
    if (sc.carrier) { where.push("carrier = ?"); args.push(sc.carrier); }
  }
  if (isSite(site)) { where.push("site = ?"); args.push(site); }

  if (kind === "driver") {
    if (s.role === "dealer") return NextResponse.json({ items: [] });
    const rows = await queryList<{ v: string; n: number }>(
      `SELECT driver v, COUNT(*) n FROM v_units
       WHERE ${[...where, "next_step = 'd_entrega'", "d_despacho IS NOT NULL", "driver IS NOT NULL", "driver LIKE ?"].join(" AND ")}
       GROUP BY driver ORDER BY (driver LIKE ?) DESC, driver LIMIT 12`, [...args, like, starts]);
    return NextResponse.json({ items: rows.map((r) => ({ value: r.v, label: `${Number(r.n)} unidades por entregar` })) });
  }

  if (kind === "mine") {
    const rows = await queryList<{ v: string; t: string; dealer: string | null; status: string }>(
      `(SELECT guia v, 'guia' t, MAX(dealer) dealer, MAX(status) status FROM v_units WHERE ${[...where, "guia LIKE ?"].join(" AND ")} GROUP BY guia LIMIT 8)
       UNION ALL
       (SELECT chassis v, 'chasis' t, dealer, status FROM v_units WHERE ${[...where, "(chassis LIKE ? OR motor LIKE ?)"].join(" AND ")} LIMIT 6)`,
      [...args, like, ...args, like, like]);
    return NextResponse.json({ items: rows.map((r) => ({ value: r.v, label: `${r.t === "guia" ? "Guía" : "Chasis"} · ${r.dealer ?? ""} · ${r.status}` })) });
  }

  if (kind === "guia") {
    const step = p.get("step");
    if (step === "dispatched") where.push("d_despacho IS NOT NULL");
    else if (step && STEPS.includes(step)) where.push(`next_step = '${step}'`);
    const rows = await queryList<{ v: string; n: number; dealer: string | null; district: string | null }>(
      `SELECT guia v, COUNT(*) n, MAX(dealer) dealer, MAX(district) district FROM v_units
       WHERE ${[...where, "guia IS NOT NULL", "guia LIKE ?"].join(" AND ")}
       GROUP BY guia ORDER BY (guia LIKE ?) DESC, guia LIMIT 12`, [...args, like, starts]);
    return NextResponse.json({ items: rows.map((r) => ({ value: r.v, label: `${r.dealer ?? "—"} · ${r.district ?? "—"} · ${Number(r.n)} motos` })) });
  }

  return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
}
