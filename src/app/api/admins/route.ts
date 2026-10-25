import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query, queryList, run, tx } from "@/lib/db";
import { guard, SUPER } from "@/lib/guard";
import { SITE_INFO, isSite } from "@/lib/hsp";
import { areaOf, areaStages } from "@/lib/workflow";

/**
 * Usuarios del sistema: administradores y encargados de etapa.
 * dev administra todo; un admin solo puede administrar encargados.
 */
type Role = "admin" | "operator";
const manageable = (me: string): Role[] => (me === "dev" ? ["admin", "operator"] : ["operator"]);

/** Valida la lista de etapas [{ site, field }] contra las etapas de cada módulo. */
function parseStages(v: unknown): { site: string; field: string }[] | null {
  if (!Array.isArray(v)) return null;
  const out: { site: string; field: string }[] = [];
  for (const x of v as { site?: unknown; field?: unknown }[]) {
    if (!isSite(x?.site) || !SITE_INFO[x.site].dates.some((d) => d.key === x.field)) return null;
    out.push({ site: x.site, field: String(x.field) });
  }
  return out;
}

/** Etapas, área y empresa a partir de lo que envía el formulario. El área define las etapas (salvo "Personalizado"). */
function parseAssignment(b: { area?: unknown; stages?: unknown; carrier?: unknown; canImport?: unknown }) {
  const area = areaOf(String(b.area ?? "CUSTOM"));
  if (!area) return null;
  const stages = area.id === "CUSTOM" ? parseStages(b.stages ?? []) : areaStages(area);
  if (!stages) return null;
  const carrier = area.carrier ? String(b.carrier ?? "").trim().toUpperCase().slice(0, 120) || null : null;
  return { area: area.id, stages, carrier, canImport: b.canImport ? 1 : 0 };
}

export async function GET(req: Request) {
  const { s, err } = await guard(SUPER);
  if (err) return err;
  // Empresas de transporte conocidas (columna Tramo final), para el selector
  if (new URL(req.url).searchParams.get("carriers")) {
    const rows = await query<{ v: string }>("SELECT DISTINCT UPPER(carrier) v FROM units WHERE carrier IS NOT NULL AND carrier <> '' ORDER BY v");
    return NextResponse.json(rows.map((r) => r.v));
  }
  const roles = manageable(s.role);
  const users = await queryList<{ id: number; name: string; email: string; role: Role; created_at: string; last_seen: string | null }>(
    `SELECT id, name, email, role, area, carrier, can_import, DATE_FORMAT(created_at,'%Y-%m-%d %H:%i') AS created_at,
       DATE_FORMAT(last_seen,'%Y-%m-%d %H:%i:%s') AS last_seen,
       (last_seen > NOW() - INTERVAL 60 SECOND) AS online
     FROM users WHERE role IN (?) ORDER BY id DESC`,
    [roles],
  );
  const stages = await query<{ user_id: number; site: string; field: string }>("SELECT user_id, site, field FROM user_stages");
  return NextResponse.json(users.map((u) => ({ ...u, stages: stages.filter((st) => st.user_id === u.id).map(({ site, field }) => ({ site, field })) })));
}

export async function POST(req: Request) {
  const { s, err } = await guard(SUPER);
  if (err) return err;
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const role: Role = b.role === "operator" ? "operator" : "admin";
  const asg = role === "operator" ? parseAssignment(b) : { area: null, stages: [], carrier: null, canImport: 0 };
  if (!manageable(s.role).includes(role)) return NextResponse.json({ error: "No puedes crear ese tipo de usuario" }, { status: 403 });
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return NextResponse.json({ error: "Nombre, correo válido y contraseña (mín. 8) son obligatorios" }, { status: 400 });
  }
  if (!asg) return NextResponse.json({ error: "Área o etapas inválidas" }, { status: 400 });
  if (role === "operator" && !asg.stages.length) return NextResponse.json({ error: "Elige el área o al menos una etapa" }, { status: 400 });
  try {
    await tx(async (c) => {
      const [r] = await c.query("INSERT INTO users(name,email,password_hash,role,area,carrier,can_import) VALUES (?,?,?,?,?,?,?)", [
        name, email, bcrypt.hashSync(password, 10), role, asg.area, asg.carrier, asg.canImport,
      ]);
      const id = (r as { insertId: number }).insertId;
      if (asg.stages.length) await c.query("INSERT INTO user_stages(user_id, site, field) VALUES ?", [asg.stages.map((st) => [id, st.site, st.field])]);
    });
  } catch {
    return NextResponse.json({ error: "Ese correo ya existe" }, { status: 409 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** PATCH { id, password } o { id, area, stages?, carrier? } */
export async function PATCH(req: Request) {
  const { s, err } = await guard(SUPER);
  if (err) return err;
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  const [u] = await query<{ role: Role }>("SELECT role FROM users WHERE id=?", [id]);
  if (!u || !manageable(s.role).includes(u.role)) return NextResponse.json({ error: "No existe" }, { status: 404 });

  if (b.area !== undefined || b.stages !== undefined) {
    const asg = parseAssignment(b);
    if (!asg || u.role !== "operator" || !asg.stages.length) return NextResponse.json({ error: "Elige el área o al menos una etapa" }, { status: 400 });
    await tx(async (c) => {
      await c.query("UPDATE users SET area=?, carrier=?, can_import=? WHERE id=?", [asg.area, asg.carrier, asg.canImport, id]);
      await c.query("DELETE FROM user_stages WHERE user_id=?", [id]);
      await c.query("INSERT INTO user_stages(user_id, site, field) VALUES ?", [asg.stages.map((st) => [id, st.site, st.field])]);
    });
    return NextResponse.json({ ok: true });
  }
  if (String(b.password ?? "").length < 8) return NextResponse.json({ error: "Contraseña mínima de 8 caracteres" }, { status: 400 });
  await run("UPDATE users SET password_hash=? WHERE id=?", [bcrypt.hashSync(String(b.password), 10), id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { s, err } = await guard(SUPER);
  if (err) return err;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (id === s.id) return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 400 });
  await queryList("DELETE FROM users WHERE id=? AND role IN (?)", [id, manageable(s.role)]);
  return NextResponse.json({ ok: true });
}
