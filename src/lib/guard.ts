import { NextResponse } from "next/server";
import { getSession, type Session } from "./auth";
import { query, run } from "./db";
import type { Stage } from "./workflow";

const ALL: Session["role"][] = ["dev", "admin", "operator"];
export const SUPER: Session["role"][] = ["dev", "admin"];

/**
 * Verifica la sesión y el rol. Por defecto deja pasar a todos los roles;
 * usa guard(SUPER) para lo que solo hace el super admin.
 * También marca al usuario como "en línea" (last_seen) para el seguimiento en vivo.
 */
export async function guard(roles: Session["role"][] = ALL) {
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
    query<{ area: string | null; carrier: string | null }>("SELECT area, carrier FROM users WHERE id=?", [userId]),
    getStages(userId),
  ]);
  return { stages, area: u?.area ?? null, carrier: u?.carrier || null };
}
