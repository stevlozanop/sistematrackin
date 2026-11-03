import { query } from "./db";

/**
 * Licencias de la plataforma. The Iceberg Labs da la licencia a cada empresa (transportista, ej. Leyva);
 * sus consorcios (Honda) y los clientes de esos consorcios dependen de la licencia de esa empresa.
 * Bloqueada = suspendida o vencida. Sin licencia registrada = activa.
 */
export type LicenseState = {
  companyId: number | null; company: string | null; status: "active" | "suspended" | "expired";
  plan: string | null; expiresAt: string | null; daysLeft: number | null; maxUsers: number | null; note: string | null;
};

const ACTIVE: LicenseState = { companyId: null, company: null, status: "active", plan: null, expiresAt: null, daysLeft: null, maxUsers: null, note: null };

/** Empresa dueña de la licencia para cada cuenta: su empresa, o la transportista de su consorcio */
const ROOT_OF_USER = `
  FROM users u
  JOIN companies c ON c.id = COALESCE(u.company_id, (SELECT id FROM companies WHERE kind = 'transport' ORDER BY id LIMIT 1))
  JOIN companies r ON r.id = COALESCE(c.parent_id, c.id)
  LEFT JOIN licenses l ON l.company_id = r.id`;

export async function licenseOfUser(userId: number): Promise<LicenseState> {
  const [r] = await query<{ id: number; name: string; status: string | null; plan: string | null; expires: string | null; days: number | null; max_users: number | null; note: string | null }>(
    `SELECT r.id, r.name::text AS name, l.status::text AS status, l.plan::text AS plan, to_char(l.expires_at, 'YYYY-MM-DD') AS expires,
       (l.expires_at - CURRENT_DATE)::int AS days, l.max_users, l.note ${ROOT_OF_USER} WHERE u.id = ?`,
    [userId],
  ).catch(() => []);
  if (!r) return ACTIVE;
  const days = r.days === null || r.days === undefined ? null : Number(r.days);
  const status = r.status === "suspended" ? "suspended" : days !== null && days < 0 ? "expired" : "active";
  return { companyId: r.id, company: r.name, status, plan: r.plan, expiresAt: r.expires, daysLeft: days, maxUsers: r.max_users === null ? null : Number(r.max_users), note: r.note };
}

// Cache muy corto por cuenta: cada API la consulta, y un cambio de licencia se nota en pocos segundos
const cache = new Map<number, { at: number; v: LicenseState }>();
const TTL = 3000;
export async function cachedLicense(userId: number) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const v = await licenseOfUser(userId);
  cache.set(userId, { at: Date.now(), v });
  if (cache.size > 2000) cache.clear();
  return v;
}

export const licenseMessage = (l: LicenseState) =>
  l.status === "expired"
    ? `La licencia de ${l.company ?? "tu empresa"} venció el ${l.expiresAt}. Comunícate con The Iceberg Labs para renovarla.`
    : `La licencia de ${l.company ?? "tu empresa"} está suspendida. Comunícate con The Iceberg Labs.`;

/** Empresa raíz (dueña de la licencia) de una empresa o consorcio */
export async function rootCompany(companyId: number | null) {
  if (!companyId) {
    const [t] = await query<{ id: number }>("SELECT id FROM companies WHERE kind = 'transport' ORDER BY id LIMIT 1");
    return t?.id ?? null;
  }
  const [c] = await query<{ id: number }>("SELECT COALESCE(parent_id, id) AS id FROM companies WHERE id = ?", [companyId]);
  return c?.id ?? null;
}

/** Cupo de cuentas: devuelve el mensaje de error si crear `adding` cuentas más pasa el máximo de la licencia */
export async function seatsError(companyId: number | null, adding = 1) {
  const root = await rootCompany(companyId);
  if (!root) return null;
  const [r] = await query<{ max_users: number | null; used: number; name: string }>(
    `SELECT l.max_users, r.name::text AS name,
       (SELECT COUNT(*) FROM users u JOIN companies c ON c.id = u.company_id WHERE COALESCE(c.parent_id, c.id) = r.id)::int AS used
     FROM companies r LEFT JOIN licenses l ON l.company_id = r.id WHERE r.id = ?`,
    [root],
  ).catch(() => []); // sin la tabla de licencias todavía: sin límite
  if (!r || r.max_users === null || r.max_users === undefined) return null;
  const left = Number(r.max_users) - Number(r.used);
  return left >= adding ? null : `La licencia de ${r.name} permite ${r.max_users} cuentas y ya tiene ${r.used}. Pide a The Iceberg Labs ampliar el cupo.`;
}
