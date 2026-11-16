import { NextResponse } from "next/server";
import { passwordProblem } from "@/lib/password";
import bcrypt from "bcryptjs";
import { query, run } from "@/lib/db";
import { guard } from "@/lib/guard";
import { clientConsortiumOf } from "@/lib/companies";
import type { Session } from "@/lib/auth";

/**
 * Empleados de un consorcio cliente (Honda): ya no se usan. Honda pidió no tener cuentas para su personal:
 * el consorcio entra solo con su cuenta principal. Se deja la lectura (para cuentas antiguas) y se bloquea crear.
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

export async function POST() {
  return NextResponse.json({ error: "El consorcio entra solo con su cuenta principal: ya no se crean cuentas para su personal." }, { status: 410 });
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
  const weak = passwordProblem(String(b.password ?? ""));
  if (weak) return NextResponse.json({ error: weak }, { status: 400 });
  await run("UPDATE users SET password_hash=?, sessions_after=LOCALTIMESTAMP(0) WHERE id=?", [bcrypt.hashSync(String(b.password), 10), id]);
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
