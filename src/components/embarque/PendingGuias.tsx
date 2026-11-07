"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@heroui/react";
import { AlertTriangle, ChevronDown, FileStack, Plus, Search, Trash2 } from "lucide-react";
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

const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");

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
  const total = (rows ?? []).reduce((t, r) => t + r.total, 0);

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-2 border-b border-sb-outline-variant/40 px-4 py-3 text-left">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><FileStack className="h-4 w-4" /> Guías pendientes de embarque</h3>
        <span className="text-[11px] text-sb-on-surface-variant">{rows ? `${n(rows.length)} guías · ${n(total)} motos en IQT-Port` : "Cargando…"}</span>
        {dups.length > 0 && <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3 w-3" />{dups.length} posible(s) duplicada(s)</span>}
        <ChevronDown className={cn("ml-auto h-4 w-4 text-sb-on-surface-variant transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <label className="relative min-w-[12rem] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sb-on-surface-variant" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar guía, dealer, distrito o modelo"
                className="h-10 w-full rounded-xl border border-sb-outline-variant bg-sb-surface pl-9 pr-3 text-sm outline-none focus:border-sb-on-surface" />
            </label>
            <div className="flex rounded-full bg-sb-surface-container p-0.5">
              <button type="button" onClick={() => setOnlyDup(false)} className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", !onlyDup ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant")}>Todas</button>
              <button type="button" onClick={() => setOnlyDup(true)} className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", onlyDup ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant")}>Posibles duplicadas ({dups.length})</button>
            </div>
          </div>
          <div className="max-h-[28rem] overflow-auto border-t border-sb-outline-variant/30">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-sb-surface">
                <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant">
                  <th className="px-4 py-2 font-semibold">Guía R.</th><th className="px-2 py-2 font-semibold">Distrito</th><th className="px-2 py-2 font-semibold">Dealer</th>
                  <th className="px-2 py-2 font-semibold">Modelos</th><th className="px-2 py-2 text-right font-semibold">2W</th><th className="px-2 py-2 text-right font-semibold">3W</th>
                  <th className="px-2 py-2 text-right font-semibold">Total</th><th className="px-2 py-2 font-semibold">Facturada</th><th className="px-2 py-2 font-semibold">Lead time</th>
                  <th className="px-4 py-2 text-right font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const late = r.overdue > 0, added = inBox.includes(r.guia);
                  const left = r.est ? daysBetween(today, parseISO(String(r.est).slice(0, 10))) : null;
                  return [
                    <tr key={r.guia} className={cn("border-b border-sb-outline-variant/15", r.flags.length > 0 && "bg-amber-500/10", added && "bg-sb-primary-soft")}>
                      <td className={cn("px-4 py-2.5 font-mono font-semibold", late ? "text-sb-late" : "text-sb-ontime")}>{r.guia}</td>
                      <td className="px-2 py-2.5">{r.district ?? "—"}</td>
                      <td className="max-w-[14rem] truncate px-2 py-2.5" title={r.dealer ?? ""}>{r.dealer ?? "—"}</td>
                      <td className="max-w-[9rem] truncate px-2 py-2.5 text-sb-on-surface-variant" title={r.models ?? ""}>{r.models ?? "—"}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.w2 || ""}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.w3 || ""}</td>
                      <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{n(r.total)}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap">{fmtDate(r.billing) || "—"}</td>
                      <td className={cn("px-2 py-2.5 whitespace-nowrap", late ? "text-sb-late" : "text-sb-ontime")}>
                        {left === null ? "—" : late ? <b>Vencida hace {-left} d</b> : <b>{left === 0 ? "Vence hoy" : `Quedan ${left} d`}</b>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center justify-end gap-1">
                          {added ? <span className="rounded-full bg-sb-primary px-2 py-0.5 text-[10px] font-semibold text-sb-on-primary">En el contenedor</span>
                            : canEmbark && <button type="button" onClick={() => onAdd(r.guia)} className="flex items-center gap-1 rounded-full border border-sb-outline-variant px-2.5 py-1 text-[11px] font-medium hover:border-sb-primary hover:text-sb-primary"><Plus className="h-3 w-3" /> Agregar</button>}
                          {canDelete && r.flags.length > 0 && (
                            <button type="button" onClick={() => setAsk(r)} aria-label={`Eliminar guía ${r.guia}`} className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-sb-late hover:bg-sb-late-soft"><Trash2 className="h-3 w-3" /> Eliminar</button>
                          )}
                        </span>
                      </td>
                    </tr>,
                    r.flags.length ? (
                      <tr key={`${r.guia}-f`} className="border-b border-sb-outline-variant/15 bg-amber-500/10">
                        <td colSpan={10} className="px-4 pb-2.5 pt-0">
                          <span className="flex flex-wrap gap-1.5">
                            {r.flags.map((f) => <span key={f} className="flex items-center gap-1 rounded-full bg-sb-surface px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3 w-3" />{f}</span>)}
                          </span>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
                {rows && !shown.length && <tr><td colSpan={10} className="px-4 py-8 text-center text-sb-on-surface-variant">{rows.length ? "Nada coincide." : "No hay guías pendientes de embarque."}</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="border-t border-sb-outline-variant/30 px-4 py-2 text-[10px] text-sb-on-surface-variant">
            <span className="text-sb-ontime">Azul</span>: al día · <span className="text-sb-late">rojo</span>: lead time vencido · <span className="text-amber-700 dark:text-amber-400">ámbar</span>: posible duplicada{canDelete ? " (puedes eliminarla)" : " (avisa a la empresa para eliminarla)"}.
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
