import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { guard } from "@/lib/guard";

/**
 * Consola The Iceberg Labs · Adopción (métricas de producto, datos reales, sin contar al dev):
 * activos por día, semana y mes; cuántos volvieron esta semana; adopción por empresa y por tipo de cuenta;
 * y qué pantallas usa cada tipo de cuenta.
 */
export async function GET() {
  const { err } = await guard(["dev"]);
  if (err) return err;
  const real = "JOIN users u ON u.id = p.user_id AND u.role <> 'dev'";
  const [[k], daily, companies, roles, screens] = await Promise.all([
    query<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE role <> 'dev') AS accounts,
         (SELECT COUNT(DISTINCT p.user_id) FROM page_views p ${real} WHERE p.at >= CURRENT_DATE) AS dau,
         (SELECT COUNT(DISTINCT p.user_id) FROM page_views p ${real} WHERE p.at > NOW() - INTERVAL 7 DAY) AS wau,
         (SELECT COUNT(DISTINCT p.user_id) FROM page_views p ${real} WHERE p.at > NOW() - INTERVAL 30 DAY) AS mau,
         (SELECT COUNT(DISTINCT p.user_id) FROM page_views p ${real} WHERE p.at > NOW() - INTERVAL 14 DAY AND p.at <= NOW() - INTERVAL 7 DAY) AS last_week,
         (SELECT COUNT(*) FROM (SELECT DISTINCT p.user_id FROM page_views p ${real} WHERE p.at > NOW() - INTERVAL 14 DAY AND p.at <= NOW() - INTERVAL 7 DAY) a
            WHERE EXISTS (SELECT 1 FROM page_views q WHERE q.user_id = a.user_id AND q.at > NOW() - INTERVAL 7 DAY)) AS returned,
         (SELECT ROUND(AVG(n), 1) FROM (SELECT COUNT(*) AS n FROM page_views p ${real} WHERE p.at > NOW() - INTERVAL 7 DAY GROUP BY p.user_id, p.at::date) x) AS views_per_session`,
    ),
    query<{ d: string; n: number }>(
      `SELECT to_char(p.at::date, 'YYYY-MM-DD') AS d, COUNT(DISTINCT p.user_id)::int AS n FROM page_views p ${real}
       WHERE p.at > NOW() - INTERVAL 30 DAY GROUP BY 1 ORDER BY 1`,
    ),
    query(
      `SELECT c.id, c.name::text AS name, c.kind::text AS kind,
         (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id)::int AS accounts,
         (SELECT COUNT(DISTINCT p.user_id) FROM page_views p JOIN users u ON u.id = p.user_id WHERE u.company_id = c.id AND p.at > NOW() - INTERVAL 7 DAY)::int AS wau,
         (SELECT COUNT(DISTINCT p.user_id) FROM page_views p JOIN users u ON u.id = p.user_id WHERE u.company_id = c.id AND p.at > NOW() - INTERVAL 30 DAY)::int AS mau,
         (SELECT COUNT(*) FROM page_views p JOIN users u ON u.id = p.user_id WHERE u.company_id = c.id AND p.at > NOW() - INTERVAL 30 DAY)::int AS views,
         (SELECT COUNT(*) FROM unit_events e JOIN users u ON u.id = e.user_id WHERE u.company_id = c.id AND e.at > NOW() - INTERVAL 30 DAY)::int AS events,
         to_char((SELECT MAX(p.at) FROM page_views p JOIN users u ON u.id = p.user_id WHERE u.company_id = c.id), 'YYYY-MM-DD HH24:MI') AS last_at
       FROM companies c ORDER BY wau DESC, c.name`,
    ),
    query(
      `SELECT u.role::text AS role, COUNT(*)::int AS accounts,
         COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM page_views p WHERE p.user_id = u.id AND p.at > NOW() - INTERVAL 7 DAY))::int AS wau,
         COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM page_views p WHERE p.user_id = u.id AND p.at > NOW() - INTERVAL 30 DAY))::int AS mau
       FROM users u WHERE u.role <> 'dev' GROUP BY 1`,
    ),
    query<{ role: string; path: string; n: number }>(
      `SELECT u.role::text AS role, regexp_replace(p.path, '^/units/(pcl|yur).*$', '/units/\\1', 'i') AS path, COUNT(*)::int AS n
       FROM page_views p ${real} WHERE p.at > NOW() - INTERVAL 30 DAY GROUP BY 1, 2 ORDER BY 3 DESC`,
    ),
  ]);
  const num = (v: unknown) => Number(v ?? 0);
  return NextResponse.json({
    kpis: Object.fromEntries(Object.entries(k ?? {}).map(([a, v]) => [a, num(v)])),
    daily: daily.map((r) => ({ d: r.d, n: num(r.n) })),
    companies, roles, screens: screens.map((s) => ({ ...s, n: num(s.n) })),
  });
}
