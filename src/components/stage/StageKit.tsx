"use client";
import { Button } from "@heroui/react";
import { ArrowRight, Check as CheckIcon, FileText, Inbox, X, type LucideIcon } from "lucide-react";
import { DatePicker, pastQuick } from "@/components/modal/DatePicker";
import { SoftSelect } from "@/components/SoftSelect";
import { DELAY_REASONS } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { cn } from "@/lib/cn";

/**
 * Piezas de las pantallas de etapas (Embarque y zarpe, Arribo e ingreso): encabezado con resumen, lista que se marca
 * fila por fila (marca redonda, barra 2W/3W y total) y el panel de registro (lo marcado, estado → siguiente, fecha,
 * motivo de demora y botón).
 */

export const field = "h-10 w-full rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-on-surface";
export const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");

export type Noun = [string, string];
export const plural = (c: number, [one, many]: Noun) => `${n(c)} ${c === 1 ? one : many}`;

/** Encabezado del paso: ícono, título y un resumen en vivo */
export function Head({ icon: Icon, title, sub }: { icon: LucideIcon; title: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-sb-outline-variant/40 px-4 py-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sb-primary-soft text-sb-primary"><Icon className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold sm:truncate">{title}</h3>
        <p className="text-[11px] text-sb-on-surface-variant sm:truncate">{sub}</p>
      </div>
    </div>
  );
}

/** Motos (2W) y motokares (3W) en una barra fina */
export function Mix({ w2, w3 }: { w2: number; w3: number }) {
  const t = Number(w2) + Number(w3) || 1;
  return (
    <span className="hidden w-28 shrink-0 flex-col gap-1 sm:flex">
      <span className="flex h-1.5 overflow-hidden rounded-full bg-sb-surface-container">
        <span className="bg-sb-primary transition-[width] duration-500" style={{ width: `${(Number(w2) / t) * 100}%` }} />
        <span className="bg-sb-primary/35 transition-[width] duration-500" style={{ width: `${(Number(w3) / t) * 100}%` }} />
      </span>
      <span className="flex justify-between text-[10px] tabular-nums text-sb-on-surface-variant"><span>2W {n(w2)}</span><span>3W {n(w3)}</span></span>
    </span>
  );
}

/** Fila que se marca entera (nave o contenedor): marca redonda, nombre, detalle, mezcla 2W/3W y total */
export function PickRow({ on, disabled, onToggle, title, mono, meta, late, w2, w3, total, label, aside }: {
  on: boolean; disabled: boolean; onToggle: () => void; title: string; mono?: boolean; meta: string; late: number;
  w2: number; w3: number; total: number; label: string; aside?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center rounded-xl transition-colors duration-200", on ? "bg-sb-primary-soft" : !disabled && "hover:bg-sb-surface-container-low")}>
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} disabled={disabled} onClick={onToggle}
      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3 text-left disabled:cursor-default">
      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-all duration-200",
        on ? "scale-105 border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant bg-sb-surface", disabled && "opacity-40")}>
        <CheckIcon className={cn("h-3 w-3 transition-opacity", on ? "opacity-100" : "opacity-0")} strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-semibold", mono && "font-mono tracking-tight")}>{title}</span>
        <span className="block text-[11px] text-sb-on-surface-variant sm:truncate">
          {meta}<span className="sm:hidden"> · 2W {n(w2)} · 3W {n(w3)}</span>{late ? <b className="font-semibold text-sb-late"> · {n(late)} fuera de tiempo</b> : null}
        </span>
      </span>
      <Mix w2={w2} w3={w3} />
      <span className="w-14 shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums">{n(total)}</span>
        <span className="block text-[10px] text-sb-on-surface-variant">motos</span>
      </span>
    </button>
    {aside && <span className="shrink-0 pr-2">{aside}</span>}
    </div>
  );
}

