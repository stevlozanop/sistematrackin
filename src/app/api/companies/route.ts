import { NextResponse } from "next/server";
import { query, queryList, run } from "@/lib/db";
import { guard, SUPER } from "@/lib/guard";
import { canManage, myCompany } from "@/lib/companies";
import { isColor } from "@/lib/theme";

/**
 * Empresas y consorcios.
 * - The Iceberg Labs (dev): ve y administra todas; registra la transportista (Consorcio Leyva).
 * - Supervisor de la transportista (admin): ve su empresa y crea sus consorcios cliente (Honda…),
 *   que quedan con parent_id = su empresa. Solo puede editar o borrar esos consorcios.
 * Las cuentas de cada empresa se crean con /api/admins + companyId.
 */
type Company = {
  id: number; name: string; kind: "transport" | "client"; parent_id: number | null; owner_id?: number | null; logo_v?: string | null; parent?: string | null; ruc: string | null; members: string | null;
  address: string | null; phone: string | null; email: string | null; website: string | null; notes: string | null; created_at: string;
};

const FIELDS = ["name", "kind", "parent_id", "color", "ruc", "members", "address", "phone", "email", "website", "notes"] as const;
const LIMITS: Record<(typeof FIELDS)[number], number> = { name: 160, kind: 10, parent_id: 10, color: 7, ruc: 11, members: 500, address: 200, phone: 40, email: 160, website: 160, notes: 500 };

/** Valida y limpia lo que envía el formulario. */
function clean(b: Record<string, unknown>) {
  const out: Record<string, string | null> = {};
  for (const k of FIELDS) {
    if (b[k] === undefined) continue;
    const v = String(b[k] ?? "").trim().slice(0, LIMITS[k]);
    out[k] = v || null;
  }
  if (out.kind !== undefined && out.kind !== "transport" && out.kind !== "client") out.kind = "transport";
  if (out.ruc && !/^\d{11}$/.test(out.ruc)) return { error: "El RUC tiene 11 dígitos" };
  if (out.color !== undefined && out.color !== null && !isColor(out.color)) return { error: "Color inválido" };
  if (out.color) out.color = out.color.toLowerCase();
  if (out.parent_id !== undefined) out.parent_id = Number(out.parent_id) > 0 ? String(Number(out.parent_id)) : null;
  // Transportistas del grupo: en mayúsculas y separados por coma, como en la columna «Tramo final» del Excel
  if (out.members) out.members = out.members.split(",").map((m) => m.trim().toUpperCase()).filter(Boolean).join(", ");
  return { data: out };
}

const membersOf = (c: Company) => (c.members ?? "").split(",").map((m) => m.trim()).filter(Boolean);

export async function GET() {
  const { s, err } = await guard(SUPER);
  if (err) return err;
  const mine = await myCompany(s);
  if (s.role !== "dev" && !mine) return NextResponse.json({ companies: [], carriers: [], mine: null });
  const companies = await query<Company>(
    `SELECT c.id, c.name, c.kind, c.parent_id, c.owner_id, c.color, p.name parent, c.ruc, c.members, c.address, c.phone, c.email, c.website, c.notes,
       DATE_FORMAT(c.created_at,'%Y-%m-%d') created_at, UNIX_TIMESTAMP(c.logo_updated) logo_v
     FROM companies c LEFT JOIN companies p ON p.id = c.parent_id
     ${s.role === "dev" ? "" : "WHERE c.parent_id = ?"}
     ORDER BY c.parent_id IS NOT NULL, c.name`,
    // The Iceberg Labs ve todas (empresas y los consorcios que cada una creó); una empresa, solo los consorcios que ella creó
    s.role === "dev" ? [] : [mine],
  );
  const users = await query<{ id: number; name: string; email: string; role: string; company_id: number; online: number }>(
    "SELECT id, name, email, role, company_id, (last_seen > NOW() - INTERVAL 60 SECOND) online FROM users WHERE company_id IS NOT NULL ORDER BY role, name",
  );
  // Transportistas: cuántas unidades llevaron y cuántas llegaron a tiempo (según el nombre en «Tramo final»)
  const stats = await Promise.all(companies.map(async (c) => {
    const m = membersOf(c);
    if (c.kind !== "transport" || !m.length) return null;
    const [r] = await queryList<{ units: number; delivered: number; on_time: number; open: number }>(
      `SELECT COUNT(*) units, SUM(status='ENTREGADO') delivered, SUM(service='A TIEMPO') on_time, SUM(d_entrega IS NULL) open
       FROM v_units WHERE UPPER(carrier) IN (?)`,
      [m],
    );
    return { units: Number(r?.units ?? 0), delivered: Number(r?.delivered ?? 0), onTime: Number(r?.on_time ?? 0), open: Number(r?.open ?? 0) };
  }));
  // Nombres de transportistas en las unidades, para elegir los del grupo
  const carriers = (await query<{ v: string; n: number }>(
    "SELECT UPPER(carrier) v, COUNT(*) n FROM units WHERE carrier IS NOT NULL AND carrier <> '' GROUP BY UPPER(carrier) ORDER BY n DESC",
  ));
  return NextResponse.json({
    companies: companies.map((c, i) => ({ ...c, stats: stats[i], users: users.filter((u) => u.company_id === c.id) })),
    carriers,
    mine,
  });
}

