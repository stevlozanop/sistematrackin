import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { guard } from "@/lib/guard";

/**
 * Consola The Iceberg Labs · Seguridad (datos reales):
 * intentos fallidos por correo e IP (5 o más en 7 días = sospechoso), ingresos desde un dispositivo o IP que esa cuenta
 * no había usado antes, y cuentas sin uso (nunca ingresaron o más de 30 días sin entrar).
 */
export async function GET() {
  const { err } = await guard(["dev"]);
  if (err) return err;
  const [[k], attempts, logins, idle, byDay] = await Promise.all([
    query<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*) FROM auth_events WHERE kind = 'fail' AND at > NOW() - INTERVAL 1 DAY) AS fails_24h,
         (SELECT COUNT(*) FROM auth_events WHERE kind = 'fail' AND at > NOW() - INTERVAL 7 DAY) AS fails_7d,
         (SELECT COUNT(DISTINCT ip) FROM auth_events WHERE kind = 'fail' AND at > NOW() - INTERVAL 7 DAY) AS fail_ips,
         (SELECT COUNT(*) FROM auth_events WHERE kind = 'login' AND at > NOW() - INTERVAL 7 DAY) AS logins_7d,
         (SELECT COUNT(*) FROM users WHERE role <> 'dev' AND last_seen IS NULL) AS never,
         (SELECT COUNT(*) FROM users WHERE role <> 'dev' AND last_seen < NOW() - INTERVAL 30 DAY) AS idle_30d,
         (SELECT COUNT(*) FROM users WHERE role IN ('dev', 'admin')) AS privileged`,
    ),
    // Intentos fallidos agrupados por correo e IP
    query(
      `SELECT a.email::text AS email, a.ip, COUNT(*)::int AS n, to_char(MAX(a.at), 'YYYY-MM-DD HH24:MI') AS last_at,
         u.id AS user_id, u.name::text AS name, u.role::text AS role,
         (SELECT COUNT(*) FROM auth_events s WHERE s.kind = 'login' AND s.email = a.email AND s.at > MAX(a.at))::int AS logged_after
       FROM auth_events a LEFT JOIN users u ON u.email = a.email
       WHERE a.kind = 'fail' AND a.at > NOW() - INTERVAL 7 DAY
       GROUP BY a.email, a.ip, u.id, u.name, u.role ORDER BY n DESC, last_at DESC LIMIT 40`,
    ),
    // Últimos ingresos; "nuevo" = la cuenta nunca había entrado desde ese navegador o esa IP
    query(
      `SELECT a.id, to_char(a.at, 'YYYY-MM-DD HH24:MI') AS at, a.ip, a.agent, u.id AS user_id, u.name::text AS name, u.role::text AS role, c.name::text AS company,
         NOT EXISTS (SELECT 1 FROM auth_events b WHERE b.user_id = a.user_id AND b.kind = 'login' AND b.id < a.id AND b.agent IS NOT DISTINCT FROM a.agent) AS new_device,
         NOT EXISTS (SELECT 1 FROM auth_events b WHERE b.user_id = a.user_id AND b.kind = 'login' AND b.id < a.id AND b.ip IS NOT DISTINCT FROM a.ip) AS new_ip
       FROM auth_events a JOIN users u ON u.id = a.user_id LEFT JOIN companies c ON c.id = u.company_id
       WHERE a.kind = 'login' ORDER BY a.id DESC LIMIT 30`,
    ),
    // Cuentas sin uso: candidatas a revisar o dar de baja
    query(
      `SELECT u.id, u.name::text AS name, u.email::text AS email, u.role::text AS role, c.name::text AS company,
         to_char(u.created_at, 'YYYY-MM-DD') AS created_at, to_char(u.last_seen, 'YYYY-MM-DD') AS last_seen,
         (CURRENT_DATE - COALESCE(u.last_seen, u.created_at)::date)::int AS days
       FROM users u LEFT JOIN companies c ON c.id = u.company_id
       WHERE u.role <> 'dev' AND (u.last_seen IS NULL OR u.last_seen < NOW() - INTERVAL 30 DAY)
       ORDER BY days DESC LIMIT 40`,
    ),
    query<{ d: string; ok: number; fail: number }>(
      `SELECT to_char(at::date, 'YYYY-MM-DD') AS d, COUNT(*) FILTER (WHERE kind = 'login')::int AS ok, COUNT(*) FILTER (WHERE kind = 'fail')::int AS fail
       FROM auth_events WHERE at > NOW() - INTERVAL 14 DAY GROUP BY 1 ORDER BY 1`,
    ),
  ]);
  return NextResponse.json({
    kpis: Object.fromEntries(Object.entries(k ?? {}).map(([a, v]) => [a, Number(v)])),
    attempts, logins, idle, byDay: byDay.map((r) => ({ d: r.d, ok: Number(r.ok), fail: Number(r.fail) })),
  });
}
