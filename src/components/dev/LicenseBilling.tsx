"use client";
import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { Ban, CheckCircle2, Clock, Plus, Receipt, Settings2, Undo2, XCircle, AlertTriangle, CalendarClock } from "lucide-react";
import { DatePicker } from "@/components/modal/DatePicker";
import { notifyData } from "@/components/UploadCenter";
import { fmtDate } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { cn } from "@/lib/cn";

export type Pay = {
  id: number; period: string; amount: number; currency: string; due_on: string; status: "pendiente" | "reportado" | "pagado" | "anulado";
  overdue: boolean; days: number; paid_on: string | null; method: string | null; reference: string | null; report_note: string | null;
  reported_by: string | null; confirmed_by: string | null;
};
export type Billing = { fee: number | null; currency: string; cycle: string; pay_info: string | null };

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const money = (n: number, c: string) => `${c === "USD" ? "US$" : "S/"} ${Number(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const field = "h-9 w-full rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-primary";

async function send(companyId: number, body: Record<string, unknown>) {
  const r = await fetch("/api/dev/licenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...body }) });
  const j = await r.json().catch(() => ({ error: "Error del servidor" }));
  if (!r.ok) { toast.danger(j.error); return false; }
  notifyData();
  return true;
}

/** Siguiente periodo sugerido: el mes (o año) que sigue al último cobro */
function nextPeriod(list: Pay[], cycle: string) {
  const d = new Date(`${today()}T12:00:00`);
  if (cycle === "anual") return { period: `Año ${d.getFullYear() + (list.some((p) => p.period === `Año ${d.getFullYear()}`) ? 1 : 0)}`, due: today() };
  for (let i = 0; i < 24; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() + i, 1);
    const label = `${MONTHS[m.getMonth()]} ${m.getFullYear()}`;
    if (!list.some((p) => p.period === label && p.status !== "anulado")) {
      const due = new Date(m.getFullYear(), m.getMonth(), Math.min(15, 28));
      return { period: label, due: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}` };
    }
  }
  return { period: "", due: today() };
}