export async function POST(req: Request) {
  const { s, err } = await guard(SUPER);
  if (err) return err;
  const r = clean(await req.json().catch(() => ({})));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  if (!r.data.name) return NextResponse.json({ error: "Escribe el nombre de la empresa" }, { status: 400 });
  // El supervisor solo crea consorcios cliente, que quedan bajo su empresa
  if (s.role !== "dev") {
    const mine = await myCompany(s);
    if (!mine) return NextResponse.json({ error: "Tu cuenta no pertenece a ninguna empresa" }, { status: 403 });
    Object.assign(r.data, { kind: "client", parent_id: String(mine), members: null });
  }
  try {
    const res = await run(
      `INSERT INTO companies (${Object.keys(r.data).join(",")}) VALUES (${Object.keys(r.data).map(() => "?").join(",")})`,
      Object.values(r.data),
    );
    return NextResponse.json({ ok: true, id: res.insertId }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ya existe una empresa con ese nombre" }, { status: 409 });
  }
}

/** PATCH { id, ...campos } */
export async function PATCH(req: Request) {
  const { s, err } = await guard(SUPER);
  if (err) return err;
  const b = await req.json().catch(() => ({}));
  if (!(await canManage(s, Number(b.id), true))) return NextResponse.json({ error: "No puedes editar esa empresa" }, { status: 403 });
  const r = clean(b);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  // El supervisor edita datos de contacto; el tipo, la jerarquía y los transportistas los define The Iceberg Labs
  if (s.role !== "dev") { delete r.data.kind; delete r.data.parent_id; delete r.data.members; }
  // Cuenta principal: solo The Iceberg Labs la cambia, y debe ser un supervisor de esa empresa
  if (s.role === "dev" && b.owner_id !== undefined) {
    const owner = Number(b.owner_id) || null;
    if (owner && !(await query("SELECT 1 FROM users WHERE id=? AND company_id=? AND role='admin'", [owner, Number(b.id)])).length) {
      return NextResponse.json({ error: "La cuenta principal debe ser un supervisor de esa empresa" }, { status: 400 });
    }
    await run("UPDATE companies SET owner_id=? WHERE id=?", [owner, Number(b.id)]);
  }
  if (r.data.name === null) return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
  const keys = Object.keys(r.data);
  if (!keys.length) return NextResponse.json({ ok: true }); // (la cuenta principal ya se guardó arriba)
  try {
    await run(`UPDATE companies SET ${keys.map((k) => `${k}=?`).join(",")} WHERE id=?`, [...Object.values(r.data), Number(b.id)]);
  } catch {
    return NextResponse.json({ error: "Ya existe una empresa con ese nombre" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE ?id= — la empresa se borra; sus cuentas siguen existiendo, sin empresa. */
export async function DELETE(req: Request) {
  const { s, err } = await guard(SUPER);
  if (err) return err;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!(await canManage(s, id))) return NextResponse.json({ error: "No puedes eliminar esa empresa" }, { status: 403 });
  await run("DELETE FROM companies WHERE id=?", [id]);
  return NextResponse.json({ ok: true });
}
