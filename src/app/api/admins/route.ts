import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query, queryList, run, tx } from "@/lib/db";
import { guard, SUPER } from "@/lib/guard";
import { SITE_INFO, isSite } from "@/lib/hsp";
import { areaOf, areaStages } from "@/lib/workflow";

/**
 * Usuarios del sistema: supervisores, encargados de etapa y cuentas de solo lectura (Honda y dealers).
 * dev administra todo; un supervisor administra encargados y cuentas de solo lectura.
 */
type Role = "admin" | "operator" | "viewer" | "dealer";
const ROLES: Role[] = ["admin", "operator", "viewer", "dealer"];
/** Un supervisor (la transportista que compró el sistema) también crea supervisores, pero solo de su propia empresa. */
const manageable = (me: string): Role[] => (me === "dev" ? ROLES : ["admin", "operator", "viewer", "dealer"]);
/** ¿Es la cuenta principal de alguna empresa? */
const isOwner = async (id: number) => (await query("SELECT 1 FROM companies WHERE owner_id=?", [id])).length > 0;
const companyOf = async (id: number) => (await query<{ company_id: number | null }>("SELECT company_id FROM users WHERE id=?", [id]))[0]?.company_id ?? null;

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
    `SELECT u.id, u.name, u.email, u.role, u.area, u.carrier, u.can_import, DATE_FORMAT(u.created_at,'%Y-%m-%d %H:%i') AS created_at,
       DATE_FORMAT(u.last_seen,'%Y-%m-%d %H:%i:%s') AS last_seen,
       (u.last_seen > NOW() - INTERVAL 60 SECOND) AS online,
       u.company_id, c.name AS company, u.dealer_id, d.name AS dealer, u.client,
       (SELECT COUNT(*) FROM dealers dc WHERE dc.client = u.client) AS client_stores, (c.owner_id <=> u.id) AS is_owner
     FROM users u LEFT JOIN companies c ON c.id = u.company_id LEFT JOIN dealers d ON d.id = u.dealer_id
     WHERE u.role IN (?) AND (? = 'dev' OR u.role <> 'admin' OR u.company_id <=> ?) ORDER BY u.id DESC`,
    [roles, s.role, s.role === "dev" ? null : await companyOf(s.id)],
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
  const role: Role = ROLES.includes(b.role) ? b.role : "admin";
  const asg = role === "operator" ? parseAssignment(b) : { area: null, stages: [], carrier: null, canImport: 0 };
  // Cuenta de cliente de Honda: ve todas las tiendas de su cliente (o, si se elige una tienda, solo esa).
  // Empresa: la elegida, o la del supervisor que crea la cuenta.
  const dealerId = role === "dealer" ? Number(b.dealerId) || null : null;
  const client = role === "dealer" && b.client ? String(b.client).trim().toUpperCase().slice(0, 120) : null;
  if (role === "dealer") {
    const ok = client
      ? (await query("SELECT 1 FROM dealers WHERE client=? LIMIT 1", [client])).length
      : dealerId ? (await query("SELECT 1 FROM dealers WHERE id=?", [dealerId])).length : 0;
    if (!ok) return NextResponse.json({ error: "Elige el cliente" }, { status: 400 });
  }
  const [creator] = await query<{ company_id: number | null }>("SELECT company_id FROM users WHERE id=?", [s.id]);
  // Empresa de la cuenta: The Iceberg Labs (dev) elige cualquiera; un supervisor, su empresa o uno de sus consorcios cliente
  const wanted = Number(b.companyId) || null;
  const [target] = wanted
    ? await query<{ id: number; kind: string; parent_id: number | null }>("SELECT id, kind, parent_id FROM companies WHERE id=?", [wanted])
    : [];
  let companyId = s.role === "dev" ? target?.id ?? null : creator?.company_id ?? null;
  // Un dealer creado por The Iceberg Labs sin empresa queda en la transportista (los dealers son parte de su sistema)
  if (!companyId && role === "dealer") companyId = (await query<{ id: number }>("SELECT id FROM companies WHERE kind='transport' ORDER BY id LIMIT 1"))[0]?.id ?? null;
  if (s.role !== "dev" && target && creator?.company_id && (target.id === creator.company_id || target.parent_id === creator.company_id)) companyId = target.id;
  // En un consorcio cliente (Honda…) solo hay cuentas de solo lectura
  if (companyId && companyId === target?.id && target.kind === "client" && role !== "viewer") {
    return NextResponse.json({ error: "Las cuentas de un consorcio cliente son de solo lectura" }, { status: 400 });
  }
  if (!manageable(s.role).includes(role)) return NextResponse.json({ error: "No puedes crear ese tipo de usuario" }, { status: 403 });
  if (role === "admin" && s.role !== "dev" && !creator?.company_id) {
    return NextResponse.json({ error: "Solo un supervisor de una empresa puede crear otros supervisores" }, { status: 403 });
  }
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return NextResponse.json({ error: "Nombre, correo válido y contraseña (mín. 8) son obligatorios" }, { status: 400 });
  }
  if (!asg) return NextResponse.json({ error: "Área o etapas inválidas" }, { status: 400 });
  if (role === "operator" && !asg.stages.length) return NextResponse.json({ error: "Elige el área o al menos una etapa" }, { status: 400 });
  try {
    await tx(async (c) => {
      const [r] = await c.query("INSERT INTO users(name,email,password_hash,role,area,carrier,can_import,company_id,dealer_id,client) VALUES (?,?,?,?,?,?,?,?,?,?)", [
        name, email, bcrypt.hashSync(password, 10), role, asg.area, asg.carrier, asg.canImport, companyId, client ? null : dealerId, client,
      ]);
      const id = (r as { insertId: number }).insertId;
      // La primera cuenta de supervisor de una transportista es su cuenta principal («Empresa»)
      if (role === "admin" && companyId) {
        await c.query("UPDATE companies SET owner_id=? WHERE id=? AND kind='transport' AND owner_id IS NULL", [id, companyId]);
      }
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
  if (s.role !== "dev" && id !== s.id && (await isOwner(id))) {
    return NextResponse.json({ error: "Solo The Iceberg Labs puede cambiar la cuenta principal de la empresa" }, { status: 403 });
  }
  if (u.role === "admin" && s.role !== "dev" && (await companyOf(id)) !== (await companyOf(s.id))) {
    return NextResponse.json({ error: "No existe" }, { status: 404 });
  }

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
  if (!id) return NextResponse.json({ error: "Falta el usuario" }, { status: 400 });
  if (id === s.id) return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 400 });
  if (s.role !== "dev" && (await isOwner(id))) {
    return NextResponse.json({ error: "Solo The Iceberg Labs puede eliminar la cuenta principal de la empresa" }, { status: 403 });
  }
  // Un supervisor solo elimina supervisores de su propia empresa
  const [t] = await query<{ role: string; company_id: number | null }>("SELECT role, company_id FROM users WHERE id=?", [id]);
  if (t?.role === "admin" && s.role !== "dev" && t.company_id !== (await companyOf(s.id))) {
    return NextResponse.json({ error: "No puedes eliminar a ese supervisor" }, { status: 403 });
  }
  await queryList("DELETE FROM users WHERE id=? AND role IN (?)", [id, manageable(s.role)]);
  return NextResponse.json({ ok: true });
}