function chip(p: Pay) {
  if (p.status === "pagado") return { label: "Pagado", icon: CheckCircle2, cls: "bg-sb-ontime-soft text-sb-ontime" };
  if (p.status === "reportado") return { label: "Avisado", icon: Clock, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" };
  if (p.status === "anulado") return { label: "Anulado", icon: XCircle, cls: "bg-sb-surface-container-high text-sb-on-surface-variant" };
  if (p.overdue) return { label: `Vencido ${-p.days} d`, icon: AlertTriangle, cls: "bg-sb-late-soft text-sb-late" };
  return { label: `Vence ${fmtDate(p.due_on)}`, icon: CalendarClock, cls: "bg-sb-surface-container-high text-sb-on-surface" };
}

/** Cobros de la licencia de una empresa (consola The Iceberg Labs) */
export function LicenseBilling({ companyId, company, billing, payments }: { companyId: number; company: string; billing: Billing; payments: Pay[] }) {
  const [mode, setMode] = useState<null | "charge" | "setup">(null);
  const [busy, setBusy] = useState(false);
  const sug = nextPeriod(payments, billing.cycle);
  const [charge, setCharge] = useState({ period: sug.period, amount: billing.fee ? String(billing.fee) : "", currency: billing.currency, dueOn: sug.due, note: "" });
  const [setup, setSetup] = useState({ fee: billing.fee === null ? "" : String(billing.fee), currency: billing.currency, cycle: billing.cycle, payInfo: billing.pay_info ?? "" });
  const act = async (body: Record<string, unknown>, ok: string) => { setBusy(true); const r = await send(companyId, body); setBusy(false); if (r) toast.success(ok); return r; };
  const reported = payments.filter((p) => p.status === "reportado").length;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-sb-outline-variant/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold"><Receipt className="h-3.5 w-3.5" /> Pagos</p>
        <span className="text-[11px] text-sb-on-surface-variant">{billing.fee !== null ? `${money(billing.fee, billing.currency)} ${billing.cycle === "anual" ? "al año" : "al mes"}` : "Cuota sin definir"}</span>
        {reported > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">{reported} por confirmar</span>}
        <span className="ml-auto flex gap-1.5">
          <Button size="sm" variant="ghost" className="rounded-full" onPress={() => setMode(mode === "setup" ? null : "setup")}><Settings2 className="h-3.5 w-3.5" /> Cuota y datos</Button>
          <Button size="sm" variant="secondary" className="rounded-full" onPress={() => { setCharge((c) => ({ ...c, period: sug.period, dueOn: sug.due, amount: c.amount || (billing.fee ? String(billing.fee) : "") })); setMode(mode === "charge" ? null : "charge"); }}><Plus className="h-3.5 w-3.5" /> Nuevo cobro</Button>
        </span>
      </div>

      {mode === "setup" && (
        <div className="grid gap-2 rounded-xl bg-sb-surface-container-low p-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Cuota<input className={field} inputMode="decimal" value={setup.fee} onChange={(e) => setSetup({ ...setup, fee: e.target.value })} placeholder="Ej. 500" /></label>
          <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Moneda
            <select className={field} value={setup.currency} onChange={(e) => setSetup({ ...setup, currency: e.target.value })}><option value="PEN">Soles (S/)</option><option value="USD">Dólares (US$)</option></select></label>
          <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Cada
            <select className={field} value={setup.cycle} onChange={(e) => setSetup({ ...setup, cycle: e.target.value })}><option value="mensual">Mes</option><option value="anual">Año</option></select></label>
          <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant sm:col-span-3">Datos para pagar (los verá {company})
            <textarea className={cn(field, "h-24 resize-none py-2")} value={setup.payInfo} onChange={(e) => setSetup({ ...setup, payInfo: e.target.value })} maxLength={1500}
              placeholder={"Ej.\nBCP Soles 191-1234567-0-12 · CCI 002-191-001234567012-34\nYape / Plin: 999 999 999 (The Iceberg Labs)"} /></label>
          <Button size="sm" variant="primary" className="rounded-full sm:col-span-3 sm:justify-self-start" isDisabled={busy}
            onPress={async () => { if (await act({ action: "billing", fee: setup.fee, currency: setup.currency, cycle: setup.cycle, payInfo: setup.payInfo }, "Cuota y datos guardados")) setMode(null); }}>Guardar</Button>
        </div>
      )}

      {mode === "charge" && (
        <div className="grid gap-2 rounded-xl bg-sb-surface-container-low p-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Periodo<input className={field} value={charge.period} onChange={(e) => setCharge({ ...charge, period: e.target.value })} placeholder="Noviembre 2026" /></label>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-[11px] text-sb-on-surface-variant">Monto<input className={field} inputMode="decimal" value={charge.amount} onChange={(e) => setCharge({ ...charge, amount: e.target.value })} /></label>
            <label className="flex w-24 flex-col gap-1 text-[11px] text-sb-on-surface-variant">Moneda
              <select className={field} value={charge.currency} onChange={(e) => setCharge({ ...charge, currency: e.target.value })}><option value="PEN">S/</option><option value="USD">US$</option></select></label>
          </div>
          <div className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Vence<DatePicker label="Vence" value={charge.dueOn} onChange={(v) => setCharge({ ...charge, dueOn: v })} /></div>
          <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Nota (opcional)<input className={field} value={charge.note} onChange={(e) => setCharge({ ...charge, note: e.target.value })} maxLength={300} /></label>
          <p className="text-[11px] text-sb-on-surface-variant sm:col-span-2">A los supervisores de {company} les llega una notificación con el cobro.</p>
          <Button size="sm" variant="primary" className="rounded-full sm:col-span-2 sm:justify-self-start" isDisabled={busy}
            onPress={async () => { if (await act({ action: "charge", ...charge, amount: Number(charge.amount) }, `Cobro de ${charge.period} creado`)) setMode(null); }}>Crear cobro</Button>
        </div>
      )}

      {payments.slice(0, 6).map((p) => {
        const c = chip(p);
        return (
          <div key={p.id} className="flex flex-wrap items-center gap-2 border-t border-sb-outline-variant/20 pt-2 text-[12px]">
            <span className="min-w-0 flex-1">
              <b>{p.period}</b> · {money(p.amount, p.currency)}
              {p.status === "reportado" && <span className="block text-[11px] text-sb-on-surface-variant">Avisó {p.reported_by ?? "la empresa"}: pagó el {p.paid_on ? fmtDate(p.paid_on) : "—"} por {p.method}{p.reference ? ` · op. ${p.reference}` : ""}{p.report_note ? ` · «${p.report_note}»` : ""}</span>}
              {p.status === "pagado" && <span className="block text-[11px] text-sb-on-surface-variant">Pagado el {p.paid_on ? fmtDate(p.paid_on) : "—"}{p.method ? ` · ${p.method}` : ""}{p.confirmed_by ? ` · confirmó ${p.confirmed_by}` : ""}</span>}
            </span>
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", c.cls)}><c.icon className="h-3 w-3" /> {c.label}</span>
            {(p.status === "reportado" || p.status === "pendiente") && (
              <Button size="sm" variant={p.status === "reportado" ? "primary" : "secondary"} className="rounded-full" isDisabled={busy}
                onPress={() => act({ action: "confirm", paymentId: p.id }, `Pago de ${p.period} confirmado`)}><CheckCircle2 className="h-3.5 w-3.5" /> {p.status === "reportado" ? "Confirmar" : "Marcar pagado"}</Button>
            )}
            {p.status === "reportado" && (
              <Button size="sm" variant="ghost" className="rounded-full" isDisabled={busy}
                onPress={() => { const why = window.prompt("¿Por qué no se confirma? (lo verá la empresa)", "No encontramos el pago en la cuenta"); if (why !== null) act({ action: "reject", paymentId: p.id, note: why }, "Pago rechazado: la empresa fue avisada"); }}><Undo2 className="h-3.5 w-3.5" /> No llegó</Button>
            )}
            {p.status === "pendiente" && (
              <Button size="sm" variant="ghost" className="rounded-full" isDisabled={busy}
                onPress={() => { if (window.confirm(`¿Anular el cobro de ${p.period}?`)) act({ action: "void", paymentId: p.id }, "Cobro anulado"); }}><Ban className="h-3.5 w-3.5" /> Anular</Button>
            )}
          </div>
        );
      })}
      {!payments.length && <p className="border-t border-sb-outline-variant/20 pt-2 text-[11px] text-sb-on-surface-variant">Sin cobros todavía. Define la cuota y crea el primero.</p>}
    </div>
  );
}
