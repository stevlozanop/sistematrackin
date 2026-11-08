import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { guard } from "@/lib/guard";
import { logDev } from "@/lib/platform";
import { accountEvent } from "@/lib/security";

/**
 * Consola The Iceberg Labs · Seguridad (datos reales):
 * intentos fallidos por correo e IP (5 o más en 7 días = sospechoso), ingresos desde un dispositivo o IP que esa cuenta
 * no había usado antes, y cuentas sin uso (nunca ingresaron o más de 30 días sin entrar).
 */
export async function GET() {
  const { err } = await guard(["dev"]);
  if (err) return err;
  const [[k], attempts, logins, idle, byDay, blocks, suspended, privileged, changes] = await Promise.all([
    query<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*) FROM auth_events WHERE kind = 'fail' AND at > NOW() - INTERVAL 1 DAY) AS fails_24h,
         (SELECT COUNT(*) FROM auth_events WHERE kind = 'fail' AND at > NOW() - INTERVAL 7 DAY) AS fails_7d,
         (SELECT COUNT(DISTINCT ip) FROM auth_events WHERE kind = 'fail' AND at > NOW() - INTERVAL 7 DAY) AS fail_ips,
         (SELECT COUNT(*) FROM auth_events WHERE kind = 'login' AND at > NOW() - INTERVAL 7 DAY) AS logins_7d,
         (SELECT COUNT(*) FROM users WHERE role <> 'dev' AND last_seen IS NULL) AS never,
         (SELECT COUNT(*) FROM users WHERE role <> 'dev' AND last_seen < NOW() - INTERVAL 30 DAY) AS idle_30d,
         (SELECT COUNT(*) FROM users WHERE role IN ('dev', 'admin')) AS privileged,
         (SELECT COUNT(*) FROM auth_events WHERE kind = 'fail' AND at > NOW() - INTERVAL '10 minutes') AS burst,
         (SELECT COUNT(*) FROM auth_blocks WHERE until > LOCALTIMESTAMP(0)) AS blocks,
         (SELECT COUNT(*) FROM users WHERE suspended_at IS NOT NULL) AS suspended,
         (SELECT COUNT(*) FROM users WHERE role IN ('dev', 'admin') AND totp_enabled = 1) AS with_2fa`,
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
    // Bloqueos activos (automáticos o puestos a mano)
    query(`SELECT b.id, b.kind, b.value::text AS value, b.reason, b.auto, to_char(b.until, 'YYYY-MM-DD HH24:MI') AS until,
             CEIL(EXTRACT(EPOCH FROM (b.until - LOCALTIMESTAMP(0))) / 60)::int AS mins, u.name AS who
           FROM auth_blocks b LEFT JOIN users u ON u.id = b.created_by WHERE b.until > LOCALTIMESTAMP(0) ORDER BY b.until DESC LIMIT 50`),
    query(`SELECT u.id, u.name::text AS name, u.email::text AS email, u.role::text AS role, c.name::text AS company, to_char(u.suspended_at, 'YYYY-MM-DD HH24:MI') AS since
           FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.suspended_at IS NOT NULL ORDER BY u.suspended_at DESC LIMIT 60`),
    // Cuentas con poder (dev y supervisores): si tienen doble verificación y si deben cambiar su contraseña
    query(`SELECT u.id, u.name::text AS name, u.email::text AS email, u.role::text AS role, c.name::text AS company, u.totp_enabled, u.must_change_password AS must_change,
             to_char(u.last_seen, 'YYYY-MM-DD HH24:MI') AS last_seen, (u.suspended_at IS NOT NULL) AS suspended
           FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.role IN ('dev', 'admin') ORDER BY u.role, u.name`),
    query(`SELECT e.id, e.action, e.detail, COALESCE(t.name::text, e.target::text) AS target, a.name::text AS actor, to_char(e.at, 'YYYY-MM-DD HH24:MI') AS at
           FROM account_events e LEFT JOIN users a ON a.id = e.actor_id LEFT JOIN users t ON t.id = e.target_id ORDER BY e.at DESC, e.id DESC LIMIT 60`),
  ]);
  return NextResponse.json({
    kpis: Object.fromEntries(Object.entries(k ?? {}).map(([a, v]) => [a, Number(v)])),
    attempts, logins, idle, byDay: byDay.map((r) => ({ d: r.d, ok: Number(r.ok), fail: Number(r.fail) })),
    blocks, suspended, privileged, changes,
  });
}

/**
 * Poderes de seguridad (solo dev):
 * block { kind: "ip" | "email", value, minutes, reason? } · unblock { id }
 * suspend { id } · reactivate { id } · force-change { id } · reset-2fa { id } · close { id }
 * suspend-idle { days } -> suspende las cuentas sin uso hace más de esos días (nunca dev ni supervisores)
 */
export async function POST(req: Request) {
  const { s, err } = await guard(["dev"]);
  if (err) return err;
  const b = await req.json().catch(() => ({}));
  const who = async (id: number) => (await query<{ id: number; name: string; email: string; role: string }>("SELECT id, name, email, role FROM users WHERE id = ?", [id]))[0];

  if (b.action === "block") {
    const kind = b.kind === "ip" ? "ip" : "email";
    const value = String(b.value ?? "").trim().toLowerCase().slice(0, 160);
    const minutes = Math.max(5, Math.min(60 * 24 * 365, Math.round(Number(b.minutes) || 60)));
    if (!value) return NextResponse.json({ error: "Indica la IP o el correo" }, { status: 400 });
    await query(`INSERT INTO auth_blocks(kind, value, until, reason, created_by) VALUES (?, ?, LOCALTIMESTAMP(0) + INTERVAL '${minutes} minutes', ?, ?)`,
      [kind, value, String(b.reason ?? "").slice(0, 200) || "Bloqueado por The Iceberg Labs", s.id]);
    await logDev(s.id, kind === "ip" ? "Bloqueó una IP" : "Bloqueó un correo", value, `${minutes} min`);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "unblock") {
    const [x] = await query<{ value: string }>("UPDATE auth_blocks SET until = LOCALTIMESTAMP(0) WHERE id = ? RETURNING value", [Number(b.id)]);
    if (x) await logDev(s.id, "Quitó un bloqueo", x.value);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "suspend-idle") {
    const days = Math.max(30, Math.round(Number(b.days) || 90));
    const r = await query<{ id: number; email: string }>(
      `UPDATE users SET suspended_at = LOCALTIMESTAMP(0), sessions_after = LOCALTIMESTAMP(0)
       WHERE role NOT IN ('dev', 'admin') AND suspended_at IS NULL AND COALESCE(last_seen, created_at) < NOW() - INTERVAL '${days} days' RETURNING id, email`);
    for (const u of r) await accountEvent(s.id, u.id, u.email, "Suspendió una cuenta sin uso", `más de ${days} días`);
    await logDev(s.id, "Suspendió cuentas sin uso", null, `${r.length} cuentas · más de ${days} días`);
    return NextResponse.json({ ok: true, n: r.length });
  }

  const u = await who(Number(b.id));
  if (!u) return NextResponse.json({ error: "Esa cuenta no existe" }, { status: 404 });
  if (u.role === "dev" && b.action !== "force-change" && b.action !== "reset-2fa") return NextResponse.json({ error: "Las cuentas de The Iceberg Labs no se suspenden ni cierran desde aquí" }, { status: 400 });
  const acts: Record<string, [string, string]> = {
    suspend: ["UPDATE users SET suspended_at = LOCALTIMESTAMP(0), sessions_after = LOCALTIMESTAMP(0) WHERE id = ?", "Suspendió una cuenta"],
    reactivate: ["UPDATE users SET suspended_at = NULL WHERE id = ?", "Reactivó una cuenta"],
    "force-change": ["UPDATE users SET must_change_password = 1 WHERE id = ?", "Pidió cambiar la contraseña"],
    "reset-2fa": ["UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?", "Quitó la doble verificación"],
    close: ["UPDATE users SET sessions_after = LOCALTIMESTAMP(0) WHERE id = ?", "Cerró la sesión de una cuenta"],
  };
  const a = acts[String(b.action)];
  if (!a) return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  await query(a[0], [u.id]);
  await accountEvent(s.id, u.id, u.email, a[1]);
  await logDev(s.id, a[1], u.name);
  return NextResponse.json({ ok: true });
}
