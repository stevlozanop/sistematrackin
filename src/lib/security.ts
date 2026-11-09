import crypto from "node:crypto";
import { headers } from "next/headers";
import { query } from "./db";
import { notifySecurity, pushLater } from "./push";

/**
 * Seguridad del ingreso:
 * - bloqueos por IP o correo (automáticos tras muchos intentos fallidos, o puestos por The Iceberg Labs);
 * - doble verificación con app de códigos (TOTP, como Google Authenticator), sin servicios externos;
 * - registro de cambios de cuentas.
 */

export const AUTO_LIMIT = 5;        // intentos fallidos…
export const AUTO_WINDOW_MIN = 15;  // …en estos minutos
export const AUTO_BLOCK_MIN = 15;   // → bloqueo de estos minutos

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() || null;
}

/** Bloqueo activo para ese correo o esa IP (el que termina más tarde) */
export async function activeBlock(email: string | null, ip: string | null) {
  const [b] = await query<{ kind: string; mins: number; reason: string | null }>(
    `SELECT kind, CEIL(EXTRACT(EPOCH FROM (until - LOCALTIMESTAMP(0))) / 60)::int AS mins, reason FROM auth_blocks
     WHERE until > LOCALTIMESTAMP(0) AND ((kind = 'email' AND value = ?) OR (kind = 'ip' AND value = ?))
     ORDER BY until DESC LIMIT 1`, [email ?? "", ip ?? ""]).catch(() => []);
  return b ? { kind: b.kind, mins: Math.max(1, Number(b.mins)), reason: b.reason } : null;
}

/** Tras un intento fallido: si ese correo o esa IP ya suma muchos, se bloquea un rato */
export async function autoBlock(email: string | null, ip: string | null) {
  // Cuenta solo los fallidos desde que terminó (o se quitó) su último bloqueo: al desbloquear, empieza de cero
  const since = (kind: string) => `GREATEST(LOCALTIMESTAMP(0) - INTERVAL '${AUTO_WINDOW_MIN} minutes',
    COALESCE((SELECT MAX(until) FROM auth_blocks WHERE kind = '${kind}' AND value = ? AND until <= LOCALTIMESTAMP(0)), '-infinity'::timestamp))`;
  const [c] = await query<{ by_email: number; by_ip: number }>(
    `SELECT (SELECT COUNT(*) FROM auth_events WHERE kind = 'fail' AND email = ? AND at > ${since("email")})::int AS by_email,
            (SELECT COUNT(*) FROM auth_events WHERE kind = 'fail' AND ip = ? AND at > ${since("ip")})::int AS by_ip`,
    [email ?? "", email ?? "", ip ?? "", ip ?? ""]).catch(() => []);
  const add = async (kind: "email" | "ip", value: string) => {
    if (await activeBlock(kind === "email" ? value : null, kind === "ip" ? value : null)) return;
    await query(`INSERT INTO auth_blocks(kind, value, until, reason, auto) VALUES (?, ?, LOCALTIMESTAMP(0) + INTERVAL '${AUTO_BLOCK_MIN} minutes', ?, 1)`,
      [kind, value, `${AUTO_LIMIT} o más intentos fallidos en ${AUTO_WINDOW_MIN} min`]).catch(() => {});
    pushLater(() => notifySecurity("Bloqueo automático", `${kind === "email" ? "Cuenta" : "IP"} ${value}: ${AUTO_LIMIT * (kind === "ip" ? 2 : 1)} o más intentos fallidos. Bloqueada ${AUTO_BLOCK_MIN} min.`));
  };
  let blocked = false;
  if (email && Number(c?.by_email) >= AUTO_LIMIT) { await add("email", email); blocked = true; }
  if (ip && Number(c?.by_ip) >= AUTO_LIMIT * 2) { await add("ip", ip); blocked = true; } // una IP puede ser de una oficina: el doble
  return blocked;
}

/** Registro de cambios de cuentas */
export function accountEvent(actorId: number | null, targetId: number | null, target: string | null, action: string, detail?: string | null) {
  return query("INSERT INTO account_events(actor_id, target_id, target, action, detail) VALUES (?, ?, ?, ?, ?)", [actorId, targetId, target, action, detail ?? null]).catch(() => {});
}

// ── Doble verificación (TOTP, RFC 6238): 6 dígitos que cambian cada 30 s ──
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const toB32 = (buf: Buffer) => { let bits = "", out = ""; for (const b of buf) bits += b.toString(2).padStart(8, "0"); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; };
const fromB32 = (s: string) => { let bits = ""; for (const ch of s.replace(/=+$/, "").toUpperCase()) { const v = B32.indexOf(ch); if (v >= 0) bits += v.toString(2).padStart(5, "0"); } const out: number[] = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };

export const newTotpSecret = () => toB32(crypto.randomBytes(20));

function totpAt(secret: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", fromB32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
/** Acepta el código actual y el anterior/siguiente (por si el reloj del celular va un poco desfasado) */
export function verifyTotp(secret: string, code: string) {
  const c = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  const step = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((d) => crypto.timingSafeEqual(Buffer.from(totpAt(secret, step + d)), Buffer.from(c)));
}
export const otpauthUri = (secret: string, account: string) =>
  `otpauth://totp/${encodeURIComponent(`System Tracking:${account}`)}?secret=${secret}&issuer=${encodeURIComponent("System Tracking")}&algorithm=SHA1&digits=6&period=30`;
