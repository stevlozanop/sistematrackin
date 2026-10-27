import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { guard } from "@/lib/guard";

/** Consola The Iceberg Labs · resumen: empresas y consorcios, cuentas por tipo, datos y actividad reciente. */
export async function GET() {
  const { err } = await guard(["dev"]);
  if (err) return err;
  const [[counts], roles, companies, recentUsers, events, [db], [version]] = await Promise.all([
    query<Record<string, number>>(
      `SELECT (SELECT COUNT(*) FROM companies) companies, (SELECT COUNT(*) FROM users) users,
         (SELECT COUNT(*) FROM units) units, (SELECT COUNT(*) FROM units WHERE site='PCL') pcl, (SELECT COUNT(*) FROM units WHERE site='YUR') yur,
         (SELECT COUNT(*) FROM dealers) dealers, (SELECT COUNT(DISTINCT dealer_id) FROM users WHERE role='dealer') dealers_with_account,
         (SELECT COUNT(*) FROM unit_events) events, (SELECT COUNT(*) FROM unit_events WHERE at >= CURDATE()) events_today,
         (SELECT COUNT(*) FROM users WHERE last_seen > NOW() - INTERVAL 60 SECOND) online`,
    ),
    query<{ role: string; n: number }>("SELECT role, COUNT(*) n FROM users GROUP BY role"),
    query(
      `SELECT c.id, c.name, c.kind, c.parent_id, DATE_FORMAT(c.created_at,'%Y-%m-%d') created_at,
         (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) users,
         (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id AND u.role='dealer') dealers,
         (SELECT DATE_FORMAT(MAX(u.last_seen),'%Y-%m-%d %H:%i') FROM users u WHERE u.company_id = c.id) last_seen
       FROM companies c ORDER BY c.parent_id IS NOT NULL, c.name`,
    ),
    query(
      `SELECT u.name, u.email, u.role, c.name company, DATE_FORMAT(u.last_seen,'%Y-%m-%d %H:%i') last_seen,
         (u.last_seen > NOW() - INTERVAL 60 SECOND) online
       FROM users u LEFT JOIN companies c ON c.id = u.company_id
       WHERE u.last_seen IS NOT NULL ORDER BY u.last_seen DESC LIMIT 12`,
    ),
    query(
      `SELECT DATE_FORMAT(e.at,'%Y-%m-%d %H:%i') at, e.field, e.new_value, un.site, un.chassis, us.name AS "user"
       FROM unit_events e JOIN units un ON un.id = e.unit_id LEFT JOIN users us ON us.id = e.user_id
       ORDER BY e.id DESC LIMIT 12`,
    ),
    query<{ tables: number; size_mb: number }>(
      `SELECT COUNT(*) AS tables, ROUND(SUM(pg_total_relation_size(c.oid)) / 1024.0 / 1024, 1) AS size_mb
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    ),
    query<{ v: string }>("SELECT current_setting('server_version') v"),
  ]);
  return NextResponse.json({
    counts: Object.fromEntries(Object.entries(counts ?? {}).map(([k, v]) => [k, Number(v)])),
    roles: Object.fromEntries(roles.map((r) => [r.role, Number(r.n)])),
    companies, recentUsers, events,
    db: { tables: Number(db?.tables ?? 0), sizeMb: Number(db?.size_mb ?? 0), version: version?.v ?? "" },
  });
}
