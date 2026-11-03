import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { guard } from "@/lib/guard";
import { feed } from "@/lib/dev-feed";

/**
 * Consola The Iceberg Labs · En vivo: quién está conectado ahora, actividad de hoy y de las últimas 24 horas
 * (pantallas, llamadas a la API, ingresos, fechas registradas) y las últimas interacciones. Sin contar al dev.
 */
export async function GET(req: Request) {
  const { err } = await guard(["dev"]);
  if (err) return err;
  const withDev = new URL(req.url).searchParams.get("dev") === "1";
  const noDev = withDev ? "" : "AND u.role <> 'dev'";
  const [[k], hours, online, recent] = await Promise.all([
    query<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*) FROM users u WHERE u.last_seen > NOW() - INTERVAL 60 SECOND ${noDev}) online,
         (SELECT COUNT(*) FROM users u WHERE u.last_seen >= CURRENT_DATE ${noDev}) active_today,
         (SELECT COUNT(*) FROM users u WHERE u.last_seen > NOW() - INTERVAL 7 DAY ${noDev}) active_7d,
         (SELECT COUNT(*) FROM users u WHERE TRUE ${noDev}) accounts,
         (SELECT COUNT(*) FROM page_views p JOIN users u ON u.id = p.user_id WHERE p.at >= CURRENT_DATE ${noDev}) views_today,
         (SELECT COUNT(*) FROM auth_events a LEFT JOIN users u ON u.id = a.user_id WHERE a.kind = 'login' AND a.at >= CURRENT_DATE ${withDev ? "" : "AND (u.role IS NULL OR u.role <> 'dev')"}) logins_today,
         (SELECT COUNT(*) FROM auth_events a WHERE a.kind = 'fail' AND a.at >= CURRENT_DATE) fails_today,
         (SELECT COALESCE(SUM(n), 0) FROM api_usage WHERE hour >= CURRENT_DATE ${withDev ? "" : "AND role <> 'dev'"}) api_today,
         (SELECT COUNT(*) FROM unit_events WHERE at >= CURRENT_DATE) events_today,
         (SELECT COUNT(*) FROM import_batches WHERE created_at >= CURRENT_DATE) imports_today,
         (SELECT ROUND(pg_database_size(current_database()) / 1048576.0, 1)) db_mb`,
    ),
    // Últimas 24 horas, hora por hora
    query<{ h: string; views: number; api: number; events: number; logins: number }>(
      `WITH hs AS (SELECT generate_series(date_trunc('hour', LOCALTIMESTAMP) - INTERVAL '23 hours', date_trunc('hour', LOCALTIMESTAMP), INTERVAL '1 hour') AS h)
       SELECT to_char(hs.h, 'YYYY-MM-DD HH24:00') AS h,
         (SELECT COUNT(*) FROM page_views p JOIN users u ON u.id = p.user_id WHERE p.at >= hs.h AND p.at < hs.h + INTERVAL '1 hour' ${noDev})::int AS views,
         (SELECT COALESCE(SUM(n), 0) FROM api_usage a WHERE a.hour = hs.h ${withDev ? "" : "AND a.role <> 'dev'"})::int AS api,
         (SELECT COUNT(*) FROM unit_events e WHERE e.at >= hs.h AND e.at < hs.h + INTERVAL '1 hour')::int AS events,
         (SELECT COUNT(*) FROM auth_events a WHERE a.kind = 'login' AND a.at >= hs.h AND a.at < hs.h + INTERVAL '1 hour')::int AS logins
       FROM hs ORDER BY hs.h`,
    ),
    // Conectados ahora y la pantalla en la que están
    query(
      `SELECT u.id, u.name, u.role, c.name AS company, to_char(u.last_seen, 'HH24:MI:SS') AS last_seen,
         (SELECT p.path FROM page_views p WHERE p.user_id = u.id ORDER BY p.at DESC LIMIT 1) AS path,
         (SELECT to_char(MIN(p.at), 'HH24:MI') FROM page_views p WHERE p.user_id = u.id AND p.at >= CURRENT_DATE) AS since
       FROM users u LEFT JOIN companies c ON c.id = u.company_id
       WHERE u.last_seen > NOW() - INTERVAL 60 SECOND ${noDev}
       ORDER BY u.last_seen DESC`,
    ),
    feed({ withDev, limit: 25, days: 2 }),
  ]);
  return NextResponse.json({
    kpis: Object.fromEntries(Object.entries(k ?? {}).map(([key, v]) => [key, Number(v)])),
    hours: hours.map((h) => ({ ...h, views: Number(h.views), api: Number(h.api), events: Number(h.events), logins: Number(h.logins) })),
    online, recent,
  });
}
