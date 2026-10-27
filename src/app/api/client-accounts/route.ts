import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query, run } from "@/lib/db";
import { guard, SUPER } from "@/lib/guard";
import { clientConsortiumOf } from "@/lib/companies";
import type { Session } from "@/lib/auth";

/**
 * Cuentas de los clientes de Honda (SORSA, SERVIHONDA…): ver, restablecer contraseña y eliminar.
 * - Honda (solo lectura de su consorcio): solo las cuentas de clientes de su consorcio.
 * - La empresa (Leyva) y The Iceberg Labs: todas.
 * Para crear se usa /api/dealer-accounts (una o varias a la vez).
 */
const CAN: Session["role"][] = [...SUPER, "viewer"];

/** Empresa a la que se limita quien pide (null = sin límite: Leyva o The Iceberg Labs). undefined = sin permiso. */
async function limitOf(s: Session): Promise<number | null | undefined> {
  if (s.role === "dev" || s.role === "admin") return null;
  return (await clientConsortiumOf(s)) ?? undefined;
}

/** ¿La cuenta id es de un cliente que esta persona puede administrar? */
async function canTouch(s: Session, id: number) {
  const limit = await limitOf(s);
  if (limit === undefined) return false;
  const [u] = await query<{ company_id: number | null }>("SELECT company_id FROM users WHERE id=? AND role='dealer'", [id]);
  return !!u && (limit === null || u.company_id === limit);
}

export async function GET() {
  const { s, err } = await guard(CAN);
  if (err) return err;
  const limit = await limitOf(s);
  if (limit === undefined) return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 });
  const rows = await query(
    `SELECT u.id, u.name, u.email, u.client, DATE_FORMAT(u.created_at,'%Y-%m-%d') created_at,
       DATE_FORMAT(u.last_seen,'%Y-%m-%d %H:%i') last_seen, (u.last_seen > NOW() - INTERVAL 60 SECOND) online,
       cb.name created_by, IF(cb.role = 'dev', 'The Iceberg Labs', cbc.name) created_by_company,
       (SELECT COUNT(*) FROM dealers d WHERE d.client = u.client) stores
     FROM users u
     LEFT JOIN users cb ON cb.id = u.created_by LEFT JOIN companies cbc ON cbc.id = cb.company_id
     WHERE u.role = 'dealer' ${limit === null ? "" : "AND u.company_id = ?"}
     ORDER BY u.client NULLS FIRST, u.id`,
    limit === null ? [] : [limit],
  );
  return NextResponse.json(rows);
}

/** PATCH { id, password } — nueva contraseña para la cuenta de un cliente. */
export async function PATCH(req: Request) {
  const { s, err } = await guard(CAN);
  if (err) return err;
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!(await canTouch(s, id))) return NextResponse.json({ error: "No puedes cambiar esa cuenta" }, { status: 403 });
  if (String(b.password ?? "").length < 8) return NextResponse.json({ error: "Contraseña mínima de 8 caracteres" }, { status: 400 });
  await run("UPDATE users SET password_hash=? WHERE id=?", [bcrypt.hashSync(String(b.password), 10), id]);
  return NextResponse.json({ ok: true });
}

/** DELETE ?id= — quita el acceso a un cliente. */
export async function DELETE(req: Request) {
  const { s, err } = await guard(CAN);
  if (err) return err;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id || !(await canTouch(s, id))) return NextResponse.json({ error: "No puedes eliminar esa cuenta" }, { status: 403 });
  await run("DELETE FROM users WHERE id=? AND role='dealer'", [id]);
  return NextResponse.json({ ok: true });
}
