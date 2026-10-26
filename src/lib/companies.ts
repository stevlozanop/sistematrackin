import { query } from "./db";
import type { Session } from "./auth";

/** Empresa de la cuenta (null para The Iceberg Labs / dev). */
export async function myCompany(s: Session) {
  if (s.role === "dev") return null;
  const [u] = await query<{ company_id: number | null }>("SELECT company_id FROM users WHERE id=?", [s.id]);
  return u?.company_id ?? null;
}

/** ¿Este usuario puede tocar la empresa id? own = también su propia empresa (solo para editar datos). */
export async function canManage(s: Session, id: number, own = false) {
  if (s.role === "dev") return true;
  const mine = await myCompany(s);
  if (!mine) return false;
  if (own && id === mine) return true;
  return (await query("SELECT id FROM companies WHERE id=? AND parent_id=?", [id, mine])).length > 0;
}

/**
 * Marca (nombre, logo y color) que ve cada cuenta en el menú:
 * - The Iceberg Labs (dev): null → se muestra The Iceberg Labs en blanco y negro.
 * - Cuenta de una empresa (Leyva, Honda…): su propia empresa.
 * - Dealer: la empresa a la que pertenece (la transportista).
 * - Cuenta sin empresa: la primera transportista registrada.
 */
export async function brandCompany(userId: number, role: string) {
  if (role === "dev") return null;
  const [b] = await query<{ id: number; name: string; v: string | null; color: string | null }>(
    `SELECT c.id, c.name, UNIX_TIMESTAMP(c.logo_updated) v, c.color FROM companies c
     WHERE c.id = COALESCE(
       (SELECT company_id FROM users WHERE id = ?),
       (SELECT id FROM companies WHERE kind = 'transport' ORDER BY id LIMIT 1))`,
    [userId],
  );
  return b ?? null;
}

/** Empresa propia de la cuenta (para el avatar de la barra superior). */
export async function ownCompany(userId: number) {
  const [c] = await query<{ id: number; name: string; v: string | null }>(
    "SELECT c.id, c.name, UNIX_TIMESTAMP(c.logo_updated) v FROM users u JOIN companies c ON c.id = u.company_id WHERE u.id = ?",
    [userId],
  );
  return c ?? null;
}

/**
 * Consorcio al que pertenecen los clientes de Honda (SORSA, SERVIHONDA…): el consorcio cliente de la transportista.
 * Así sus cuentas ven el sistema con los colores y el logo de Honda, no con los de Leyva.
 * companyId = empresa de quien crea la cuenta (o null para The Iceberg Labs → la primera transportista).
 */
export async function clientsConsortium(companyId: number | null) {
  const [c] = await query<{ id: number }>(
    `SELECT c.id FROM companies c
     WHERE c.kind = 'client' AND c.parent_id = COALESCE(
       (SELECT IF(kind = 'client', parent_id, id) FROM companies WHERE id = ?),
       (SELECT id FROM companies WHERE kind = 'transport' ORDER BY id LIMIT 1))
     ORDER BY c.id LIMIT 1`,
    [companyId],
  );
  return c?.id ?? null;
}

/**
 * Si la cuenta es de solo lectura de un consorcio cliente (Honda), devuelve su empresa:
 * esa cuenta puede crear y administrar las cuentas de SUS clientes (SORSA, SERVIHONDA…), nada más.
 */
export async function clientConsortiumOf(s: Session) {
  if (s.role !== "viewer") return null;
  const [c] = await query<{ id: number }>(
    "SELECT c.id FROM users u JOIN companies c ON c.id = u.company_id WHERE u.id = ? AND c.kind = 'client'", [s.id],
  );
  return c?.id ?? null;
}
