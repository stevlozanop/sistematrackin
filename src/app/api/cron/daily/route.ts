import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { adminIds, pushReady, pushToUsers } from "@/lib/push";
import { stageLabel } from "@/lib/workflow";
import { remindPayments } from "@/lib/billing";
import type { Site } from "@/lib/hsp";

/**
 * Resumen diario por notificación (Vercel lo llama cada mañana, ver vercel.json).
 * - Empresa (Leyva): cuántas vencen hoy, cuántas están por vencer y cuántas vencidas no tienen motivo.
 * - Encargados: las unidades vencidas o por vencer que esperan su etapa.
 * Solo una vez por día. Vercel manda «Authorization: Bearer CRON_SECRET».
 */
export const dynamic = "force-dynamic";

const n = (v: number) => Number(v).toLocaleString("es-PE");

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!pushReady()) return NextResponse.json({ ok: false, reason: "push sin configurar" });
  const [done] = await query<{ n: number }>("SELECT COUNT(*) n FROM push_log WHERE kind = 'diario' AND at >= CURRENT_DATE");
  if (Number(done?.n) > 0) return NextResponse.json({ ok: true, skipped: "ya se envió hoy" });

  // Pagos de licencia que vencen en 3 días o menos (o vencidos): a los supervisores de la empresa
  let sent = await remindPayments().catch(() => 0);
  // Empresa
  const [t] = await query<{ hoy: number; pronto: number; sin_motivo: number }>(
    `SELECT SUM(CASE WHEN est_date = CURRENT_DATE THEN 1 ELSE 0 END) hoy,
            SUM(CASE WHEN alert = 'POR VENCER' THEN 1 ELSE 0 END) pronto,
            SUM(CASE WHEN alert = 'VENCIDA' AND delay_reason IS NULL THEN 1 ELSE 0 END) sin_motivo
     FROM v_units WHERE d_entrega IS NULL`);
  const parts = [
    Number(t?.hoy) ? `${n(t.hoy)} vencen hoy` : "",
    Number(t?.pronto) ? `${n(t.pronto)} por vencer` : "",
    Number(t?.sin_motivo) ? `${n(t.sin_motivo)} vencidas sin motivo` : "",
  ].filter(Boolean);
  if (parts.length) {
    sent += await pushToUsers(await adminIds(), { title: "Resumen del día", body: `${parts.join(" · ")}.`, url: "/alerts", tag: "diario" }, "diario");
  }

  // Encargados: lo que espera su etapa
  const rows = await query<{ user_id: number; site: Site; field: string; vencidas: number; pronto: number }>(
    `SELECT st.user_id, st.site, st.field,
            SUM(CASE WHEN v.alert = 'VENCIDA' THEN 1 ELSE 0 END) vencidas,
            SUM(CASE WHEN v.alert = 'POR VENCER' THEN 1 ELSE 0 END) pronto
     FROM user_stages st
     JOIN users u ON u.id = st.user_id AND u.role = 'operator' AND u.suspended_at IS NULL
     JOIN v_units v ON v.site = st.site AND v.next_step = st.field AND (u.carrier IS NULL OR v.carrier = u.carrier)
     WHERE v.alert IS NOT NULL
     GROUP BY st.user_id, st.site, st.field`);
  const byUser = new Map<number, string[]>();
  for (const r of rows) {
    const txt = [Number(r.vencidas) ? `${n(r.vencidas)} vencidas` : "", Number(r.pronto) ? `${n(r.pronto)} por vencer` : ""].filter(Boolean).join(" y ");
    if (txt) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), `${stageLabel(r.site, r.field)}: ${txt}`]);
  }
  for (const [uid, lines] of byUser) {
    sent += await pushToUsers([uid], { title: "Pendientes de tu etapa", body: lines.join(" · "), url: "/", tag: "diario" }, "diario");
  }
  // Marca del día aunque nadie tenga equipos activos (para no repetir)
  if (!parts.length && !byUser.size) await query("INSERT INTO push_log(kind, title, sent) VALUES ('diario', 'Sin pendientes', 0)");
  return NextResponse.json({ ok: true, sent, operators: byUser.size });
}
