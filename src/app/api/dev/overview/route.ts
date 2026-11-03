import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { guard } from "@/lib/guard";

const LIMIT_MB = Number(process.env.DB_LIMIT_MB) || 500;
const num = (v: unknown) => Number(v ?? 0);

/**
 * Consola The Iceberg Labs · Dashboard general: todo de la plataforma en una sola respuesta, con datos reales.
 * - live: lo que mueve la figura (conectados, conexiones a la base, espacio, caché, llamadas a la API).
 * - counts: empresas, cuentas por tipo, unidades, dealers, registros.
 * - companies: cada empresa o consorcio con sus cuentas y su actividad de 7 días.
 * - heat: pantallas abiertas por día de la semana y hora (últimos 28 días).
 * - screens / people: lo más usado y quién más lo usa (7 días). Sin contar a The Iceberg Labs.
 */
export async function GET() {
  const { err } = await guard(["dev"]);
  if (err) return err;
  const [[live], [counts], roles, companies, heat, screens, people] = await Promise.all([
    query<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE last_seen > NOW() - INTERVAL 60 SECOND AND role <> 'dev') AS online,
         (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database()) AS conns,
         current_setting('max_connections')::int AS max_conns,
         ROUND(pg_database_size(current_database()) / 1048576.0, 2) AS db_mb,
         (SELECT ROUND(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 2) FROM pg_stat_database WHERE datname = current_database()) AS cache_hit,
         (SELECT COALESCE(SUM(n), 0) FROM api_usage WHERE hour = date_trunc('hour', LOCALTIMESTAMP(0)) AND role <> 'dev') AS api_hour,
         EXTRACT(MINUTE FROM LOCALTIMESTAMP)::int + 1 AS minutes,
         (SELECT COALESCE(SUM(n), 0) FROM api_usage WHERE hour > NOW() - INTERVAL 30 DAY AND role <> 'dev') AS api_30d,
         (SELECT COUNT(*) FROM page_views p JOIN users u ON u.id = p.user_id WHERE p.at >= CURRENT_DATE AND u.role <> 'dev') AS views_today,
         (SELECT COUNT(*) FROM auth_events WHERE kind = 'login' AND at > NOW() - INTERVAL 30 DAY) AS logins_30d,
         (SELECT COUNT(*) FROM auth_events WHERE kind = 'fail' AND at > NOW() - INTERVAL 30 DAY) AS fails_30d`,
    ),
    query<Record<string, number>>(
      `SELECT (SELECT COUNT(*) FROM companies WHERE kind = 'transport') AS transport, (SELECT COUNT(*) FROM companies WHERE kind = 'client') AS consortia,
         (SELECT COUNT(*) FROM users WHERE role <> 'dev') AS accounts,
         (SELECT COUNT(*) FROM users WHERE role <> 'dev' AND last_seen > NOW() - INTERVAL 7 DAY) AS active_7d,
         (SELECT COUNT(*) FROM users WHERE role <> 'dev' AND last_seen IS NULL) AS never,
         (SELECT COUNT(*) FROM units) AS units, (SELECT COUNT(*) FROM units WHERE site = 'PCL') AS pcl, (SELECT COUNT(*) FROM units WHERE site = 'YUR') AS yur,
         (SELECT COUNT(*) FROM dealers) AS dealers, (SELECT COUNT(DISTINCT dealer_id) FROM users WHERE role = 'dealer') AS dealers_with_account,
         (SELECT COUNT(*) FROM unit_events) AS events, (SELECT COUNT(*) FROM unit_events WHERE at >= CURRENT_DATE) AS events_today,
         (SELECT COUNT(*) FROM import_batches) AS imports`,
    ),
    query<{ role: string; n: number; online: number }>(
      "SELECT role::text AS role, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL 60 SECOND)::int AS online FROM users WHERE role <> 'dev' GROUP BY 1",
    ),
    query(
      `SELECT c.id, c.name, c.kind, c.parent_id,
         (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id)::int AS accounts,
         (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id AND u.last_seen > NOW() - INTERVAL 7 DAY)::int AS active_7d,
         (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id AND u.last_seen > NOW() - INTERVAL 60 SECOND)::int AS online,
         (SELECT COUNT(*) FROM page_views p JOIN users u ON u.id = p.user_id WHERE u.company_id = c.id AND p.at > NOW() - INTERVAL 7 DAY)::int AS views_7d,
         to_char((SELECT MAX(u.last_seen) FROM users u WHERE u.company_id = c.id), 'YYYY-MM-DD HH24:MI') AS last_seen
       FROM companies c ORDER BY c.parent_id IS NOT NULL, c.name`,
    ),
    query<{ dow: number; h: number; n: number }>(
      `SELECT EXTRACT(ISODOW FROM p.at)::int AS dow, EXTRACT(HOUR FROM p.at)::int AS h, COUNT(*)::int AS n
       FROM page_views p JOIN users u ON u.id = p.user_id WHERE p.at > NOW() - INTERVAL 28 DAY AND u.role <> 'dev' GROUP BY 1, 2`,
    ),
    query<{ path: string; n: number; people: number }>(
      `SELECT regexp_replace(p.path, '^/units/(pcl|yur).*$', '/units/\\1', 'i') AS path, COUNT(*)::int AS n, COUNT(DISTINCT p.user_id)::int AS people
       FROM page_views p JOIN users u ON u.id = p.user_id WHERE p.at > NOW() - INTERVAL 7 DAY AND u.role <> 'dev'
       GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    ),
    query<{ id: number; name: string; role: string; company: string | null; views: number; events: number; online: number }>(
      `SELECT * FROM (SELECT u.id, u.name::text AS name, u.role::text AS role, c.name::text AS company, u.last_seen,
         (SELECT COUNT(*) FROM page_views p WHERE p.user_id = u.id AND p.at > NOW() - INTERVAL 7 DAY)::int AS views,
         (SELECT COUNT(*) FROM unit_events e WHERE e.user_id = u.id AND e.at > NOW() - INTERVAL 7 DAY)::int AS events,
         (u.last_seen > NOW() - INTERVAL 60 SECOND)::int AS online
       FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.role <> 'dev') t
       ORDER BY t.views + t.events DESC, t.last_seen DESC NULLS LAST LIMIT 6`,
    ),
  ]);
  const L = Object.fromEntries(Object.entries(live ?? {}).map(([k, v]) => [k, num(v)]));
  return NextResponse.json({
    live: { ...L, limit_mb: LIMIT_MB, api_per_min: L.minutes ? Math.round((L.api_hour / L.minutes) * 10) / 10 : 0 },
    counts: Object.fromEntries(Object.entries(counts ?? {}).map(([k, v]) => [k, num(v)])),
    roles: roles.map((r) => ({ role: r.role, n: num(r.n), online: num(r.online) })),
    companies, heat: heat.map((h) => ({ dow: num(h.dow), h: num(h.h), n: num(h.n) })),
    screens: screens.map((s) => ({ ...s, n: num(s.n), people: num(s.people) })),
    people: people.map((p) => ({ ...p, views: num(p.views), events: num(p.events), online: num(p.online) })),
  });
}
