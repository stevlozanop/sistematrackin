import { NextResponse } from "next/server";
import { guard, EVERYONE } from "@/lib/guard";
import { query } from "@/lib/db";
import { pushPublicKey, pushReady, pushToUsers } from "@/lib/push";

/** GET → clave pública y cuántos equipos tiene activos esta cuenta */
export async function GET() {
  const { s, err } = await guard(EVERYONE);
  if (err) return err;
  const [r] = await query<{ n: number }>("SELECT COUNT(*) n FROM push_subscriptions WHERE user_id = ?", [s.id]).catch(() => [{ n: 0 }]);
  return NextResponse.json({ ready: pushReady(), key: pushPublicKey(), devices: Number(r?.n ?? 0) });
}

/**
 * POST { subscription } → activa este equipo · { action: "test" } → aviso de prueba a sus equipos
 * DELETE { endpoint } → desactiva este equipo
 */
export async function POST(req: Request) {
  const { s, err } = await guard(EVERYONE);
  if (err) return err;
  if (!pushReady()) return NextResponse.json({ error: "Las notificaciones aún no están configuradas en el servidor" }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  if (b.action === "test") {
    const sent = await pushToUsers([s.id], { title: "Notificaciones activadas", body: "Así te avisará System Tracking, aunque tengas la app cerrada.", url: "/profile", tag: "prueba" }, "prueba");
    return sent ? NextResponse.json({ ok: true, sent }) : NextResponse.json({ error: "No llegó a ningún equipo. Vuelve a activarlas." }, { status: 409 });
  }
  const sub = b.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 });
  }
  const agent = (req.headers.get("user-agent") ?? "").slice(0, 300);
  // Un equipo es de una sola cuenta: si otra persona entra en ese equipo, pasa a ser suyo
  await query(
    `INSERT INTO push_subscriptions(user_id, endpoint, p256dh, auth, agent) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, agent = EXCLUDED.agent`,
    [s.id, endpoint, p256dh, auth, agent]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { s, err } = await guard(EVERYONE);
  if (err) return err;
  const b = await req.json().catch(() => ({}));
  if (typeof b.endpoint === "string") await query("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", [b.endpoint, s.id]);
  return NextResponse.json({ ok: true });
}
