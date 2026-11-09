import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { query } from "@/lib/db";
import { licenseOfUser } from "@/lib/license";
import { notifyReported, paymentsOf } from "@/lib/billing";
import { pushLater } from "@/lib/push";

/**
 * «Licencia y pagos» de la empresa (Leyva): su licencia, cobros pendientes, cómo pagar e historial.
 * POST { action: "report", paymentId, paidOn, method, reference, note } → avisa a The Iceberg Labs que ya pagó.
 */
async function company(userId: number) {
  const lic = await licenseOfUser(userId);
  return lic.companyId ? lic : null;
}

export async function GET() {
  const { s, err } = await guard(["admin"]);
  if (err) return err;
  const lic = await company(s.id);
  if (!lic) return NextResponse.json({ error: "Tu cuenta no pertenece a una empresa" }, { status: 404 });
  const [b] = await query<{ fee: number | null; currency: string; cycle: string; pay_info: string | null; starts_at: string | null; accounts: number }>(
    `SELECT l.fee, COALESCE(l.currency::text, 'PEN') AS currency, COALESCE(l.cycle::text, 'mensual') AS cycle, l.pay_info, to_char(l.starts_at, 'YYYY-MM-DD') AS starts_at,
       (SELECT COUNT(*) FROM users u JOIN companies c ON c.id = u.company_id WHERE COALESCE(c.parent_id, c.id) = r.id)::int AS accounts
     FROM companies r LEFT JOIN licenses l ON l.company_id = r.id WHERE r.id = ?`, [lic.companyId]);
  return NextResponse.json({
    license: { ...lic, fee: b?.fee === null || b?.fee === undefined ? null : Number(b.fee), currency: b?.currency ?? "PEN", cycle: b?.cycle ?? "mensual", payInfo: b?.pay_info ?? null, startsAt: b?.starts_at ?? null, accounts: Number(b?.accounts ?? 0) },
    payments: await paymentsOf(lic.companyId!),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const { s, err } = await guard(["admin"]);
  if (err) return err;
  const lic = await company(s.id);
  if (!lic) return NextResponse.json({ error: "Tu cuenta no pertenece a una empresa" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (b.action !== "report") return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  const paidOn = String(b.paidOn ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return NextResponse.json({ error: "Indica la fecha del pago" }, { status: 400 });
  const method = String(b.method ?? "").trim().slice(0, 40);
  if (!method) return NextResponse.json({ error: "Indica cómo pagaste" }, { status: 400 });
  const reference = String(b.reference ?? "").trim().slice(0, 60) || null;
  const note = String(b.note ?? "").trim().slice(0, 300) || null;
  const [p] = await query<{ id: number; period: string; amount: number; currency: string; status: string }>(
    "SELECT id, period::text AS period, amount, currency::text AS currency, status::text AS status FROM license_payments WHERE id = ? AND company_id = ?",
    [Number(b.paymentId), lic.companyId]);
  if (!p) return NextResponse.json({ error: "Ese cobro no existe" }, { status: 404 });
  if (p.status !== "pendiente") return NextResponse.json({ error: p.status === "pagado" ? "Ese pago ya está confirmado" : "Ese pago ya fue avisado" }, { status: 409 });
  await query(`UPDATE license_payments SET status = 'reportado', paid_on = ?::date, method = ?, reference = ?, report_note = ?, reported_by = ?, reported_at = LOCALTIMESTAMP(0)
               WHERE id = ?`, [paidOn, method, reference, note, s.id, p.id]);
  await query("INSERT INTO license_events (company_id, action, detail, user_id) VALUES (?, 'pago', ?, ?)",
    [lic.companyId, `Avisó el pago de ${p.period} (${method}${reference ? ` · op. ${reference}` : ""})`, s.id]);
  pushLater(() => notifyReported(lic.company ?? "La empresa", { period: p.period, amount: Number(p.amount), currency: p.currency, reference }));
  return NextResponse.json({ ok: true });
}
