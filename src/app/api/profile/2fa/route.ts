import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { query } from "@/lib/db";
import { EVERYONE, guard } from "@/lib/guard";
import { accountEvent, newTotpSecret, otpauthUri, verifyTotp } from "@/lib/security";

/**
 * Doble verificación de la propia cuenta (app de códigos: Google o Microsoft Authenticator…):
 * GET  -> si está activa
 * POST { action: "setup" }          -> crea una clave nueva y devuelve el código QR para escanearlo
 * POST { action: "enable", code }   -> la activa si el código de la app es correcto
 * POST { action: "disable", code }  -> la desactiva (pide un código vigente)
 */
export async function GET() {
  const { s, err } = await guard(EVERYONE);
  if (err) return err;
  const [u] = await query<{ on: number }>("SELECT totp_enabled AS on FROM users WHERE id = ?", [s.id]);
  return NextResponse.json({ enabled: !!Number(u?.on), recommended: s.role === "dev" || s.role === "admin" });
}

export async function POST(req: Request) {
  const { s, err } = await guard(EVERYONE);
  if (err) return err;
  const b = await req.json().catch(() => ({}));
  const [u] = await query<{ secret: string | null; on: number; email: string }>("SELECT totp_secret AS secret, totp_enabled AS on, email FROM users WHERE id = ?", [s.id]);
  if (!u) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

  if (b.action === "setup") {
    if (Number(u.on)) return NextResponse.json({ error: "Ya está activa. Desactívala primero para cambiar de celular." }, { status: 409 });
    const secret = newTotpSecret();
    await query("UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?", [secret, s.id]);
    const uri = otpauthUri(secret, u.email);
    const qr = await QRCode.toString(uri, { type: "svg", margin: 1, width: 200 });
    return NextResponse.json({ secret, uri, qr });
  }
  if (b.action === "enable") {
    if (!u.secret) return NextResponse.json({ error: "Primero genera el código QR" }, { status: 400 });
    if (!verifyTotp(u.secret, String(b.code ?? ""))) return NextResponse.json({ error: "Código incorrecto. Revisa que la hora de tu celular esté bien." }, { status: 400 });
    await query("UPDATE users SET totp_enabled = 1 WHERE id = ?", [s.id]);
    await accountEvent(s.id, s.id, u.email, "Activó la doble verificación");
    return NextResponse.json({ ok: true });
  }
  if (b.action === "disable") {
    if (!Number(u.on) || !u.secret) return NextResponse.json({ ok: true });
    if (!verifyTotp(u.secret, String(b.code ?? ""))) return NextResponse.json({ error: "Código incorrecto" }, { status: 400 });
    await query("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?", [s.id]);
    await accountEvent(s.id, s.id, u.email, "Desactivó la doble verificación");
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
}
