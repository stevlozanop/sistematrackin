import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query, run } from "@/lib/db";
import { guard } from "@/lib/guard";
import { clientConsortiumOf } from "@/lib/companies";
import type { Session } from "@/lib/auth";

/**
 * Empleados de un consorcio cliente (Honda): cuentas de solo lectura de Honda, aparte de sus clientes.
 * - Cualquier cuenta de Honda ve la lista.
 * - Solo la cuenta principal de Honda crea empleados, les pone contraseña nueva o los elimina.
 */
async function ctx(s: Session) {
  const company = await clientConsortiumOf(s);
  if (!company) return null;
  const [c] = await query<{ owner_id: number | null }>("SELECT owner_id FROM companies WHERE id=?", [company]);
  return { company, isOwner: c?.owner_id === s.id };
}

export async function GET() {
  const { s, err } = await guard(["viewer"]);
  if (err) return err;
  const c = await ctx(s);
  if (!c) return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 });
  const rows = await query(
    `SELECT u.id, u.name, u.email, DATE_FORMAT(u.created_at,'%Y-%m-%d') created_at,
       DATE_FORMAT(u.last_seen,'%Y-%m-%d %H:%i') last_seen, (u.last_seen > NOW() - INTERVAL 60 SECOND) online,
       (co.owner_id <=> u.id) is_owner
     FROM users u JOIN companies co ON co.id = u.company_id
     WHERE u.company_id = ? AND u.role = 'viewer' ORDER BY is_owner DESC, u.name`,
    [c.company],
  );
  return NextResponse.json({ isOwner: c.isOwner, staff: rows });
}

export async function POST(req: Request) {
  const { s, err } = await guard(["viewer"]);
  if (err) return err;
  const c = await ctx(s);
  if (!c?.isOwner) return NextResponse.json({ error: "Solo la cuenta principal puede crear empleados" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim().slice(0, 120);
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return NextResponse.json({ error: "Nombre, usuario válido y contraseña (mín. 8) son obligatorios" }, { status: 400 });
  }
  try {
    await run("INSERT INTO users(name,email,password_hash,role,company_id,created_by) VALUES (?,?,?,?,?,?)",
      [name, email, bcrypt.hashSync(password, 10), "viewer", c.company, s.id]);
  } catch {
    return NextResponse.json({ error: "Ese usuario ya existe" }, { status: 409 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** ¿El empleado id es de este consorcio y no es la cuenta principal? */
async function isStaff(company: number, id: number) {
  return (await query("SELECT 1 FROM users u JOIN companies c ON c.id = u.company_id WHERE u.id=? AND u.company_id=? AND u.role='viewer' AND NOT (c.owner_id <=> u.id)", [id, company])).length > 0;
}

/** PATCH { id, password } */
export async function PATCH(req: Request) {
  const { s, err } = await guard(["viewer"]);
  if (err) return err;
  const c = await ctx(s);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!c?.isOwner || !(await isStaff(c.company, id))) return NextResponse.json({ error: "No puedes cambiar esa cuenta" }, { status: 403 });
  if (String(b.password ?? "").length < 8) return NextResponse.json({ error: "Contraseña mínima de 8 caracteres" }, { status: 400 });
  await run("UPDATE users SET password_hash=? WHERE id=?", [bcrypt.hashSync(String(b.password), 10), id]);
  return NextResponse.json({ ok: true });
}

/** DELETE ?id= */
export async function DELETE(req: Request) {
  const { s, err } = await guard(["viewer"]);
  if (err) return err;
  const c = await ctx(s);
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!c?.isOwner || !id || !(await isStaff(c.company, id))) return NextResponse.json({ error: "No puedes eliminar esa cuenta" }, { status: 403 });
  await run("DELETE FROM users WHERE id=?", [id]);
  return NextResponse.json({ ok: true });
}
