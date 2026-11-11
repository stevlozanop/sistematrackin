"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, toast } from "@heroui/react";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Copy, History, Info, KeyRound, Lock, Receipt, Send, ShieldCheck, Users, Wallet, XCircle } from "lucide-react";
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

  const overdue = owed.some((p) => p.overdue);
  const totalOwed = owed.reduce((t, p) => t + p.amount, 0);
  const paidCount = done.filter((p) => p.status === "pagado").length;
  const usage = l.maxUsers ? Math.min(1, l.accounts / l.maxUsers) : null;
  const headline = l.status === "suspended" ? "Tu licencia está suspendida" : l.status === "expired" ? "Tu licencia venció"
    : owed.length ? (overdue ? "Tienes un pago vencido" : "Tienes un pago pendiente") : "Todo en orden";
  const detail = l.status === "suspended" ? "Nadie de la empresa puede entrar hasta que The Iceberg Labs la reactive."
    : l.status === "expired" ? "Comunícate con The Iceberg Labs para renovarla."
    : owed.length ? `${money(totalOwed, owed[0].currency)} por pagar${overdue ? " · regularízalo para evitar la suspensión" : ""}.`
    : `La licencia está activa${l.expiresAt ? ` hasta el ${fmtDate(l.expiresAt)}` : " y no vence"}. No tienes pagos pendientes.`;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Licencia y pagos" sub={`La licencia de ${l.company ?? "tu empresa"} para usar System Tracking: lo que tienes por pagar, cómo pagar y tu historial.`} />

      {/* Resumen de la licencia */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sb-primary-soft text-sb-primary"><KeyRound className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[17px] font-semibold tracking-tight">
              {l.company}
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", st.cls)}><st.icon className="h-3.5 w-3.5" /> {st.label}</span>
            </p>
            <p className="text-[12.5px] text-sb-on-surface-variant">Plan {l.plan ?? "Estándar"}{l.fee !== null ? ` · ${money(l.fee, l.currency)} ${l.cycle === "anual" ? "al año" : "al mes"}` : ""}</p>
          </div>
          <div className={cn("flex items-center gap-2.5 rounded-2xl px-4 py-2.5", l.status !== "active" || overdue ? "bg-sb-late-soft/60" : owed.length ? "bg-amber-500/10" : "bg-sb-ontime-soft/60")}>
            {l.status !== "active" || overdue ? <AlertTriangle className="h-5 w-5 shrink-0 text-sb-late" /> : owed.length ? <Clock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" /> : <ShieldCheck className="h-5 w-5 shrink-0 text-sb-ontime" />}
            <span className="flex flex-col leading-tight">
              <b className="text-[13px]">{headline}</b>
              <span className="max-w-[22rem] text-[11.5px] text-sb-on-surface-variant">{detail}</span>
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-sb-outline-variant/50 bg-sb-outline-variant/50 lg:grid-cols-4">
          <Stat icon={CalendarClock} label="Vencimiento" value={l.expiresAt ? fmtDate(l.expiresAt) : "Sin vencimiento"}
            hint={l.expiresAt && l.daysLeft !== null ? (l.daysLeft >= 0 ? `Quedan ${l.daysLeft} ${l.daysLeft === 1 ? "día" : "días"}` : "Ya venció") : "Licencia indefinida"} />
          <Stat icon={Users} label="Cuentas" value={`${l.accounts}${l.maxUsers ? ` de ${l.maxUsers}` : ""}`} hint={l.maxUsers ? `${Math.round((usage ?? 0) * 100)}% del cupo` : "Sin límite de cuentas"}>
            {usage !== null && <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-sb-surface-container-high"><span className={cn("block h-full rounded-full", usage >= 0.9 ? "bg-sb-late" : "bg-sb-primary")} style={{ width: `${usage * 100}%` }} /></span>}
          </Stat>
          <Stat icon={Receipt} label="Por pagar" value={owed.length ? money(totalOwed, owed[0].currency) : "Nada"} tone={overdue ? "late" : undefined}
            hint={owed.length ? `${owed.length} ${owed.length === 1 ? "cobro" : "cobros"}${overdue ? " · vencido" : ""}` : "Estás al día"} />
          <Stat icon={History} label="Cliente desde" value={l.startsAt ? fmtDate(l.startsAt) : "—"} hint={`${paidCount} ${paidCount === 1 ? "pago registrado" : "pagos registrados"}`} />
        </div>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Por pagar */}
        <Card className="overflow-hidden">
          <SectionHead icon={Receipt} title="Por pagar" count={due.length} />
          {due.length ? due.map((p) => {
            const c = chip(p);
            return (
              <div key={p.id} className="border-t border-sb-outline-variant/40 px-5 py-4 first:border-0">
                <div className="flex flex-wrap items-center gap-4">
                  <DateBlock date={p.due_on} late={p.overdue && p.status === "pendiente"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold">{p.period}</p>
                    <p className="text-[12px] text-sb-on-surface-variant">Vence el {fmtDate(p.due_on)}{p.note ? ` · ${p.note}` : ""}</p>
                    <span className={cn("mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold", c.cls)}><c.icon className="h-3.5 w-3.5" /> {c.label}</span>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="text-xl font-bold tabular-nums tracking-tight">{money(p.amount, p.currency)}</p>
                    {p.status === "pendiente" && open !== p.id && (
                      <Button size="sm" variant="primary" className="rounded-full" onPress={() => setOpen(p.id)}><CheckCircle2 className="h-3.5 w-3.5" /> Ya pagué</Button>
                    )}
                  </div>
                </div>
                {p.status === "reportado" ? (
                  <p className="mt-3 rounded-xl bg-sb-surface-container-low px-3 py-2 text-[12px] text-sb-on-surface-variant">Avisaste el pago del {p.paid_on ? fmtDate(p.paid_on) : "—"} por {p.method}{p.reference ? ` (op. ${p.reference})` : ""}{p.reported_by ? ` · ${p.reported_by}` : ""}. Te avisaremos cuando se confirme.</p>
                ) : open === p.id ? (
                  <ReportForm p={p} onDone={() => { setOpen(null); load(); }} />
                ) : null}
              </div>
            );
          }) : (
            <Empty icon={CheckCircle2} tone="ok" title="Estás al día" text="No tienes pagos pendientes. Cuando The Iceberg Labs registre un cobro, aparecerá aquí y te llegará un aviso." />
          )}
        </Card>

        {/* Cómo pagar */}
        <Card className="flex flex-col overflow-hidden">
          <SectionHead icon={Wallet} title="Cómo pagar" />
          <div className="flex flex-col gap-4 px-5 pb-5">
            {l.payInfo ? (
              <div className="rounded-2xl bg-sb-surface-container-low p-3.5">
                <p className="text-[11px] font-medium text-sb-on-surface-variant">Datos de pago</p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{l.payInfo}</p>
                <Button size="sm" variant="tertiary" className="mt-2 rounded-full" onPress={() => navigator.clipboard.writeText(l.payInfo!).then(() => toast.success("Datos copiados"))}><Copy className="h-3.5 w-3.5" /> Copiar datos</Button>
              </div>
            ) : (
              <p className="flex items-start gap-2 rounded-2xl bg-sb-surface-container-low px-3.5 py-3 text-[12.5px] text-sb-on-surface-variant">
                <Info className="mt-0.5 h-4 w-4 shrink-0" /> The Iceberg Labs todavía no registró los datos de pago. Escríbeles para coordinar.
              </p>
            )}
            <ol className="flex flex-col">
              {[
                ["Paga", "Con los datos de arriba: transferencia, depósito, Yape o Plin."],
                ["Avisa", "Toca «Ya pagué» en el cobro y pon el número de operación."],
                ["Listo", "The Iceberg Labs confirma el pago y pasa a tu historial."],
              ].map(([t, d], i, all) => (
                <li key={t} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < all.length - 1 && <span className="absolute left-[11px] top-7 h-[calc(100%-1.75rem)] w-px bg-sb-outline-variant" />}
                  <span className="z-[1] grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sb-surface-container-high text-[11px] font-bold">{i + 1}</span>
                  <span className="flex flex-col leading-snug"><b className="text-[13px]">{t}</b><span className="text-[12px] text-sb-on-surface-variant">{d}</span></span>
                </li>
              ))}
            </ol>
          </div>
        </Card>
      </div>

      {/* Historial */}
      <Card className="overflow-hidden">
        <SectionHead icon={History} title="Historial de pagos" count={done.length} />
        {done.length ? done.map((p) => {
          const c = chip(p);
          return (
            <div key={p.id} className="flex flex-wrap items-center gap-4 border-t border-sb-outline-variant/40 px-5 py-3 first:border-0">
              <DateBlock date={p.paid_on ?? p.due_on} muted={p.status === "anulado"} />
              <span className="min-w-0 flex-1">
                <b className="text-[13.5px]">{p.period}</b>
                <span className="block text-[12px] text-sb-on-surface-variant">{p.status === "pagado" ? `Pagado el ${p.paid_on ? fmtDate(p.paid_on) : "—"}${p.method ? ` · ${p.method}` : ""}${p.reference ? ` · op. ${p.reference}` : ""}` : "Cobro anulado"}</span>
              </span>
              <span className={cn("text-[15px] font-semibold tabular-nums", p.status === "anulado" && "text-sb-on-surface-variant line-through")}>{money(p.amount, p.currency)}</span>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", c.cls)}><c.icon className="h-3.5 w-3.5" /> {c.label}</span>
            </div>
          );
        }) : (
          <Empty icon={History} title="Todavía no hay pagos" text="Aquí verás cada pago confirmado con su fecha, forma de pago y número de operación." />
        )}
      </Card>
    </div>
  );
}

