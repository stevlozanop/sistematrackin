import { NextResponse } from "next/server";
import { query, tx } from "@/lib/db";
import { guard } from "@/lib/guard";
import { companyAdmins, money, notifyCharge, notifyConfirmed, paymentsOf } from "@/lib/billing";
import { pushLater, pushToUsers } from "@/lib/push";

/**
 * Consola The Iceberg Labs · Licencias de cada empresa (transportista).
 * GET  -> empresas con su licencia, cuentas que dependen de ella (incluye sus consorcios y clientes), conectados e historial
 * POST { companyId, action: "suspend" | "activate" | "update", plan?, expiresAt?, maxUsers?, note? }
 * Pagos: action "billing" (cuota, moneda, ciclo, datos para pagar) · "charge" (nuevo cobro) · "confirm" · "reject" · "void"
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
         l.fee, COALESCE(l.currency::text, 'PEN') AS currency, COALESCE(l.cycle::text, 'mensual') AS cycle, l.pay_info,
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
  const payments = Object.fromEntries(await Promise.all((companies as { id: number }[]).map(async (c) => [c.id, await paymentsOf(c.id, 24)])));
  return NextResponse.json({ companies, events, payments });
}

export async function POST(req: Request) {
  const { s, err } = await guard(["dev"]);
  if (err) return err;
  const b = await req.json().catch(() => ({}));
  const id = Number(b.companyId);
  const [co] = await query<{ id: number; name: string }>("SELECT id, name::text AS name FROM companies WHERE id = ? AND kind = 'transport'", [id]);
  if (!co) return NextResponse.json({ error: "Esa empresa no existe" }, { status: 404 });
  const action = String(b.action ?? "");
  if (["billing", "charge", "confirm", "reject", "void"].includes(action)) return billing(action, b, co, s.id);
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

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const txt = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n) || null;

/** Cobro de la licencia: cuota y datos para pagar, nuevos cobros, confirmar o rechazar el pago avisado, anular */
async function billing(action: string, b: Record<string, unknown>, co: { id: number; name: string }, by: number) {
  const ev = (detail: string) => query("INSERT INTO license_events (company_id, action, detail, user_id) VALUES (?, 'pago', ?, ?)", [co.id, detail, by]);
  if (action === "billing") {
    const fee = b.fee === "" || b.fee === null || b.fee === undefined ? null : Number(b.fee);
    if (fee !== null && (!Number.isFinite(fee) || fee < 0)) return NextResponse.json({ error: "Cuota inválida" }, { status: 400 });
    const currency = b.currency === "USD" ? "USD" : "PEN";
    const cycle = b.cycle === "anual" ? "anual" : "mensual";
    await query("INSERT INTO licenses (company_id, updated_by) VALUES (?, ?) ON CONFLICT (company_id) DO NOTHING", [co.id, by]);
    await query("UPDATE licenses SET fee = ?, currency = ?, cycle = ?, pay_info = ?, updated_by = ?, updated_at = LOCALTIMESTAMP(0) WHERE company_id = ?",
      [fee, currency, cycle, txt(b.payInfo, 1500), by, co.id]);
    await ev(`Cuota ${fee === null ? "sin definir" : `${money(fee, currency)} ${cycle}`}`);
    return NextResponse.json({ ok: true });
  }
  if (action === "charge") {
    const period = txt(b.period, 40), amount = Number(b.amount), dueOn = String(b.dueOn ?? "");
    const currency = b.currency === "USD" ? "USD" : "PEN";
    if (!period) return NextResponse.json({ error: "Indica el periodo (ej. Noviembre 2026)" }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Indica el monto" }, { status: 400 });
    if (!DAY.test(dueOn)) return NextResponse.json({ error: "Indica la fecha de vencimiento" }, { status: 400 });
    const [dup] = await query<{ id: number }>("SELECT id FROM license_payments WHERE company_id = ? AND period = ? AND status <> 'anulado'", [co.id, period]);
    if (dup) return NextResponse.json({ error: `Ya hay un cobro de ${period}` }, { status: 409 });
    await query("INSERT INTO license_payments (company_id, period, amount, currency, due_on, note, created_by) VALUES (?, ?, ?, ?, ?::date, ?, ?)",
      [co.id, period, amount, currency, dueOn, txt(b.note, 300), by]);
    await ev(`Nuevo cobro ${period}: ${money(amount, currency)}, vence ${dueOn}`);
    pushLater(() => notifyCharge(co.id, { period, amount, currency, due_on: dueOn }));
    return NextResponse.json({ ok: true });
  }
  const [p] = await query<{ id: number; period: string; amount: number; currency: string; status: string }>(
    "SELECT id, period::text AS period, amount, currency::text AS currency, status::text AS status FROM license_payments WHERE id = ? AND company_id = ?", [Number(b.paymentId), co.id]);
  if (!p) return NextResponse.json({ error: "Ese cobro no existe" }, { status: 404 });
  if (action === "confirm") {
    if (p.status === "pagado") return NextResponse.json({ error: "Ya está confirmado" }, { status: 409 });
    const paidOn = DAY.test(String(b.paidOn ?? "")) ? String(b.paidOn) : null;
    await query(`UPDATE license_payments SET status = 'pagado', paid_on = COALESCE(?::date, paid_on, CURRENT_DATE), method = COALESCE(?, method),
                 reference = COALESCE(?, reference), confirmed_by = ?, confirmed_at = LOCALTIMESTAMP(0) WHERE id = ?`,
      [paidOn, txt(b.method, 40), txt(b.reference, 60), by, p.id]);
    await ev(`Pago confirmado ${p.period}: ${money(Number(p.amount), p.currency)}`);
    pushLater(() => notifyConfirmed(co.id, { period: p.period, amount: Number(p.amount), currency: p.currency }));
  } else if (action === "reject") {
    if (p.status !== "reportado") return NextResponse.json({ error: "Solo se rechaza un pago avisado" }, { status: 409 });
    const why = txt(b.note, 300) ?? "No encontramos el pago";
    await query("UPDATE license_payments SET status = 'pendiente', note = ? WHERE id = ?", [why, p.id]);
    await ev(`Pago avisado de ${p.period} no encontrado: ${why}`);
    pushLater(async () => pushToUsers(await companyAdmins(co.id), { title: "No encontramos tu pago de licencia", body: `${p.period}: ${why}`, url: "/licencia", tag: "licencia" }, "licencia"));
  } else {
    if (p.status === "pagado") return NextResponse.json({ error: "Un pago confirmado no se anula" }, { status: 409 });
    await query("UPDATE license_payments SET status = 'anulado' WHERE id = ?", [p.id]);
    await ev(`Cobro anulado ${p.period}`);
  }
  return NextResponse.json({ ok: true });
}
