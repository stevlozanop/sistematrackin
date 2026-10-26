import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { portalBySlug } from "@/lib/companies";
import type { Role } from "@/lib/workflow";

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
 * El login principal (/login) acepta cualquier cuenta.
 */
export async function POST(req: Request) {
  const { email, password, portal } = await req.json().catch(() => ({}));
  try {
    const [u] = await query<{
      id: number; name: string; email: string; password_hash: string; role: Role; company_id: number | null; slug: string | null;
    }>(
      `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.company_id, c.slug
       FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.email = ?`,
      [String(email ?? "").trim().toLowerCase()],
    );
    if (!u || !bcrypt.compareSync(String(password ?? ""), u.password_hash)) {
      return NextResponse.json({ error: "Correo o contraseña incorrectos" }, { status: 401 });
    }

    if (portal?.slug) {
      const c = await portalBySlug(String(portal.slug));
      if (!c) return NextResponse.json({ error: "Esta entrada no existe" }, { status: 404 });
      const clients = portal.audience === "clients";
      const ok = u.company_id === c.id && (clients ? u.role === "dealer" : u.role === "viewer");
      if (!ok) {
        return NextResponse.json({
          error: clients ? `Esta entrada es solo para los clientes de ${c.name}` : `Esta entrada es solo para el equipo de ${c.name}`,
          entry: entryFor(u),
        }, { status: 403 });
      }
    }

    await createSession({ id: u.id, name: u.name, email: u.email, role: u.role });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[login]", e);
    return NextResponse.json({ error: "Error del servidor, intenta de nuevo" }, { status: 500 });
  }
}
