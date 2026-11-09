import { query } from "./db";
import { devIds, pushToUsers } from "./push";

/**
 * Pagos de la licencia de cada empresa (transportista).
 * The Iceberg Labs crea cada cobro → la empresa avisa «Ya pagué» → The Iceberg Labs confirma.
 * Un cobro pendiente cuya fecha ya pasó se muestra como «vencido».
 */

export type Payment = {
  id: number; company_id: number; period: string; amount: number; currency: "PEN" | "USD"; due_on: string;
  status: "pendiente" | "reportado" | "pagado" | "anulado"; overdue: boolean; days: number;
  paid_on: string | null; method: string | null; reference: string | null; report_note: string | null; note: string | null;
  reported_by: string | null; reported_at: string | null; confirmed_by: string | null; confirmed_at: string | null; created_at: string;
};

export const money = (amount: number, currency: string) =>
  `${currency === "USD" ? "US$" : "S/"} ${Number(amount).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function paymentsOf(companyId: number, limit = 36) {
  const rows = await query<Payment>(
    `SELECT p.id, p.company_id, p.period::text AS period, p.amount, p.currency::text AS currency, to_char(p.due_on, 'YYYY-MM-DD') AS due_on,
       p.status::text AS status, (p.status = 'pendiente' AND p.due_on < CURRENT_DATE) AS overdue, (p.due_on - CURRENT_DATE)::int AS days,
       to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on, p.method::text AS method, p.reference::text AS reference, p.report_note, p.note,
       rb.name::text AS reported_by, to_char(p.reported_at, 'YYYY-MM-DD HH24:MI') AS reported_at,
       cb.name::text AS confirmed_by, to_char(p.confirmed_at, 'YYYY-MM-DD HH24:MI') AS confirmed_at,
       to_char(p.created_at, 'YYYY-MM-DD') AS created_at
     FROM license_payments p LEFT JOIN users rb ON rb.id = p.reported_by LEFT JOIN users cb ON cb.id = p.confirmed_by
     WHERE p.company_id = ? ORDER BY (p.status IN ('pendiente', 'reportado')) DESC, p.due_on DESC, p.id DESC LIMIT ?`,
    [companyId, limit]);
  return rows.map((r) => ({ ...r, amount: Number(r.amount), overdue: !!Number(r.overdue) || r.overdue === true, days: Number(r.days) }));
}

/** Supervisores de la empresa dueña de la licencia (los que ven «Licencia y pagos») */
export async function companyAdmins(companyId: number) {
  return (await query<{ id: number }>(
    `SELECT u.id FROM users u JOIN companies c ON c.id = u.company_id
     WHERE u.role = 'admin' AND u.suspended_at IS NULL AND COALESCE(c.parent_id, c.id) = ?`, [companyId])).map((r) => r.id);
}

const date = (d: string) => d.split("-").reverse().join("/");

export async function notifyCharge(companyId: number, p: { period: string; amount: number; currency: string; due_on: string }) {
  await pushToUsers(await companyAdmins(companyId), {
    title: "Nuevo cobro de la licencia",
    body: `${p.period}: ${money(p.amount, p.currency)}. Vence el ${date(p.due_on)}.`,
    url: "/licencia", tag: "licencia",
  }, "licencia");
}

export async function notifyConfirmed(companyId: number, p: { period: string; amount: number; currency: string }) {
  await pushToUsers(await companyAdmins(companyId), {
    title: "Pago de licencia confirmado",
    body: `${p.period}: ${money(p.amount, p.currency)}. ¡Gracias!`,
    url: "/licencia", tag: "licencia",
  }, "licencia");
}

export async function notifyReported(company: string, p: { period: string; amount: number; currency: string; reference: string | null }) {
  await pushToUsers(await devIds(), {
    title: `${company} avisó un pago`,
    body: `${p.period}: ${money(p.amount, p.currency)}${p.reference ? ` · op. ${p.reference}` : ""}. Revísalo y confírmalo.`,
    url: "/dev/licenses", tag: "licencia-pago",
  }, "licencia");
}

/** Recordatorio diario: cobros que vencen en 3 días o menos, o ya vencidos (sin avisar pago) */
export async function remindPayments() {
  const due = await query<{ company_id: number; period: string; amount: number; currency: string; due_on: string; days: number }>(
    `SELECT company_id, period::text AS period, amount, currency::text AS currency, to_char(due_on, 'YYYY-MM-DD') AS due_on, (due_on - CURRENT_DATE)::int AS days
     FROM license_payments WHERE status = 'pendiente' AND due_on <= CURRENT_DATE + 3 ORDER BY due_on`);
  let sent = 0;
  for (const p of due) {
    const d = Number(p.days);
    sent += await pushToUsers(await companyAdmins(p.company_id), {
      title: d < 0 ? "Pago de licencia vencido" : d === 0 ? "El pago de la licencia vence hoy" : `El pago de la licencia vence en ${d} ${d === 1 ? "día" : "días"}`,
      body: `${p.period}: ${money(Number(p.amount), p.currency)} (vence el ${date(p.due_on)}). Si ya pagaste, avísalo en Licencia y pagos.`,
      url: "/licencia", tag: "licencia",
    }, "licencia");
  }
  return sent;
}
