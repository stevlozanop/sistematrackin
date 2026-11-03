import { headers } from "next/headers";
import { after } from "next/server";
import { run } from "./db";

/**
 * Actividad real de la plataforma para la consola The Iceberg Labs:
 * pantallas que se abren, ingresos (correctos y fallidos) y llamadas a la API por hora.
 * Las escrituras corren después de responder (after): nunca frenan a quien está usando el sistema.
 */

const later = (sql: string, params: unknown[] = []) => after(() => run(sql, params).then(() => {}, () => {}));

/** Una pantalla abierta. De vez en cuando borra lo que pasó de 120 días. */
export function trackPage(userId: number, path: string) {
  later("INSERT INTO page_views (user_id, path) VALUES (?, ?)", [userId, path.slice(0, 200)]);
  if (Math.random() < 0.005) later("DELETE FROM page_views WHERE at < NOW() - INTERVAL 120 DAY");
}

/** Ingreso correcto, fallido o salida, con IP y navegador */
export async function authEvent(kind: "login" | "fail" | "logout", userId: number | null, email: string | null) {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() || null;
  const agent = (h.get("user-agent") ?? "").slice(0, 240) || null;
  await run("INSERT INTO auth_events (user_id, email, kind, ip, agent) VALUES (?, ?, ?, ?, ?)", [userId, email, kind, ip, agent]).catch(() => {});
}

/** Una llamada a la API, sumada en su hora y tipo de cuenta */
export function countApi(role: string) {
  later(
    "INSERT INTO api_usage (hour, role, n) VALUES (date_trunc('hour', LOCALTIMESTAMP(0)), ?, 1) ON CONFLICT (hour, role) DO UPDATE SET n = api_usage.n + 1",
    [role],
  );
}