/** Dato del resumen: ícono, título, valor y una línea de detalle */
function Stat({ icon: Icon, label, value, hint, tone, children }: { icon: typeof Users; label: string; value: string; hint?: string; tone?: "late"; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 bg-sb-surface px-5 py-4">
      <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-sb-on-surface-variant"><Icon className="h-3.5 w-3.5" /> {label}</span>
      <b className={cn("text-[16px] tracking-tight tabular-nums", tone === "late" && "text-sb-late")}>{value}</b>
      {hint && <span className="text-[11px] text-sb-on-surface-variant">{hint}</span>}
      {children}
    </div>
  );
}

const SectionHead = ({ icon: Icon, title, count }: { icon: typeof Users; title: string; count?: number }) => (
  <div className="flex items-center gap-2 px-5 pb-3 pt-4">
    <span className="grid h-8 w-8 place-items-center rounded-xl bg-sb-surface-container"><Icon className="h-4 w-4" /></span>
    <h3 className="text-[14px] font-semibold">{title}</h3>
    {count !== undefined && count > 0 && <span className="rounded-full bg-sb-surface-container px-2 py-0.5 text-[11px] font-semibold tabular-nums text-sb-on-surface-variant">{count}</span>}
  </div>
);

/** Fecha en bloque (día grande y mes): para ubicar cada cobro de un vistazo */
function DateBlock({ date, late, muted }: { date: string; late?: boolean; muted?: boolean }) {
  const d = new Date(`${String(date).slice(0, 10)}T12:00:00`);
  const mes = d.toLocaleDateString("es-PE", { month: "short" }).replace(".", "");
  return (
    <span className={cn("flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl leading-none",
      late ? "bg-sb-late-soft text-sb-late" : muted ? "bg-sb-surface-container text-sb-on-surface-variant" : "bg-sb-surface-container-low")}>
      <b className="text-[17px] tabular-nums">{d.getDate()}</b>
      <span className="mt-0.5 text-[10px] font-medium uppercase">{mes}</span>
    </span>
  );
}

/** Vacío con ícono suave, título y una línea que explica qué aparecerá */
const Empty = ({ icon: Icon, title, text, tone }: { icon: typeof Users; title: string; text: string; tone?: "ok" }) => (
  <div className="flex flex-col items-center gap-2 px-6 pb-8 pt-4 text-center">
    <span className={cn("grid h-12 w-12 place-items-center rounded-full", tone === "ok" ? "bg-sb-ontime-soft text-sb-ontime" : "bg-sb-surface-container text-sb-on-surface-variant")}><Icon className="h-5 w-5" /></span>
    <b className="text-[14px]">{title}</b>
    <p className="max-w-sm text-[12.5px] text-sb-on-surface-variant">{text}</p>
  </div>
);
