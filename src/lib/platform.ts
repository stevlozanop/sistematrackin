import { query } from "./db";

/**
 * Controles de la plataforma (consola The Iceberg Labs):
 * - modo mantenimiento: nadie usa el sistema salvo The Iceberg Labs;
 * - sesiones cerradas: si la cuenta tiene «sessions_after», las sesiones iniciadas antes ya no valen.
 * Se consulta en cada API con un caché muy corto, así un cambio se nota en pocos segundos.
 */
export type Platform = { maintenance: boolean; message: string | null; until: string | null };
type Access = { platform: Platform; sessionsAfter: number | null };

const cache = new Map<number, { at: number; v: Access }>();
const TTL = 3000;

export async function readPlatform(): Promise<Platform> {
  const [p] = await query<{ maintenance: number; maintenance_msg: string | null; until: string | null }>(
    "SELECT maintenance, maintenance_msg, to_char(maintenance_until, 'YYYY-MM-DD HH24:MI') AS until FROM platform WHERE id = 1").catch(() => []);
  return { maintenance: !!Number(p?.maintenance ?? 0), message: p?.maintenance_msg ?? null, until: p?.until ?? null };
}

export async function cachedAccess(userId: number): Promise<Access> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const [platform, [u]] = await Promise.all([
    readPlatform(),
    query<{ after: string | null }>("SELECT EXTRACT(EPOCH FROM sessions_after AT TIME ZONE current_setting('TimeZone'))::bigint AS after FROM users WHERE id = ?", [userId]).catch(() => []),
  ]);
  const v = { platform, sessionsAfter: u?.after ? Number(u.after) : null };
  cache.set(userId, { at: Date.now(), v });
  if (cache.size > 2000) cache.clear();
  return v;
}

/** ¿Esta sesión (emitida en «iat», segundos) fue cerrada por The Iceberg Labs? */
export const sessionClosed = (iat: number | undefined, after: number | null) => after !== null && (iat ?? 0) < after;

export const maintenanceText = (p: Platform) =>
  p.message || "Estamos mejorando el sistema. Volvemos en unos minutos.";

/** Registro de lo que hace The Iceberg Labs desde su consola */
export function logDev(userId: number, action: string, target?: string | null, detail?: string | null) {
  return query("INSERT INTO dev_actions(user_id, action, target, detail) VALUES (?, ?, ?, ?)", [userId, action, target ?? null, detail ?? null]).catch(() => {});
}
