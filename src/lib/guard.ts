import { NextResponse } from "next/server";
import { getSession, type Session } from "./auth";
import { query, run } from "./db";
import type { Stage } from "./workflow";

type R = Session["role"][];
/** Personal que trabaja en el sistema (puede registrar fechas). Es el valor por defecto de guard(). */
export const STAFF: R = ["dev", "admin", "operator"];
/** Super admin y supervisores: corrigen todo, cargan Excel, administran. */
export const SUPER: R = ["dev", "admin"];
/** Lectura de todo el sistema: personal + la cuenta de solo lectura (Honda). */
export const READ: R = [...STAFF, "viewer"];
/** Cualquier cuenta, incluido el dealer (perfil, guía, alertas propias). */
export const EVERYONE: R = [...READ, "dealer"];

/**
 * Verifica la sesión y el rol. Por defecto solo deja pasar al personal (STAFF): las cuentas de solo lectura
 * (viewer, dealer) tienen que estar permitidas a propósito con READ o EVERYONE.
 * También marca al usuario como "en línea" (last_seen) para el seguimiento en vivo.
 */
export async function guard(roles: R = STAFF) {
  const s = await getSession();
  if (!s || !roles.includes(s.role)) {
    return { s: null as never, err: NextResponse.json({ error: s ? "No tienes permiso para esta acción" : "No autorizado" }, { status: s ? 403 : 401 }) };
  }
  // Como mucho una escritura cada 20 s por usuario
  run("UPDATE users SET last_seen=NOW() WHERE id=? AND (last_seen IS NULL OR last_seen < NOW() - INTERVAL 20 SECOND)", [s.id]).catch(() => {});
  return { s, err: null };
}

/** Etapas asignadas al usuario (se leen de la base para que un cambio aplique al instante). */
export async function getStages(userId: number): Promise<Stage[]> {
  return query<Stage>("SELECT site, field FROM user_stages WHERE user_id=?", [userId]);
}

/** Etapas + área + empresa de transporte (si la tiene, solo trabaja con las unidades de esa empresa). */
export async function getScope(userId: number) {
  const [[u], stages] = await Promise.all([
    query<{ area: string | null; carrier: string | null; can_import: number }>("SELECT area, carrier, can_import FROM users WHERE id=?", [userId]),
    getStages(userId),
  ]);
  return { stages, area: u?.area ?? null, carrier: u?.carrier || null, canImport: !!Number(u?.can_import) };
}
