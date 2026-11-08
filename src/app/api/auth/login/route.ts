import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { createSession, signTicket, verifyTicket } from "@/lib/auth";
import { portalBySlug } from "@/lib/companies";
import type { Role } from "@/lib/workflow";
import { authEvent } from "@/lib/activity";
import { licenseMessage, licenseOfUser } from "@/lib/license";
import { maintenanceText, readPlatform } from "@/lib/platform";
import { AUTO_BLOCK_MIN, activeBlock, autoBlock, clientIp, verifyTotp } from "@/lib/security";

/** Entrada que le corresponde a una cuenta: la de su consorcio (/honda o /honda/clientes) o la principal (/login). */
function entryFor(u: { role: Role; slug: string | null }) {
  if (u.slug && u.role === "dealer") return `/${u.slug}/clientes`;
  if (u.slug && u.role === "viewer") return `/${u.slug}`;
  return "/login";
}

/**
 * POST { email, password, portal?: { slug, audience: "staff" | "clients" } }
 * Desde la entrada propia de un consorcio solo pasan cuentas de esa puerta:
 * /honda → su cuenta principal y sus empleados · /honda/clientes → sus clientes.
 * El login principal (/login) acepta todas las cuentas menos los clientes de un consorcio.
 */
type U = {
  id: number; name: string; email: string; password_hash: string; role: Role; company_id: number | null; slug: string | null;
  suspended: boolean; totp_secret: string | null; totp_enabled: number; must_change: number;
};
const USER_SQL = `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.company_id, c.slug, (u.suspended_at IS NOT NULL) AS suspended,
  u.totp_secret, u.totp_enabled, u.must_change_password AS must_change FROM users u LEFT JOIN companies c ON c.id = u.company_id`;

/** Correo o IP bloqueados (por muchos intentos o por The Iceberg Labs) */
async function blockedResponse(email: string | null, ip: string | null) {
  const b = await activeBlock(email, ip);
  return b ? NextResponse.json({ error: `Ingreso bloqueado por seguridad. Intenta de nuevo en ${b.mins} min${b.mins === 1 ? "" : "s"}.`, blocked: true }, { status: 429 }) : null;
}
async function failed(u: { id: number } | null | undefined, typed: string | null, ip: string | null, msg: string) {
  await authEvent("fail", u?.id ?? null, typed);
  const now = await autoBlock(typed, ip);
  return NextResponse.json({ error: now ? `${msg}. Por seguridad, el ingreso queda bloqueado ${AUTO_BLOCK_MIN} min.` : msg, blocked: now }, { status: now ? 429 : 401 });
}

export async function POST(req: Request) {
  const { email, password, portal, ticket, code } = await req.json().catch(() => ({}));
  const ip = await clientIp();

  // Paso 2 de la doble verificación: el código de la app
  if (ticket) {
    const uid = await verifyTicket(String(ticket));
    if (!uid) return NextResponse.json({ error: "El paso de verificación venció. Vuelve a ingresar tu contraseña.", restart: true }, { status: 401 });
    const [u] = await query<U>(`${USER_SQL} WHERE u.id = ?`, [uid]);
    if (!u || u.suspended) return NextResponse.json({ error: "Tu cuenta está suspendida. Habla con tu empresa.", restart: true }, { status: 403 });
    const blocked = await blockedResponse(u.email, ip);
    if (blocked) return blocked;
    if (!u.totp_secret || !verifyTotp(u.totp_secret, String(code ?? ""))) return failed(u, u.email, ip, "Código incorrecto");
    await createSession({ id: u.id, name: u.name, email: u.email, role: u.role });
    await authEvent("login", u.id, u.email);
    return NextResponse.json({ ok: true, mustChange: !!Number(u.must_change) });
  }

  const typed = String(email ?? "").trim().toLowerCase().slice(0, 160) || null;
  try {
    const blocked = await blockedResponse(typed, ip);
    if (blocked) return blocked;
    const [u] = await query<U>(`${USER_SQL} WHERE u.email = ?`, [String(email ?? "").trim().toLowerCase()]);
    if (!u || !bcrypt.compareSync(String(password ?? ""), u.password_hash)) return failed(u, typed, ip, "Correo o contraseña incorrectos");
    // Cuenta suspendida por su empresa o por The Iceberg Labs
    if (u.suspended) {
      await authEvent("fail", u.id, typed);
      return NextResponse.json({ error: "Tu cuenta está suspendida. Habla con tu empresa.", suspended: true }, { status: 403 });
    }

    if (portal?.slug) {
      const c = await portalBySlug(String(portal.slug));
      if (!c) return NextResponse.json({ error: "Esta entrada no existe" }, { status: 404 });
      const clients = portal.audience === "clients";
      const ok = u.company_id === c.id && (clients ? u.role === "dealer" : u.role === "viewer");
      if (!ok) {
        await authEvent("fail", u.id, typed);
        return NextResponse.json({
          error: clients ? `Esta entrada es solo para los clientes de ${c.name}` : `Esta entrada es solo para el equipo de ${c.name}`,
          entry: entryFor(u),
        }, { status: 403 });
      }
    } else if (u.role === "dealer" && u.slug) {
      // Los clientes de un consorcio entran solo por la entrada de su consorcio (/honda/clientes)
      await authEvent("fail", u.id, typed);
      return NextResponse.json({ error: "Los clientes ingresan por la entrada de su consorcio", entry: entryFor(u) }, { status: 403 });
    }

    // En mantenimiento solo entra The Iceberg Labs
    if (u.role !== "dev") {
      const p = await readPlatform();
      if (p.maintenance) return NextResponse.json({ error: maintenanceText(p), maintenance: true }, { status: 503 });
    }
    // Sin licencia activa de su empresa no entra (The Iceberg Labs siempre entra)
    if (u.role !== "dev") {
      const lic = await licenseOfUser(u.id);
      if (lic.status !== "active") return NextResponse.json({ error: licenseMessage(lic), license: lic.status }, { status: 403 });
    }
    // Doble verificación activada: falta el código de la app
    if (Number(u.totp_enabled) && u.totp_secret) return NextResponse.json({ need2fa: true, ticket: await signTicket(u.id) });
    await createSession({ id: u.id, name: u.name, email: u.email, role: u.role });
    await authEvent("login", u.id, typed);
    return NextResponse.json({ ok: true, mustChange: !!Number(u.must_change) });
  } catch (e) {
    console.error("[login]", e);
    return NextResponse.json({ error: "Error del servidor, intenta de nuevo" }, { status: 500 });
  }
}
