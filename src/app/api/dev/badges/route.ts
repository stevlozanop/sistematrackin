import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { guard } from "@/lib/guard";
import { healthChecks } from "@/lib/dev-health";

const LIMIT_MB = Number(process.env.DB_LIMIT_MB) || 500;

/** Indicadores del sidebar del dev (en vivo): conectados, fallidos 24 h, espacio usado y estado de la base. */
export async function GET() {
  const { err } = await guard(["dev"]);
  if (err) return err;
  const [[k], health] = await Promise.all([
    query<{ online: number; fails: number; mb: number; dau: number; blocked: number; soon: number }>(
      `SELECT (SELECT COUNT(*) FROM licenses WHERE status = 'suspended' OR expires_at < CURRENT_DATE)::int AS blocked,
         (SELECT COUNT(*) FROM licenses WHERE status = 'active' AND expires_at BETWEEN CURRENT_DATE AND CURRENT_DATE + 15)::int AS soon,
         (SELECT COUNT(*) FROM users WHERE role <> 'dev' AND last_seen > NOW() - INTERVAL 60 SECOND)::int AS online,
         (SELECT COUNT(*) FROM auth_events WHERE kind = 'fail' AND at > NOW() - INTERVAL 1 DAY)::int AS fails,
         ROUND(pg_database_size(current_database()) / 1048576.0, 1) AS mb,
         (SELECT COUNT(DISTINCT p.user_id) FROM page_views p JOIN users u ON u.id = p.user_id AND u.role <> 'dev' WHERE p.at >= CURRENT_DATE)::int AS dau`,
    ),
    healthChecks(),
  ]);
  return NextResponse.json({
    blocked: Number(k?.blocked ?? 0), soon: Number(k?.soon ?? 0),
    online: Number(k?.online ?? 0), fails: Number(k?.fails ?? 0), dau: Number(k?.dau ?? 0),
    dbPct: Math.round((Number(k?.mb ?? 0) / LIMIT_MB) * 1000) / 10, health: health.level,
  });
}
