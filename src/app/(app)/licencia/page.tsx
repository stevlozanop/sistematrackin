"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, toast } from "@heroui/react";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Copy, History, KeyRound, Lock, Receipt, Send, Users, XCircle } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { DatePicker, pastQuick } from "@/components/modal/DatePicker";
import { DATA_EVENT } from "@/components/UploadCenter";
import { fmtDate } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { cn } from "@/lib/cn";

type Payment = {
  id: number; period: string; amount: number; currency: string; due_on: string; status: "pendiente" | "reportado" | "pagado" | "anulado";
  overdue: boolean; days: number; paid_on: string | null; method: string | null; reference: string | null; report_note: string | null; note: string | null;
  reported_by: string | null; reported_at: string | null; confirmed_at: string | null;
};
type Data = {
  license: {
    company: string | null; status: "active" | "suspended" | "expired"; plan: string | null; expiresAt: string | null; daysLeft: number | null;
    maxUsers: number | null; fee: number | null; currency: string; cycle: string; payInfo: string | null; startsAt: string | null; accounts: number;
  };
  payments: Payment[];
};

const money = (n: number, c: string) => `${c === "USD" ? "US$" : "S/"} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const METHODS = ["Transferencia", "Depósito", "Yape", "Plin", "Efectivo", "Otro"];
const field = "h-10 w-full rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-primary";

function chip(p: Payment) {
  if (p.status === "pagado") return { label: "Pagado", icon: CheckCircle2, cls: "bg-sb-ontime-soft text-sb-ontime" };
  if (p.status === "reportado") return { label: "Avisado · por confirmar", icon: Clock, cls: "bg-sb-surface-container-high text-sb-on-surface" };
  if (p.status === "anulado") return { label: "Anulado", icon: XCircle, cls: "bg-sb-surface-container-high text-sb-on-surface-variant" };
  if (p.overdue) return { label: `Vencido hace ${-p.days} ${p.days === -1 ? "día" : "días"}`, icon: AlertTriangle, cls: "bg-sb-late-soft text-sb-late" };
  return { label: p.days === 0 ? "Vence hoy" : `Vence en ${p.days} ${p.days === 1 ? "día" : "días"}`, icon: CalendarClock, cls: p.days <= 3 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-sb-surface-container-high text-sb-on-surface" };
}

/** Avisar «Ya pagué»: fecha, cómo pagó y número de operación */
function ReportForm({ p, onDone }: { p: Payment; onDone: () => void }) {
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("Transferencia");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    const r = await fetch("/api/license/billing", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "report", paymentId: p.id, paidOn: date, method, reference, note }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setBusy(false);
    if (!r.ok) return toast.danger(j.error);
    toast.success("Pago avisado", { description: "The Iceberg Labs lo revisará y te confirmará." });
    onDone();
  }
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-sb-surface-container-low p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Fecha del pago
          <DatePicker label="Fecha del pago" value={date} onChange={setDate} max={today()} quick={pastQuick(null, today())} />
        </div>
        <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">N.° de operación (opcional)
          <input className={field} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} placeholder="Ej. 00123456" />
        </label>
      </div>
      <div className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Cómo pagaste
        <div className="flex flex-wrap gap-1.5">
          {METHODS.map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)} className={cn("sbf-chip", method === m && "active")}>{m}</button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Nota (opcional)
        <input className={field} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ej. pagado desde la cuenta BCP de la empresa" />
      </label>
      <Button variant="primary" className="self-start rounded-full" isDisabled={busy} onPress={send}><Send className="h-4 w-4" /> {busy ? "Avisando…" : "Avisar que ya pagué"}</Button>
    </div>
  );
}

/** Licencia y pagos de la empresa: estado de su licencia del sistema, lo que tiene por pagar, cómo pagar e historial */
export default function LicenciaPage() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const load = useCallback(() => {
    fetch("/api/license/billing", { cache: "no-store" }).then(async (r) => {
      const j = await r.json().catch(() => null);
      if (!r.ok) setError(j?.error ?? "No se pudo cargar"); else setD(j);
    }).catch(() => setError("Sin conexión"));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(DATA_EVENT, load);
    const t = setInterval(load, 30000);
    return () => { window.removeEventListener(DATA_EVENT, load); clearInterval(t); };
  }, [load]);

  if (error) return <div className="p-6 text-sm text-sb-late">{error}</div>;
  if (!d) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  const l = d.license;
  const due = d.payments.filter((p) => p.status === "pendiente" || p.status === "reportado");
  const done = d.payments.filter((p) => p.status === "pagado" || p.status === "anulado");
  const owed = due.filter((p) => p.status === "pendiente");
  const st = l.status === "suspended" ? { label: "Suspendida", icon: Lock, cls: "bg-sb-late-soft text-sb-late" }
    : l.status === "expired" ? { label: "Vencida", icon: XCircle, cls: "bg-sb-late-soft text-sb-late" }
    : l.daysLeft !== null && l.daysLeft <= 15 ? { label: `Vence en ${l.daysLeft} días`, icon: AlertTriangle, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" }
    : { label: "Activa", icon: CheckCircle2, cls: "bg-sb-ontime-soft text-sb-ontime" };

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Licencia y pagos" sub={`La licencia de ${l.company ?? "tu empresa"} para usar System Tracking: lo que tienes por pagar, cómo pagar y tu historial.`} />

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sb-primary text-sb-on-primary"><KeyRound className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{l.company}</p>
              <p className="text-[12px] text-sb-on-surface-variant">Plan {l.plan ?? "Estándar"}{l.fee !== null ? ` · ${money(l.fee, l.currency)} ${l.cycle === "anual" ? "al año" : "al mes"}` : ""}</p>
            </div>
          </div>
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold", st.cls)}><st.icon className="h-3.5 w-3.5" /> {st.label}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div><p className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant">Vence</p><p className="font-semibold">{l.expiresAt ? fmtDate(l.expiresAt) : "Sin vencimiento"}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant">Cuentas</p><p className="flex items-center gap-1 font-semibold"><Users className="h-3.5 w-3.5" />{l.accounts}{l.maxUsers ? ` de ${l.maxUsers}` : " · sin límite"}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant">Por pagar</p><p className={cn("font-semibold", owed.some((p) => p.overdue) && "text-sb-late")}>{owed.length ? owed.map((p) => money(p.amount, p.currency)).join(" + ") : "Nada"}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant">Desde</p><p className="font-semibold">{l.startsAt ? fmtDate(l.startsAt) : "—"}</p></div>
        </div>
        {owed.some((p) => p.overdue) && (
          <p className="flex items-start gap-2 rounded-xl bg-sb-late-soft/60 px-3 py-2 text-[12px]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sb-late" />
            Tienes un pago vencido. Si no se regulariza, The Iceberg Labs puede suspender la licencia y nadie de la empresa (ni sus consorcios y clientes) podrá entrar.</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <h3 className="flex items-center gap-2 border-b border-sb-outline-variant/40 px-4 py-3 text-sm font-semibold"><Receipt className="h-4 w-4" /> Por pagar</h3>
          <div className="flex flex-col">
            {due.map((p) => {
              const c = chip(p);
              return (
                <div key={p.id} className="border-b border-sb-outline-variant/20 px-4 py-3 last:border-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{p.period}</p>
                      <p className="text-[12px] text-sb-on-surface-variant">Vence el {fmtDate(p.due_on)}{p.note ? ` · ${p.note}` : ""}</p>
                    </div>
                    <p className="text-lg font-bold tabular-nums">{money(p.amount, p.currency)}</p>
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", c.cls)}><c.icon className="h-3.5 w-3.5" /> {c.label}</span>
                  </div>
                  {p.status === "reportado" ? (
                    <p className="mt-2 text-[12px] text-sb-on-surface-variant">Avisaste el pago del {p.paid_on ? fmtDate(p.paid_on) : "—"} por {p.method}{p.reference ? ` (op. ${p.reference})` : ""}{p.reported_by ? ` · ${p.reported_by}` : ""}. Te avisaremos cuando se confirme.</p>
                  ) : open === p.id ? (
                    <ReportForm p={p} onDone={() => { setOpen(null); load(); }} />
                  ) : (
                    <Button size="sm" variant="secondary" className="mt-2 rounded-full" onPress={() => setOpen(p.id)}><CheckCircle2 className="h-3.5 w-3.5" /> Ya pagué</Button>
                  )}
                </div>
              );
            })}
            {!due.length && <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-sb-on-surface-variant"><CheckCircle2 className="h-4 w-4 text-sb-ontime" /> Estás al día. No tienes pagos pendientes.</p>}
          </div>
        </Card>

        <Card className="flex flex-col gap-2 p-4">
          <h3 className="text-sm font-semibold">Cómo pagar</h3>
          {l.payInfo ? (
            <>
              <p className="whitespace-pre-wrap rounded-xl bg-sb-surface-container-low px-3 py-2.5 text-[13px] leading-relaxed">{l.payInfo}</p>
              <Button size="sm" variant="ghost" className="self-start rounded-full" onPress={() => navigator.clipboard.writeText(l.payInfo!).then(() => toast.success("Datos copiados"))}><Copy className="h-3.5 w-3.5" /> Copiar datos</Button>
            </>
          ) : <p className="text-[12px] text-sb-on-surface-variant">The Iceberg Labs todavía no registró los datos de pago. Escríbeles para coordinar.</p>}
          <p className="mt-1 text-[11px] text-sb-on-surface-variant">Después de pagar, toca «Ya pagué» en el cobro y pon el número de operación: así lo confirman más rápido.</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <h3 className="flex items-center gap-2 border-b border-sb-outline-variant/40 px-4 py-3 text-sm font-semibold"><History className="h-4 w-4" /> Historial de pagos</h3>
        {done.length ? done.map((p) => {
          const c = chip(p);
          return (
            <div key={p.id} className="flex flex-wrap items-center gap-3 border-b border-sb-outline-variant/20 px-4 py-2.5 text-[13px] last:border-0">
              <span className="min-w-0 flex-1"><b>{p.period}</b><span className="block text-[11px] text-sb-on-surface-variant">{p.status === "pagado" ? `Pagado el ${p.paid_on ? fmtDate(p.paid_on) : "—"}${p.method ? ` · ${p.method}` : ""}${p.reference ? ` · op. ${p.reference}` : ""}` : "Cobro anulado"}</span></span>
              <span className="font-semibold tabular-nums">{money(p.amount, p.currency)}</span>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", c.cls)}><c.icon className="h-3 w-3" /> {c.label}</span>
            </div>
          );
        }) : <p className="px-4 py-6 text-center text-xs text-sb-on-surface-variant">Todavía no hay pagos registrados.</p>}
      </Card>
    </div>
  );
}
