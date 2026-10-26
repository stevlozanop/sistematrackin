import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { query, queryList, tx } from "@/lib/db";
import { guard, SUPER } from "@/lib/guard";
import { USER_DOMAIN } from "@/lib/workflow";

/**
 * Cuentas de dealers en bloque (SWM Labs y supervisores de la transportista).
 * GET  -> todos los dealers, con su cuenta (si ya tiene) y sus unidades.
 * POST { dealerIds } -> crea una cuenta para cada dealer que todavía no tiene y devuelve
 *       usuario + contraseña UNA sola vez, para descargarlos y entregarlos.
 */
const SUFFIX = new Set(["sac", "s", "a", "c", "eirl", "srl", "sa", "e", "i", "r", "l", "de", "la", "del", "y"]);

/** «COMERCIAL ROMAMOTOR - DOS DE MAYO» -> «comercialromamotordos» (letras, sin razón social). */
function slug(name: string) {
  const words = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter((w) => w && !SUFFIX.has(w));
  return words.slice(0, 3).join("").slice(0, 24) || "dealer";
}

function password() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(10), (n) => chars[n % chars.length]).join("") + "!";
}

const title = (s: string) => s.toLowerCase().replace(/(^|[\s\-(&])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

export async function GET() {
  const { err } = await guard(SUPER);
  if (err) return err;
  const rows = await query(
    `SELECT d.id, d.name, d.department, d.district,
       COUNT(un.id) units, SUM(un.d_entrega IS NULL) open,
       (SELECT GROUP_CONCAT(u.email ORDER BY u.id SEPARATOR ', ') FROM users u WHERE u.dealer_id = d.id) accounts
     FROM dealers d LEFT JOIN units un ON un.dealer_id = d.id
     GROUP BY d.id ORDER BY d.department, d.name`,
  );
  return NextResponse.json(rows.map((r) => ({ ...r, units: Number(r.units ?? 0), open: Number(r.open ?? 0) })));
}

export async function POST(req: Request) {
  const { s, err } = await guard(SUPER);
  if (err) return err;
  const b = await req.json().catch(() => ({}));
  const ids = Array.isArray(b.dealerIds) ? b.dealerIds.map(Number).filter((n: number) => n > 0) : [];
  if (!ids.length) return NextResponse.json({ error: "Elige al menos un dealer" }, { status: 400 });

  // Solo los que todavía no tienen cuenta
  const dealers = await queryList<{ id: number; name: string; department: string | null }>(
    "SELECT d.id, d.name, d.department FROM dealers d WHERE d.id IN (?) AND NOT EXISTS (SELECT 1 FROM users u WHERE u.dealer_id = d.id) ORDER BY d.name",
    [ids],
  );
  if (!dealers.length) return NextResponse.json({ created: [] });
  // Los dealers pertenecen al sistema de la transportista: la empresa de quien los crea o, si es SWM Labs, la transportista
  const [creator] = await query<{ company_id: number | null }>(
    "SELECT COALESCE(company_id, (SELECT id FROM companies WHERE kind='transport' ORDER BY id LIMIT 1)) company_id FROM users WHERE id=?", [s.id],
  );
  const taken = new Set((await query<{ email: string }>("SELECT email FROM users")).map((u) => u.email));

  const created = dealers.map((d) => {
    const base = `${slug(d.name)}.dealer`;
    let email = `${base}@${USER_DOMAIN}`;
    for (let n = 2; taken.has(email); n++) email = `${base}${n}@${USER_DOMAIN}`;
    taken.add(email);
    return { dealerId: d.id, dealer: d.name, department: d.department, name: title(d.name), email, password: password() };
  });

  await tx(async (c) => {
    await c.query(
      "INSERT INTO users(name, email, password_hash, role, company_id, dealer_id) VALUES ?",
      [created.map((a) => [a.name.slice(0, 120), a.email, bcrypt.hashSync(a.password, 10), "dealer", creator?.company_id ?? null, a.dealerId])],
    );
  });
  return NextResponse.json({ created }, { status: 201 });
}
