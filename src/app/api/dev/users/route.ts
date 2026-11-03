import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { guard } from "@/lib/guard";

/** Consola The Iceberg Labs · Usuarios reales: conexión, ingresos, pantallas vistas, registros y navegador de cada cuenta. */
export async function GET() {
  const { err } = await guard(["dev"]);
  if (err) return err;
  const users = await query(
    `SELECT u.id, u.name, u.email, u.role, (c.owner_id = u.id) AS is_owner, c.name AS company,
       to_char(u.created_at, 'YYYY-MM-DD') AS created_at,
       to_char(u.last_seen, 'YYYY-MM-DD HH24:MI') AS last_seen,
       (u.last_seen > NOW() - INTERVAL 60 SECOND) AS online,
       (SELECT to_char(MAX(a.at), 'YYYY-MM-DD HH24:MI') FROM auth_events a WHERE a.user_id = u.id AND a.kind = 'login') AS last_login,
       (SELECT COUNT(*) FROM auth_events a WHERE a.user_id = u.id AND a.kind = 'login' AND a.at > NOW() - INTERVAL 30 DAY)::int AS logins_30d,
       (SELECT COUNT(*) FROM auth_events a WHERE a.user_id = u.id AND a.kind = 'fail' AND a.at > NOW() - INTERVAL 30 DAY)::int AS fails_30d,
       (SELECT COUNT(*) FROM page_views p WHERE p.user_id = u.id AND p.at > NOW() - INTERVAL 7 DAY)::int AS views_7d,
       (SELECT COUNT(DISTINCT p.at::date) FROM page_views p WHERE p.user_id = u.id AND p.at > NOW() - INTERVAL 30 DAY)::int AS days_30d,
       (SELECT p.path FROM page_views p WHERE p.user_id = u.id ORDER BY p.at DESC LIMIT 1) AS last_path,
       (SELECT COUNT(*) FROM unit_events e WHERE e.user_id = u.id AND e.at > NOW() - INTERVAL 30 DAY)::int AS events_30d,
       (SELECT COUNT(*) FROM import_batches b WHERE b.user_id = u.id)::int AS imports,
       (SELECT a.agent FROM auth_events a WHERE a.user_id = u.id AND a.kind = 'login' ORDER BY a.at DESC LIMIT 1) AS agent,
       (SELECT a.ip FROM auth_events a WHERE a.user_id = u.id AND a.kind = 'login' ORDER BY a.at DESC LIMIT 1) AS ip
     FROM users u LEFT JOIN companies c ON c.id = u.company_id
     ORDER BY (u.last_seen > NOW() - INTERVAL 60 SECOND) DESC, u.last_seen DESC NULLS LAST, u.name`,
  );
  return NextResponse.json({ users });
}