/** Lista con su encabezado («Marcar todos»), vacío explicado y siluetas mientras carga */
export function PickList({ title, allOn = false, onAll, canAll = false, loading, empty, children, all = ["Marcar todos", "Quitar todos"] }: {
  title: React.ReactNode; allOn?: boolean; onAll?: () => void; canAll?: boolean; loading: boolean; empty: React.ReactNode | null; children: React.ReactNode; all?: [string, string];
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pb-2">
        <p className="min-w-0 text-[11px] font-medium text-sb-on-surface-variant sm:truncate">{title}</p>
        {canAll && (
          <button type="button" onClick={onAll} className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-sb-primary transition-colors hover:bg-sb-primary-soft">
            {allOn ? all[1] : all[0]}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {loading
          ? [0, 1, 2].map((i) => <div key={i} className="h-[60px] animate-pulse rounded-xl bg-sb-surface-container-low" />)
          : empty
            ? <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-sb-outline-variant/60 px-4 py-10 text-center text-xs text-sb-on-surface-variant"><Inbox className="h-5 w-5 opacity-50" />{empty}</div>
            : children}
      </div>
    </div>
  );
}

/** Panel de la derecha: lo marcado, el cambio de estado, fecha, motivo de demora y botón */
export function Register({ from, to, label, noun, date, setDate, min, need, reason, setReason, count, units, busy, disabled, readOnly, onSave, title = "Marcado", hint, action, readOnlyText = "Solo lectura: no es tu etapa.", children }: {
  from: string; to: string; label: string; noun: Noun; date: string; setDate: (v: string) => void; min: string; need: number;
  reason: string; setReason: (v: string) => void; count: number; units: number; busy: boolean; disabled: boolean; readOnly: boolean; onSave: () => void;
  title?: string; hint?: string; readOnlyText?: string; children?: React.ReactNode; action?: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-sb-surface-container-low p-4 lg:sticky lg:top-4 lg:self-start">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">{title}</p>
        <p className="mt-1 text-3xl font-semibold leading-none tabular-nums">{n(units)}<span className="ml-1.5 text-sm font-normal text-sb-on-surface-variant">motos</span></p>
        <p className="mt-1.5 text-xs text-sb-on-surface-variant">{count ? `en ${plural(count, noun)}` : hint ?? `Marca ${noun[1]} en la lista`}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
        <span className="rounded-full border border-sb-outline-variant px-2.5 py-1 text-sb-on-surface-variant">{from}</span>
        <ArrowRight className="h-3.5 w-3.5 text-sb-on-surface-variant" />
        <span className="rounded-full bg-sb-primary px-2.5 py-1 text-sb-on-primary">{to}</span>
      </div>
      {children}
      <div className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Fecha de {label.toLowerCase()}
        <DatePicker label={`Fecha de ${label.toLowerCase()}`} value={date} min={min || null} onChange={setDate} disabled={readOnly} quick={pastQuick(min || null, today())} />
      </div>
      {need > 0 && (
        <label className="flex flex-col gap-1 rounded-xl bg-sb-late-soft p-2.5 text-[11px] text-sb-late">
          <span><b>{n(need)} fuera de tiempo.</b> Motivo de demora (puedes dejarlo para después)</span>
          <SoftSelect className={field} value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Elegir…</option>{DELAY_REASONS.map((r) => <option key={r}>{r}</option>)}</SoftSelect>
        </label>
      )}
      <Button variant="primary" className="w-full rounded-full" onPress={onSave} isDisabled={busy || disabled || readOnly}>
        {busy ? "Registrando…" : action ?? `Registrar ${label.toLowerCase()}`}
      </Button>
      {readOnly && <p className="-mt-2 text-center text-[11px] text-sb-on-surface-variant">{readOnlyText}</p>}
    </div>
  );
}


/** Guía agregada a un contenedor o a un viaje: ícono, código, distrito · dealer, atraso, barra 2W/3W, total y quitar */
export function GuiaRow({ guia, district, dealer, w2, w3, total, late, onRemove }: {
  guia: string; district: string | null; dealer: string | null; w2: number; w3: number; total: number; late: number; onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-sb-surface-container-low">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sb-surface-container text-sb-on-surface-variant"><FileText className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-sm font-semibold tracking-tight">{guia}</span>
        <span className="block text-[11px] text-sb-on-surface-variant sm:truncate" title={dealer ?? ""}>
          {district || "—"} · {dealer || "—"}<span className="sm:hidden"> · 2W {n(w2)} · 3W {n(w3)}</span>
          {late ? <b className="font-semibold text-sb-late"> · {n(late)} fuera de tiempo</b> : null}
        </span>
      </span>
      <Mix w2={w2} w3={w3} />
      <span className="w-12 shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums">{n(total)}</span>
        <span className="block text-[10px] text-sb-on-surface-variant">motos</span>
      </span>
      <button type="button" onClick={onRemove} aria-label={`Quitar ${guia}`}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sb-on-surface-variant transition-colors hover:bg-sb-late-soft hover:text-sb-late"><X className="h-4 w-4" /></button>
    </div>
  );
}

/** Fila de total debajo de las guías */
export function TotalRow({ label, count, w2, w3, total }: { label: string; count: number; w2: number; w3: number; total: number }) {
  return (
    <div className="mt-1 flex items-center gap-3 rounded-xl bg-sb-surface-container-low px-3 py-2.5">
      <span className="min-w-0 flex-1 text-xs font-semibold">{label}<span className="block text-[11px] font-normal text-sb-on-surface-variant">{plural(count, ["guía", "guías"])}</span></span>
      <Mix w2={w2} w3={w3} />
      <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">{n(total)}</span>
      <span className="w-8 shrink-0" />
    </div>
  );
}

/** Chips para elegir rápido un valor ya usado (naves, choferes) */
export function QuickChips({ items, value, onPick, icon: Icon, max = 6 }: { items: string[]; value: string; onPick: (v: string) => void; icon: LucideIcon; max?: number }) {
  if (!items.length) return null;
  return (
    <div className="-mt-2 flex flex-wrap gap-1.5">
      {items.slice(0, max).map((v) => {
        const on = value.toUpperCase() === v.toUpperCase();
        return (
          <button key={v} type="button" onClick={() => onPick(v)} aria-pressed={on}
            className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              on ? "bg-sb-primary text-sb-on-primary" : "bg-sb-surface text-sb-on-surface-variant hover:text-sb-on-surface")}>
            <Icon className="h-3 w-3" />{v}
          </button>
        );
      })}
    </div>
  );
}
