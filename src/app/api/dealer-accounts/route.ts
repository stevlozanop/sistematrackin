import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { query, queryList, tx } from "@/lib/db";
import { guard, SUPER } from "@/lib/guard";
import { fillDealerClients } from "@/lib/clients";
import { clientConsortiumOf, clientsConsortium } from "@/lib/companies";
import { USER_DOMAIN } from "@/lib/workflow";

/**
 * Cuentas de los clientes de Honda en bloque (The Iceberg Labs, la empresa y el propio consorcio Honda).
 * Un cliente (SORSA, CREDIVARGAS…) tiene una o varias tiendas; su cuenta ve todas sus tiendas y nada más.
 * GET  -> los clientes, con sus tiendas, unidades y la cuenta (si ya tiene).
 * POST { clients: string[] } -> crea una cuenta por cada cliente que todavía no tiene y devuelve
 *       usuario + contraseña UNA sola vez, para descargarlos y entregarlos.
 */

/** «CREDIVARGAS» -> «credivargas» · «GRUPO MALCA» -> «grupomalca» (para el usuario). */
function slug(name: string) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24) || "cliente";
}

function password() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(10), (n) => chars[n % chars.length]).join("") + "!";
}

const title = (s: string) => s.toLowerCase().replace(/(^|[\s\-(&.])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

/** The Iceberg Labs, la empresa (Leyva) y Honda (consorcio cliente) pueden dar acceso a los clientes de Honda. */
const CAN: Parameters<typeof guard>[0] = [...SUPER, "viewer"];

export async function GET() {
  const { s, err } = await guard(CAN);
  if (s && s.role === "viewer" && !(await clientConsortiumOf(s))) return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 });
  if (err) return err;
  await fillDealerClients();
  const rows = await query<{ client: string; stores: string; departments: string | null; units: number; open: number; accounts: string | null; own: number }>(
    `SELECT d.client,
       GROUP_CONCAT(DISTINCT d.name ORDER BY d.name SEPARATOR '|') stores,
       GROUP_CONCAT(DISTINCT d.department ORDER BY d.department SEPARATOR ', ') departments,
       COUNT(un.id) units, SUM(un.d_entrega IS NULL AND un.id IS NOT NULL) open,
       (SELECT GROUP_CONCAT(u.email ORDER BY u.id SEPARATOR ', ') FROM users u
         WHERE u.role = 'dealer' AND (u.client = d.client OR u.dealer_id IN (SELECT id FROM dealers x WHERE x.client = d.client))) accounts,
       -- el cliente ya es una cuenta de la empresa o del consorcio (ej. SERVIHONDA es la cuenta principal de Honda)
       EXISTS (SELECT 1 FROM users u WHERE u.role <> 'dealer' AND u.client = d.client) own
     FROM dealers d LEFT JOIN units un ON un.dealer_id = d.id
     WHERE d.client IS NOT NULL
     GROUP BY d.client ORDER BY units DESC`,
  );
  // No se ofrece dar acceso a un cliente que ya es una cuenta de la empresa o del consorcio
  return NextResponse.json(rows.filter((r) => !Number(r.own)).map((r) => ({ ...r, stores: r.stores.split("|"), units: Number(r.units ?? 0), open: Number(r.open ?? 0) })));
}

export async function POST(req: Request) {
  const { s, err } = await guard(CAN);
  if (err) return err;
  // Honda solo crea cuentas en su propio consorcio
  const hondaCompany = await clientConsortiumOf(s);
  if (s.role === "viewer" && !hondaCompany) return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const wanted: string[] = Array.isArray(b.clients) ? b.clients.map((c: unknown) => String(c).trim().toUpperCase()).filter(Boolean) : [];
  if (!wanted.length) return NextResponse.json({ error: "Elige al menos un cliente" }, { status: 400 });

  // Solo clientes que existen y todavía no tienen cuenta
  const clients = await queryList<{ client: string; stores: number; departments: string | null }>(
    `SELECT d.client, COUNT(*) stores, GROUP_CONCAT(DISTINCT d.department SEPARATOR ', ') departments FROM dealers d
     WHERE d.client IN (?) AND NOT EXISTS (SELECT 1 FROM users u WHERE u.client = d.client)
     GROUP BY d.client ORDER BY d.client`,
    [wanted],
  );
  if (!clients.length) return NextResponse.json({ created: [] });
  // Los clientes pertenecen al sistema de la transportista: la empresa de quien los crea o, si es The Iceberg Labs, la transportista
  const [creator] = await query<{ company_id: number | null }>("SELECT company_id FROM users WHERE id=?", [s.id]);
  // Las cuentas quedan en el consorcio Honda (sus colores y su logo); si no existe, en la transportista
  const companyId = hondaCompany ?? (await clientsConsortium(creator?.company_id ?? null))
    ?? creator?.company_id ?? (await query<{ id: number }>("SELECT id FROM companies WHERE kind='transport' ORDER BY id LIMIT 1"))[0]?.id ?? null;
  const taken = new Set((await query<{ email: string }>("SELECT email FROM users")).map((u) => u.email));

  const created = clients.map((c) => {
    const base = `${slug(c.client)}.cliente`;
    let email = `${base}@${USER_DOMAIN}`;
    for (let n = 2; taken.has(email); n++) email = `${base}${n}@${USER_DOMAIN}`;
    taken.add(email);
    return { client: c.client, stores: Number(c.stores), departments: c.departments, name: title(c.client), email, password: password() };
  });

  await tx(async (c) => {
    await c.query(
      "INSERT INTO users(name, email, password_hash, role, company_id, client, created_by) VALUES ?",
      [created.map((a) => [a.name.slice(0, 120), a.email, bcrypt.hashSync(a.password, 10), "dealer", companyId, a.client, s.id])],
    );
  });
  return NextResponse.json({ created }, { status: 201 });
}
