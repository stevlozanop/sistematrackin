"use client";
import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { Box, Plus, RotateCcw, Ship, Trash2, X } from "lucide-react";
import { DELAY_REASONS, type Site } from "@/lib/hsp";
import { DatePicker } from "@/components/modal/DatePicker";
import { SuggestInput } from "@/components/SuggestInput";
import { cn } from "@/lib/cn";
import { SoftSelect } from "@/components/SoftSelect";

type Guia = { guia: string; dealer: string; district: string; units: number };
type NewGuia = { guia: string; dealer: string; district: string; total: number; need: number };

const field = "h-10 w-full rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-on-surface";

/**
 * Editar un contenedor que aún no zarpa, dentro del mismo modal de la nave:
 * número, nave, fecha de embarque, quitar guías (vuelven a IQT-Port) y agregar guías.
 * Al guardar vuelve a la vista del contenedor.
 */
export function ContainerEdit({ site, id, code, nave, loadedOn, guias, naves, onDone, onCancel }: {
  site: Site; id: number; code: string; nave: string; loadedOn: string; guias: Guia[]; naves: string[];
  onDone: (r: { nave: string; moved: boolean }) => void; onCancel: () => void;
}) {
  const [c, setC] = useState(code);
  const [v, setV] = useState(nave);
  const [d, setD] = useState(loadedOn.slice(0, 10));
  const [out, setOut] = useState<Set<string>>(new Set());
  const [add, setAdd] = useState<NewGuia[]>([]);
  const [input, setInput] = useState("");
  const [looking, setLooking] = useState(false);
  const [reason, setReason] = useState("");
  const [need, setNeed] = useState(0);
  const [saving, setSaving] = useState(false);

  const toggleOut = (g: string) => setOut((s) => { const x = new Set(s); if (x.has(g)) x.delete(g); else x.add(g); return x; });
  const lateNew = add.reduce((t, g) => t + g.need, 0);
  const askReason = need > 0 || lateNew > 0;
  const changed = c.trim().toUpperCase() !== code || v.trim().toUpperCase() !== nave || d !== loadedOn.slice(0, 10) || out.size > 0 || add.length > 0;

  async function lookup(pick?: string) {
    const g = (pick ?? input).trim();
    if (!g) return;
    if (guias.some((x) => x.guia.toUpperCase() === g.toUpperCase()) || add.some((x) => x.guia.toUpperCase() === g.toUpperCase())) return toast.warning("Esa guía ya está en el contenedor");
    setLooking(true);
    const r = await fetch(`/api/embarque?${new URLSearchParams({ site, guia: g })}`);
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setLooking(false);
    if (!r.ok) return toast.danger(j.error);
    setAdd((x) => [...x, { guia: j.guia, dealer: j.dealer, district: j.district, total: j.total, need: j.need }]);
    setInput("");
  }

  async function save() {
    if (!c.trim() || !v.trim()) return toast.danger("Indica el número de contenedor y la nave");
    setSaving(true);
    const r = await fetch("/api/embarque", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", id, container: c, nave: v, date: d, removeGuias: [...out], addGuias: add.map((g) => g.guia), lateReason: reason || undefined }),
    });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setSaving(false);
    if (!r.ok) { if (j.need) setNeed(j.need); return toast.danger(j.error); }
    toast.success(`Contenedor ${j.code} actualizado`, {
      description: [j.moved ? `Pasó a la nave ${j.nave}` : "", j.added ? `${j.added} unidades agregadas` : "", j.removed ? `${j.removed} unidades volvieron a IQT-Port` : ""].filter(Boolean).join(" · ") || undefined,
    });
    onDone({ nave: j.nave, moved: j.moved });
  }

  return (
    <div ref={(el) => { if (el && !el.dataset.seen) { el.dataset.seen = "1"; setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 60); } }}
      className="flex scroll-mt-2 flex-col gap-3 rounded-xl border border-sb-primary/40 bg-sb-primary-soft/30 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold"><Box className="h-4 w-4" /> Editar contenedor {code}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Contenedor
          <input className={cn(field, "uppercase")} value={c} onChange={(e) => setC(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant"><span className="flex items-center gap-1"><Ship className="h-3 w-3" /> Nave</span>
          <input className={cn(field, "uppercase")} list="edit-naves" value={v} onChange={(e) => setV(e.target.value)} />
          <datalist id="edit-naves">{naves.map((x) => <option key={x} value={x} />)}</datalist>
        </label>
        <div className="col-span-2 flex flex-col gap-1 text-[11px] text-sb-on-surface-variant sm:col-span-1">Fecha de embarque
          <DatePicker label="Fecha de embarque" value={d} onChange={setD} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-[11px] text-sb-on-surface-variant">Guías del contenedor · las que quites vuelven a IQT-Port</p>
        {guias.map((g) => {
          const off = out.has(g.guia);
          return (
            <div key={g.guia} className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs", off ? "border-sb-late/40 bg-sb-late-soft/50" : "border-sb-outline-variant/50 bg-sb-surface")}>
              <span className="min-w-0 flex-1">
                <span className={cn("block font-mono font-semibold", off && "line-through opacity-60")}>{g.guia}</span>
                <span className="block truncate text-[11px] text-sb-on-surface-variant">{g.dealer} · {g.district} · {g.units} unid.</span>
              </span>
              <button type="button" onClick={() => toggleOut(g.guia)}
                className={cn("flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium", off ? "text-sb-on-surface hover:bg-sb-surface-container" : "text-sb-on-surface-variant hover:bg-sb-late-soft hover:text-sb-late")}>
                {off ? <><RotateCcw className="h-3 w-3" /> Dejar</> : <><Trash2 className="h-3 w-3" /> Quitar</>}
              </button>
            </div>
          );
        })}
        {add.map((g) => (
          <div key={g.guia} className="flex items-center gap-2 rounded-lg border border-sb-primary/40 bg-sb-surface px-2.5 py-1.5 text-xs">
            <span className="min-w-0 flex-1">
              <span className="block font-mono font-semibold">{g.guia} <span className="font-sans text-[10px] font-semibold text-sb-primary">NUEVA</span></span>
              <span className="block truncate text-[11px] text-sb-on-surface-variant">{g.dealer} · {g.district} · {g.total} unid.{g.need ? ` · ${g.need} fuera de tiempo` : ""}</span>
            </span>
            <button type="button" aria-label={`Quitar ${g.guia}`} onClick={() => setAdd((x) => x.filter((y) => y.guia !== g.guia))} className="rounded-full p-1 text-sb-on-surface-variant hover:bg-sb-surface-container"><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        <div className="flex gap-2">
          <SuggestInput inputClassName={field} mono placeholder="Agregar guía…" value={input} onChange={setInput}
            onPick={(v) => { setInput(v); lookup(v); }} onEnter={() => lookup()}
            source={(q) => `/api/suggest?${new URLSearchParams({ kind: "guia", site, step: "d_carga", q })}`} />
          <Button variant="secondary" className="shrink-0 rounded-full" onPress={() => lookup()} isDisabled={looking || !input.trim()} aria-label="Agregar guía"><Plus className="h-4 w-4" /><span className="hidden sm:inline">{looking ? "Buscando…" : "Agregar"}</span></Button>
        </div>
      </div>

      {askReason && (
        <label className="flex flex-col gap-1 text-[11px] text-sb-late">Motivo de demora ({need || lateNew} fuera de tiempo · opcional)
          <SoftSelect className={field} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Elegir…</option>
            {DELAY_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </SoftSelect>
        </label>
      )}

      <div className="sticky bottom-0 -mx-3 -mb-3 grid grid-cols-2 gap-2 rounded-b-xl border-t border-sb-primary/20 bg-sb-surface/95 p-3 backdrop-blur sm:static sm:m-0 sm:flex sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">
        <Button variant="secondary" className="rounded-full" onPress={onCancel} isDisabled={saving}>Cancelar</Button>
        <Button variant="primary" className="rounded-full" onPress={save} isDisabled={saving || !changed}>{saving ? "Guardando…" : "Guardar cambios"}</Button>
      </div>
    </div>
  );
}
