import webpush from "web-push";
import { after } from "next/server";
import { query } from "./db";
import { stageLabel } from "./workflow";
import type { Site } from "./hsp";

/**
 * Notificaciones push (como las de WhatsApp): llegan aunque el sistema esté cerrado o el celular bloqueado.
 * Cada usuario las activa en cada equipo (Mi perfil). Necesita VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY.
 */
const PUBLIC = process.env.VAPID_PUBLIC_KEY ?? "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
let configured = false;

export const pushPublicKey = () => PUBLIC;
export const pushReady = () => !!(PUBLIC && PRIVATE);

function setup() {
  if (configured || !pushReady()) return configured;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:soporte@theiceberglabs.com", PUBLIC, PRIVATE);
  configured = true;
  return true;
}

export type PushMsg = { title: string; body: string; url?: string; tag?: string };
type Sub = { id: number; user_id: number; endpoint: string; p256dh: string; auth: string };

/** Envía el aviso a todos los equipos de esas cuentas. Borra los equipos que ya no existen. Devuelve cuántos llegaron. */
export async function pushToUsers(userIds: number[], msg: PushMsg, kind = "aviso") {
  const ids = [...new Set(userIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length || !setup()) return 0;
  const subs = await query<Sub>("SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (?)", [ids]);
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url ?? "/", tag: msg.tag });
  const okBy = new Map<number, number>();
  const gone: number[] = [], ok: number[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 12 * 3600, urgency: "high", topic: msg.tag?.slice(0, 32).replace(/[^\w-]/g, "") || undefined });
      ok.push(s.id); okBy.set(s.user_id, (okBy.get(s.user_id) ?? 0) + 1);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(s.id); // el equipo desactivó o desinstaló
      else console.error("[push]", code, (e as Error).message);
    }
  }));
  if (gone.length) await query("DELETE FROM push_subscriptions WHERE id IN (?)", [gone]).catch(() => {});
  if (ok.length) await query("UPDATE push_subscriptions SET last_ok = LOCALTIMESTAMP(0) WHERE id IN (?)", [ok]).catch(() => {});
  await query("INSERT INTO push_log(user_id, kind, title, body, url, sent) VALUES ?",
    [ids.map((id) => [id, kind, msg.title, msg.body, msg.url ?? null, okBy.get(id) ?? 0])]).catch(() => {});
  return ok.length;
}

/** Corre el envío después de responder (no demora la pantalla de quien registró) */
export function pushLater(fn: () => Promise<unknown>) {
  if (!pushReady()) return;
  try {
    after(() => fn().catch((e) => console.error("[push]", e)));
  } catch {
    fn().catch((e) => console.error("[push]", e));
  }
}

const ids = async (sql: string, args: unknown[] = []) => (await query<{ id: number }>(sql, args)).map((r) => r.id);
const ACTIVE = "suspended_at IS NULL";
const n = (v: number) => Number(v).toLocaleString("es-PE");
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;

/** Cuentas de la empresa (Leyva): supervisores */
export const adminIds = (except?: number) => ids(`SELECT id FROM users WHERE role = 'admin' AND ${ACTIVE} AND id <> ?`, [except ?? 0]);
/** The Iceberg Labs */
export const devIds = () => ids(`SELECT id FROM users WHERE role = 'dev' AND ${ACTIVE}`);

/** Pantalla donde se registra cada etapa */
function stagePage(site: Site, field: string) {
  if (field === "d_carga" || field === "d_zarpe") return `/embarque?site=${site}`;
  if (field === "d_arribo" || field === "d_almacen") return `/arribo?site=${site}`;
  if (field === "d_despacho") return `/despacho?site=${site}`;
  if (field === "d_entrega") return `/conductor?site=${site}`;
  return `/units/${site}`;
}

/**
 * Después de registrar una etapa: avisa a los encargados de la etapa siguiente
 * («Te toca: 3. Arribo Pucallpa · 120 unidades de 12 guías»). No se avisa a quien registró.
 */
