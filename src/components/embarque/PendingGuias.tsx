"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@heroui/react";
import { AlertTriangle, Check, ChevronDown, FileStack, Inbox, Plus, Search, Trash2 } from "lucide-react";
import { Mix, n, plural } from "@/components/stage/StageKit";
import { Card } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DATA_EVENT } from "@/components/UploadCenter";
import { fmtDate, type Site } from "@/lib/hsp";
import { daysBetween, parseISO, todayLima } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Row = {
  guia: string; district: string | null; dealer: string | null; w2: number; w3: number; total: number; billing: string | null; est: string | null;
  overdue: number; models: string | null; flags: string[];
};


/**
 * Guías pendientes de embarque (en IQT-Port): el detalle de cada una para armar los contenedores,
 * con aviso si parece duplicada (ya avanzó, está en la otra ruta o repite chasis). La empresa puede eliminar las duplicadas.
 */
export function PendingGuias({ site, inBox, canEmbark, onAdd, onChanged }: {
  site: Site; inBox: string[]; canEmbark: boolean; onAdd: (guia: string) => void; onChanged: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [canDelete, setCanDelete] = useState(false);
  const [q, setQ] = useState("");
  const [onlyDup, setOnlyDup] = useState(false);
  const [open, setOpen] = useState(true);
  const [ask, setAsk] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/embarque?${new URLSearchParams({ site, pending: "1" })}`).then((r) => r.json()).then((j) => { setRows(j.rows ?? []); setCanDelete(!!j.canDelete); });
  }, [site]);
  useEffect(() => {
    load();
    window.addEventListener(DATA_EVENT, load);
    return () => window.removeEventListener(DATA_EVENT, load);
  }, [load]);

  async function remove(r: Row) {
    setBusy(true);
    const res = await fetch("/api/embarque", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete-guia", site, guia: r.guia }) });
    const j = await res.json().catch(() => ({ error: "Error del servidor" }));
    setBusy(false); setAsk(null);
    if (!res.ok) return toast.danger(j.error);
    toast.success(`Guía ${r.guia} eliminada`, { description: `${n(j.units)} unidades pendientes borradas` });
    load(); onChanged();
  }

  const terms = q.trim().toLowerCase().split(/[\s,;]+/).filter(Boolean);
  const dups = (rows ?? []).filter((r) => r.flags.length);
  const shown = (rows ?? []).filter((r) => (!onlyDup || r.flags.length) && (!terms.length || terms.some((t) => [r.guia, r.dealer, r.district, r.models].some((x) => (x ?? "").toLowerCase().includes(t)))));
  const today = todayLima();

  const totals = (rows ?? []).reduce((t, r) => ({ w2: t.w2 + Number(r.w2), w3: t.w3 + Number(r.w3), total: t.total + Number(r.total) }), { w2: 0, w3: 0, total: 0 });
  const lateCount = (rows ?? []).filter((r) => r.overdue > 0).length;
  const where = site === "YUR" ? "En la chata" : "En el contenedor";

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className={cn("flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-sb-surface-container-low/60", open && "border-b border-sb-outline-variant/40")}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sb-primary-soft text-sb-primary"><FileStack className="h-[18px] w-[18px]" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">Guías pendientes de embarque
            {dups.length > 0 && <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3 w-3" />{plural(dups.length, ["posible duplicada", "posibles duplicadas"])}</span>}
          </span>
          <span className="block text-[11px] text-sb-on-surface-variant sm:truncate">
            {rows ? `${plural(rows.length, ["guía", "guías"])} · ${n(totals.total)} motos en IQT-Port${lateCount ? ` · ${n(lateCount)} vencidas` : ""}` : "Cargando…"}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-sb-on-surface-variant transition-transform duration-300", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            <div className="flex max-w-full overflow-x-auto rounded-full bg-sb-surface-container p-0.5">
              {([[false, "Todas", rows?.length ?? 0], [true, "Posibles duplicadas", dups.length]] as const).map(([k, l, c]) => (
                <button key={l} type="button" onClick={() => setOnlyDup(k)} aria-pressed={onlyDup === k}
                  className={cn("flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold transition-colors duration-200",
                    onlyDup === k ? "bg-sb-surface text-sb-on-surface shadow-sm" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
                  {k && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}{l}<span className="tabular-nums opacity-60">{n(c)}</span>
                </button>
              ))}
            </div>
            <label className="relative min-w-0 basis-full sm:ml-auto sm:w-80 sm:basis-auto">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sb-on-surface-variant" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Guía, dealer, distrito o modelo"
                className="h-10 w-full rounded-full border border-sb-outline-variant bg-sb-surface pl-9 pr-3 text-sm outline-none transition-colors focus:border-sb-on-surface" />
            </label>
          </div>
          <div className="max-h-[30rem] overflow-y-auto overscroll-contain p-2 sm:p-3">
            <div className="flex flex-col gap-0.5">
              {!rows && [0, 1, 2].map((i) => <div key={i} className="h-[62px] animate-pulse rounded-xl bg-sb-surface-container-low" />)}
              {rows && !shown.length && (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-sb-outline-variant/60 px-4 py-10 text-center text-xs text-sb-on-surface-variant">
                  <Inbox className="h-5 w-5 opacity-50" />{rows.length ? "Ninguna guía coincide con la búsqueda." : "No hay guías pendientes de embarque."}
                </div>
              )}
              {shown.map((r) => {
                const late = r.overdue > 0, added = inBox.includes(r.guia), dup = r.flags.length > 0;
                const left = r.est ? daysBetween(today, parseISO(String(r.est).slice(0, 10))) : null;
                return (
                  <div key={r.guia} className={cn("rounded-xl px-3 py-3 transition-colors duration-200",
                    added ? "bg-sb-primary-soft" : dup ? "bg-amber-500/10" : "hover:bg-sb-surface-container-low")}>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_9rem_7rem_3.5rem_8.5rem]">
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-mono text-sm font-semibold tracking-tight">
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dup ? "bg-amber-500" : late ? "bg-sb-late" : "bg-sb-ontime")} />{r.guia}
                        </span>
                        <span className="block truncate text-[11px] text-sb-on-surface-variant" title={r.dealer ?? ""}>{r.district ?? "—"} · {r.dealer ?? "—"}</span>
                      </span>
                      <span className="hidden min-w-0 text-[11px] text-sb-on-surface-variant lg:block">
                        <span className="block truncate text-xs text-sb-on-surface" title={r.models ?? ""}>{r.models ?? "—"}</span>
                        <span className="block">Facturada {fmtDate(r.billing) || "—"}</span>
                      </span>
                      <span className="order-3 lg:order-none">
                        {left !== null ? (
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", late ? "bg-sb-late-soft text-sb-late" : "bg-sb-ontime-soft text-sb-ontime")}>
                            {late ? `Vencida hace ${-left} d` : left === 0 ? "Vence hoy" : `Quedan ${left} d`}
                          </span>
                        ) : <span className="text-[11px] text-sb-on-surface-variant">Sin plazo</span>}
                      </span>
                      <span className="hidden lg:block"><Mix w2={r.w2} w3={r.w3} /></span>
                      <span className="text-right">
                        <span className="block text-sm font-semibold tabular-nums">{n(r.total)}</span>
                        <span className="block text-[10px] text-sb-on-surface-variant">motos</span>
                      </span>
                      <span className="order-4 flex items-center justify-end gap-1 lg:order-none">
                        {added ? <span className="flex items-center gap-1 rounded-full bg-sb-primary px-2.5 py-1 text-[11px] font-semibold text-sb-on-primary"><Check className="h-3 w-3" strokeWidth={3} />{where}</span>
                          : canEmbark && (
                            <button type="button" onClick={() => onAdd(r.guia)}
                              className="flex items-center gap-1 rounded-full bg-sb-surface px-3 py-1.5 text-[11px] font-semibold text-sb-primary shadow-sm ring-1 ring-sb-outline-variant/60 transition-colors hover:bg-sb-primary hover:text-sb-on-primary active:scale-95">
                              <Plus className="h-3.5 w-3.5" /> Agregar
                            </button>
                          )}
                      </span>
                    </div>
                    {dup && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {r.flags.map((f) => <span key={f} className="flex items-center gap-1 rounded-full bg-sb-surface px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3 w-3" />{f}</span>)}
                        {canDelete && <button type="button" onClick={() => setAsk(r)} aria-label={`Eliminar guía ${r.guia}`} className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-sb-late transition-colors hover:bg-sb-late-soft"><Trash2 className="h-3 w-3" /> Eliminar</button>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-sb-outline-variant/30 px-4 py-2 text-[10px] text-sb-on-surface-variant">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sb-ontime" />al día</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sb-late" />lead time vencido</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />posible duplicada{canDelete ? " (puedes eliminarla)" : " (avisa a la empresa para eliminarla)"}</span>
          </p>
        </>
      )}
      <ConfirmDialog open={!!ask} title={`¿Eliminar la guía ${ask?.guia ?? ""}?`} confirmLabel="Sí, eliminar guía" busy={busy} requireText="ELIMINAR"
        onCancel={() => setAsk(null)} onConfirm={() => ask && remove(ask)}>
        Se borran sus <b className="text-sb-on-surface">{ask ? n(ask.total) : 0} unidades pendientes en IQT-Port</b>. Las que ya avanzaron no se tocan. No se puede deshacer: si te equivocas, vuelve a subir el Excel.
        {ask?.flags.length ? <span className="mt-2 block text-[11px]">Motivo: {ask.flags.join(" · ")}.</span> : null}
      </ConfirmDialog>
    </Card>
  );
}
