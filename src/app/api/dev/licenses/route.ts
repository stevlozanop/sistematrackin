import { NextResponse } from "next/server";
import { query, tx } from "@/lib/db";
import { guard } from "@/lib/guard";

/**
 * Consola The Iceberg Labs · Licencias de cada empresa (transportista).
 * GET  -> empresas con su licencia, cuentas que dependen de ella (incluye sus consorcios y clientes), conectados e historial
 * POST { companyId, action: "suspend" | "activate" | "update", plan?, expiresAt?, maxUsers?, note? }
 * Suspender corta al instante: en unos segundos todas esas cuentas ven la pantalla de licencia suspendida.
 */
export async function GET() {
  const { err } = await guard(["dev"]);
  if (err) return err;
  const [companies, events] = await Promise.all([
    query(
      `SELECT r.id, r.name::text AS name, r.code::text AS code, r.color,
         COALESCE(l.status::text, 'active') AS status, COALESCE(l.plan::text, 'Estándar') AS plan,
         to_char(l.starts_at, 'YYYY-MM-DD') AS starts_at, to_char(l.expires_at, 'YYYY-MM-DD') AS expires_at,
         (l.expires_at - CURRENT_DATE)::int AS days_left, l.max_users, l.note, (l.company_id IS NOT NULL) AS registered,
         to_char(l.updated_at, 'YYYY-MM-DD HH24:MI') AS updated_at, ub.name::text AS updated_by,
         (SELECT COUNT(*) FROM users u JOIN companies c ON c.id = u.company_id WHERE COALESCE(c.parent_id, c.id) = r.id)::int AS accounts,
         (SELECT COUNT(*) FROM users u JOIN companies c ON c.id = u.company_id WHERE COALESCE(c.parent_id, c.id) = r.id AND u.last_seen > NOW() - INTERVAL 60 SECOND)::int AS online,
         (SELECT COUNT(*) FROM companies c WHERE c.parent_id = r.id)::int AS consortia,
         (SELECT string_agg(c.name::text, ', ' ORDER BY c.name) FROM companies c WHERE c.parent_id = r.id) AS consortia_names,
         to_char((SELECT MAX(u.last_seen) FROM users u JOIN companies c ON c.id = u.company_id WHERE COALESCE(c.parent_id, c.id) = r.id), 'YYYY-MM-DD HH24:MI') AS last_seen
       FROM companies r LEFT JOIN licenses l ON l.company_id = r.id LEFT JOIN users ub ON ub.id = l.updated_by
       WHERE r.kind = 'transport' ORDER BY r.name`,
    ),
    query(
      `SELECT e.id, e.company_id, c.name::text AS company, e.action::text AS action, e.detail, u.name::text AS "user", to_char(e.at, 'YYYY-MM-DD HH24:MI') AS at
       FROM license_events e JOIN companies c ON c.id = e.company_id LEFT JOIN users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT 40`,
    ),
  ]);
  return NextResponse.json({ companies, events });
}

export async function POST(req: Request) {
  const { s, err } = await guard(["dev"]);
  if (err) return err;
  const b = await req.json().catch(() => ({}));
  const id = Number(b.companyId);
  const [co] = await query<{ id: number; name: string }>("SELECT id, name::text AS name FROM companies WHERE id = ? AND kind = 'transport'", [id]);
  if (!co) return NextResponse.json({ error: "Esa empresa no existe" }, { status: 404 });
  const action = String(b.action ?? "");
  if (!["suspend", "activate", "update"].includes(action)) return NextResponse.json({ error: "Acción inválida" }, { status: 400 });

  const plan = String(b.plan ?? "").trim().slice(0, 40) || "Estándar";
  const expires = b.expiresAt ? String(b.expiresAt) : null;
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return NextResponse.json({ error: "Fecha de vencimiento inválida" }, { status: 400 });
  const max = b.maxUsers === null || b.maxUsers === "" || b.maxUsers === undefined ? null : Math.max(1, Math.floor(Number(b.maxUsers)));
  if (max !== null && !Number.isFinite(max)) return NextResponse.json({ error: "Máximo de cuentas inválido" }, { status: 400 });
  const note = String(b.note ?? "").trim().slice(0, 300) || null;

  await tx(async (c) => {
    // La licencia se crea la primera vez que se toca (antes de eso, la empresa está activa sin límites)
    await c.query("INSERT INTO licenses (company_id, updated_by) VALUES (?, ?) ON CONFLICT (company_id) DO NOTHING", [id, s.id]);
    let detail = "";
    if (action === "suspend") {
      await c.query("UPDATE licenses SET status = 'suspended', note = COALESCE(?, note), updated_by = ?, updated_at = LOCALTIMESTAMP(0) WHERE company_id = ?", [note, s.id, id]);
      detail = note ? `Motivo: ${note}` : "Sin motivo escrito";
    } else if (action === "activate") {
      await c.query("UPDATE licenses SET status = 'active', updated_by = ?, updated_at = LOCALTIMESTAMP(0) WHERE company_id = ?", [s.id, id]);
      detail = "Acceso restablecido";
    } else {
      await c.query("UPDATE licenses SET plan = ?, expires_at = ?::date, max_users = ?, note = ?, updated_by = ?, updated_at = LOCALTIMESTAMP(0) WHERE company_id = ?", [plan, expires, max, note, s.id, id]);
      detail = `Plan ${plan} · ${expires ? `vence ${expires}` : "sin vencimiento"} · ${max ? `hasta ${max} cuentas` : "cuentas sin límite"}`;
    }
    await c.query("INSERT INTO license_events (company_id, action, detail, user_id) VALUES (?, ?, ?, ?)", [id, action, detail, s.id]);
  });
  return NextResponse.json({ ok: true });
}
