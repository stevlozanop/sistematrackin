import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { guard } from "@/lib/guard";
import { logDev, readPlatform } from "@/lib/platform";

/**
 * Consola The Iceberg Labs · Control de la plataforma (solo dev):
 * GET  -> modo mantenimiento, cuentas (con quién está conectado), empresas, tablas y registro de acciones
 * POST { action: "maintenance", on, message?, minutes? }
 * POST { action: "close-user", id } · { action: "close-company", id } · { action: "close-all" }
 */
export async function GET() {
  const { err } = await guard(["dev"]);
  if (err) return err;
  const [platform, users, companies, tables, log] = await Promise.all([
    readPlatform(),
    query(`SELECT u.id, u.name, u.email, u.role, c.name AS company, u.company_id,
             (u.last_seen > NOW() - INTERVAL 60 SECOND) AS online, to_char(u.last_seen, 'YYYY-MM-DD HH24:MI') AS last_seen,
             to_char(u.sessions_after, 'YYYY-MM-DD HH24:MI') AS closed_at
           FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.role <> 'dev' ORDER BY (u.last_seen IS NULL), u.last_seen DESC, u.name LIMIT 500`),
    query(`SELECT c.id, c.name, c.kind, (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id OR u.company_id IN (SELECT id FROM companies k WHERE k.parent_id = c.id))::int AS users
           FROM companies c WHERE c.parent_id IS NULL ORDER BY c.name`),
    query(`SELECT relname AS name, n_live_tup::bigint AS rows FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY relname`),
    query(`SELECT a.id, a.action, a.target, a.detail, to_char(a.at, 'YYYY-MM-DD HH24:MI:SS') AS at, u.name AS who
           FROM dev_actions a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.at DESC, a.id DESC LIMIT 60`),
  ]);
  return NextResponse.json({ platform, users, companies, tables, log });
}

export async function POST(req: Request) {
  const { s, err } = await guard(["dev"]);
  if (err) return err;
  const b = await req.json().catch(() => ({}));

  if (b.action === "maintenance") {
    const on = !!b.on;
    const msg = String(b.message ?? "").trim().slice(0, 300) || null;
    const minutes = Math.max(0, Math.min(24 * 60, Math.round(Number(b.minutes) || 0)));
    await query(
      `UPDATE platform SET maintenance = ?, maintenance_msg = ?, maintenance_since = ${on ? "LOCALTIMESTAMP(0)" : "NULL"},
         maintenance_until = ${on && minutes ? `LOCALTIMESTAMP(0) + INTERVAL '${minutes} minutes'` : "NULL"}, maintenance_by = ? WHERE id = 1`,
      [on ? 1 : 0, on ? msg : null, s.id]);
    await logDev(s.id, on ? "Mantenimiento encendido" : "Mantenimiento apagado", null, on ? [msg, minutes ? `${minutes} min` : null].filter(Boolean).join(" · ") : null);
    return NextResponse.json({ ok: true, on });
  }

  if (b.action === "close-user") {
    const [u] = await query<{ id: number; name: string; role: string }>("SELECT id, name, role FROM users WHERE id = ?", [Number(b.id)]);
    if (!u) return NextResponse.json({ error: "Esa cuenta no existe" }, { status: 404 });
    if (u.role === "dev") return NextResponse.json({ error: "Las cuentas de The Iceberg Labs no se cierran desde aquí" }, { status: 400 });
    await query("UPDATE users SET sessions_after = LOCALTIMESTAMP(0) WHERE id = ?", [u.id]);
    await logDev(s.id, "Cerró la sesión de una cuenta", u.name);
    return NextResponse.json({ ok: true, n: 1 });
  }

  if (b.action === "close-company") {
    const [c] = await query<{ id: number; name: string }>("SELECT id, name FROM companies WHERE id = ?", [Number(b.id)]);
    if (!c) return NextResponse.json({ error: "Esa empresa no existe" }, { status: 404 });
    // La empresa y lo que cuelga de ella (consorcios y sus clientes)
    const r = await query<{ id: number }>(
      `UPDATE users SET sessions_after = LOCALTIMESTAMP(0) WHERE role <> 'dev'
         AND (company_id = ? OR company_id IN (SELECT id FROM companies WHERE parent_id = ?)) RETURNING id`, [c.id, c.id]);
    await logDev(s.id, "Cerró las sesiones de una empresa", c.name, `${r.length} cuentas`);
    return NextResponse.json({ ok: true, n: r.length });
  }

  if (b.action === "close-all") {
    const r = await query<{ id: number }>("UPDATE users SET sessions_after = LOCALTIMESTAMP(0) WHERE role <> 'dev' RETURNING id");
    await logDev(s.id, "Cerró todas las sesiones", null, `${r.length} cuentas`);
    return NextResponse.json({ ok: true, n: r.length });
  }

  return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
}