export async function notifyNextStage(unitIds: number[], actorId: number) {
  if (!unitIds.length) return;
  const groups = await query<{ site: Site; next_step: string; carrier: string | null; n: number; g: number }>(
    `SELECT site, next_step, carrier, COUNT(*) n, COUNT(DISTINCT guia) g FROM v_units
     WHERE id IN (?) AND next_step IS NOT NULL GROUP BY site, next_step, carrier`, [unitIds.slice(0, 20000)]);
  for (const gr of groups) {
    const to = await ids(
      `SELECT DISTINCT u.id FROM users u JOIN user_stages st ON st.user_id = u.id
       WHERE u.role = 'operator' AND u.${ACTIVE} AND u.id <> ? AND st.site = ? AND st.field = ?
         AND (u.carrier IS NULL OR u.carrier = ?)`, [actorId, gr.site, gr.next_step, gr.carrier ?? ""]);
    if (!to.length) continue;
    await pushToUsers(to, {
      title: `Te toca: ${stageLabel(gr.site, gr.next_step)}`,
      body: `${plural(gr.n, "unidad lista", "unidades listas")} (${plural(gr.g, "guía", "guías")}) para registrar en ${gr.site === "PCL" ? "Pucallpa" : "Yurimaguas"}.`,
      url: stagePage(gr.site, gr.next_step),
      tag: `etapa-${gr.site}-${gr.next_step}`,
    }, "etapa");
  }
}

/** Cuentas de cliente que ven esa tienda (la tienda misma o todo su cliente) */
const dealerUsers = (dealerId: number) => ids(
  `SELECT id FROM users WHERE role = 'dealer' AND ${ACTIVE}
     AND (dealer_id = ? OR client IN (SELECT client FROM dealers WHERE id = ? AND client IS NOT NULL))`, [dealerId, dealerId]);

/** Despacho de almacén: «Tu pedido salió» al cliente de cada guía */
export async function notifyDispatched(unitIds: number[]) {
  if (!unitIds.length) return;
  const rows = await query<{ dealer_id: number; dealer: string; guia: string; n: number; driver: string | null }>(
    `SELECT dealer_id, MAX(dealer) dealer, COALESCE(guia, '') guia, COUNT(*) n, MAX(driver) driver FROM v_units
     WHERE id IN (?) AND dealer_id IS NOT NULL GROUP BY dealer_id, COALESCE(guia, '')`, [unitIds]);
  for (const r of rows) {
    const to = await dealerUsers(r.dealer_id);
    if (!to.length) continue;
    await pushToUsers(to, {
      title: "Tu pedido salió del almacén",
      body: `${r.guia ? `Guía ${r.guia} · ` : ""}${plural(r.n, "unidad", "unidades")} para ${r.dealer}${r.driver ? ` · chofer ${r.driver}` : ""}.`,
      url: "/recepcion",
      tag: `guia-${r.guia}`,
    }, "despacho");
  }
}

/** Entrega del transporte: el cliente confirma cómo llegó */
export async function notifyDelivered(unitIds: number[]) {
  if (!unitIds.length) return;
  const rows = await query<{ dealer_id: number; dealer: string; guia: string; n: number }>(
    `SELECT dealer_id, MAX(dealer) dealer, COALESCE(guia, '') guia, COUNT(*) n FROM v_units
     WHERE id IN (?) AND dealer_id IS NOT NULL GROUP BY dealer_id, COALESCE(guia, '')`, [unitIds]);
  for (const r of rows) {
    const to = await dealerUsers(r.dealer_id);
    if (!to.length) continue;
    await pushToUsers(to, {
      title: "Tu pedido fue entregado",
      body: `${r.guia ? `Guía ${r.guia} · ` : ""}${plural(r.n, "unidad", "unidades")} en ${r.dealer}. Confirma si llegó completo.`,
      url: "/recepcion",
      tag: `guia-${r.guia}`,
    }, "entrega");
  }
}

/** Observación de un dealer: a la empresa */
export async function notifyObservation(guia: string, dealer: string | null, note: string) {
  const to = await adminIds();
  await pushToUsers(to, {
    title: `Observación de ${dealer ?? "un dealer"}`,
    body: `Guía ${guia}: ${note.slice(0, 140)}`,
    url: "/recepcion",
    tag: `obs-${guia}`,
  }, "observacion");
}

/** Excel con unidades nuevas: a la empresa y a los encargados del embarque en Iquitos */
export async function notifyNewUnits(created: number, actorId: number) {
  if (created <= 0) return;
  const to = [
    ...(await adminIds(actorId)),
    ...(await ids(`SELECT DISTINCT u.id FROM users u JOIN user_stages st ON st.user_id = u.id
                   WHERE u.role = 'operator' AND u.${ACTIVE} AND u.id <> ? AND st.field = 'd_carga'`, [actorId])),
  ];
  await pushToUsers(to, {
    title: "Unidades nuevas en Iquitos",
    body: `Se cargaron ${plural(created, "unidad nueva", "unidades nuevas")} por embarcar.`,
    url: "/embarque",
    tag: "nuevas",
  }, "carga");
}

/** Seguridad: bloqueo automático por intentos fallidos → The Iceberg Labs */
export async function notifySecurity(title: string, body: string) {
  await pushToUsers(await devIds(), { title, body, url: "/dev/security", tag: "seguridad" }, "seguridad");
}
