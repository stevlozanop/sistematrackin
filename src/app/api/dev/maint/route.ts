import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { guard } from "@/lib/guard";
import { logDev } from "@/lib/platform";

/**
 * Consola The Iceberg Labs · mantenimiento de la base (solo dev):
 * - vacuum: limpia las filas muertas de una tabla y actualiza sus estadísticas (VACUUM ANALYZE)
 * - vacuum-needed: lo mismo en todas las tablas que lo necesitan (≥ 10% muertas y más de 1 000 filas)
 * - analyze: solo actualiza estadísticas (el planificador elige mejor cómo leer)
 * - cancel: detiene la consulta de un proceso (la conexión sigue viva)
 * - terminate: corta la conexión de un proceso (lo último, si cancel no basta)
 */
type Stat = { name: string; live: number; dead: number };
const statOf = async (name?: string) => query<Stat>(
  `SELECT relname AS name, n_live_tup::bigint AS live, n_dead_tup::bigint AS dead FROM pg_stat_user_tables
   WHERE schemaname = 'public'${name ? " AND relname = ?" : ""} ORDER BY relname`, name ? [name] : []);
const num = (v: unknown) => Number(v ?? 0);
const quoted = (t: string) => `"public"."${t.replace(/"/g, '""')}"`;

export async function POST(req: Request) {
  const { s, err } = await guard(["dev"]);
  if (err) return err;
  const b = await req.json().catch(() => ({}));
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);

  if (b.action === "vacuum" || b.action === "analyze") {
    const table = String(b.table ?? "");
    const [before] = await statOf(table);
    if (!before) return NextResponse.json({ error: "Esa tabla no existe" }, { status: 404 });
    await query(`${b.action === "vacuum" ? "VACUUM (ANALYZE)" : "ANALYZE"} ${quoted(table)}`);
    const [after] = await statOf(table);
    await logDev(s.id, b.action === "vacuum" ? "Limpió una tabla" : "Actualizó estadísticas", table, `${num(before.dead)} → ${num(after?.dead)} filas muertas`);
    return NextResponse.json({ ok: true, table, before: num(before.dead), after: num(after?.dead), ms: ms(), by: s.id });
  }

  if (b.action === "vacuum-needed") {
    const all = await statOf();
    const need = all.filter((t) => num(t.live) + num(t.dead) > 1000 && num(t.dead) / (num(t.live) + num(t.dead)) >= 0.1);
    const done: { table: string; before: number }[] = [];
    for (const t of need) { await query(`VACUUM (ANALYZE) ${quoted(t.name)}`); done.push({ table: t.name, before: num(t.dead) }); }
    await logDev(s.id, "Limpió las tablas que lo necesitaban", done.map((d) => d.table).join(", ") || "ninguna");
    return NextResponse.json({ ok: true, tables: done, ms: ms() });
  }

  if (b.action === "analyze-all") {
    await query("ANALYZE");
    await logDev(s.id, "Actualizó estadísticas de toda la base");
    return NextResponse.json({ ok: true, ms: ms() });
  }

  if (b.action === "cancel" || b.action === "terminate") {
    const pid = Number(b.pid);
    // Solo procesos de esta base y nunca el propio
    const [p] = await query<{ pid: number }>("SELECT pid FROM pg_stat_activity WHERE pid = ? AND datname = current_database() AND pid <> pg_backend_pid()", [pid]);
    if (!p) return NextResponse.json({ error: "Ese proceso ya no existe" }, { status: 404 });
    const fn = b.action === "cancel" ? "pg_cancel_backend" : "pg_terminate_backend";
    const [r] = await query<{ ok: boolean }>(`SELECT ${fn}(?) AS ok`, [pid]);
    if (!r?.ok) return NextResponse.json({ error: "Postgres no permitió detenerlo (puede ser un proceso del sistema)" }, { status: 409 });
    await logDev(s.id, b.action === "cancel" ? "Detuvo una consulta" : "Cortó una conexión", `proceso ${pid}`);
    return NextResponse.json({ ok: true, pid });
  }

  return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
}
