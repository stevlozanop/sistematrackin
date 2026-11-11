"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, toast } from "@heroui/react";
import { ArrowLeftRight, Box, Inbox, Ruler, X } from "lucide-react";
import { XScroll } from "@/components/XScroll";
import type { Site } from "@/lib/hsp";
import { KIND_LABEL, bayName, defaultVessel, floating, rowName, same, slotName, tierName, type Slot, type Vessel } from "@/lib/stowage";
import { cn } from "@/lib/cn";
import { Stowage3D } from "./Stowage3D";
import { SoftSelect } from "@/components/SoftSelect";

type Item = { id: number; code: string; slot: Slot | null; units: number; guias: number; dealers: string | null };

/**
 * Plano de estiba de una nave, por niveles (se ve bien en celular y tablet):
 * cada nivel es una cuadrícula de bahías (proa → popa) × filas (izquierda → derecha).
 * Para mover: toca un contenedor y luego el lugar. Si está ocupado, se intercambian.
 */
export function StowagePlan({ site, nave, onChanged }: { site: Site; nave: string; onChanged?: () => void }) {
  const [vessel, setVessel] = useState<Vessel | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [tier, setTier] = useState(1);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [sizing, setSizing] = useState<Vessel | null>(null);
  // En celular se abre el plano por niveles (se lee mejor); el 3D queda a un toque
  const [mode, setMode] = useState<"3d" | "plano">(() => (typeof window !== "undefined" && window.innerWidth < 640 ? "plano" : "3d"));

  const load = useCallback(() => {
    fetch(`/api/embarque?${new URLSearchParams({ site, nave, plan: "1" })}`).then((r) => r.json()).then((j) => {
      setVessel(j.vessel); setItems(j.containers ?? []); setCanEdit(!!j.canEdit);
    });
  }, [site, nave]);
  useEffect(() => { load(); }, [load]);

  const placed = useMemo(() => items.filter((i) => i.slot), [items]);
  const loose = items.filter((i) => !i.slot);
  const at = (s: Slot) => placed.find((i) => same(i.slot!, s));
  const picked = items.find((i) => i.id === sel) ?? null;

  /** ¿Se puede llevar lo marcado a este lugar? (como en la realidad: nada flotando) */
  const canDrop = (to: Slot) => {
    if (!picked) return false;
    const other = at(to);
    const after = items.map((i) => (i.id === picked.id ? to : other && i.id === other.id ? picked.slot : i.slot)).filter(Boolean) as Slot[];
    return !floating(after);
  };

  async function post(body: object, ok: string) {
    setBusy(true);
    const r = await fetch("/api/embarque", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setBusy(false);
    if (!r.ok) { toast.danger(j.error); return false; }
    toast.success(j.swapped ? `${ok} · se intercambió con ${j.swapped}` : ok, { timeout: 2500 });
    setSel(null); load(); onChanged?.();
    return true;
  }
  const tap = (s: Slot) => {
    if (!canEdit || busy) return;
    const here = at(s);
    if (!picked) { if (here) setSel(here.id); return; }
    if (here?.id === picked.id) { setSel(null); return; }
    if (!canDrop(s)) return toast.warning("Así quedaría un contenedor flotando: primero ocupa el lugar de abajo");
    post({ action: "place", id: picked.id, ...s }, `${picked.code} → ${slotName(s, vessel!)}`);
  };

  if (!vessel) return <p className="py-8 text-center text-sm text-sb-on-surface-variant">Cargando plano…</p>;
  const tiers = Array.from({ length: vessel.tiers }, (_, i) => vessel.tiers - i); // de arriba hacia abajo
  const bays = Array.from({ length: vessel.bays }, (_, i) => i + 1);
  const rows = Array.from({ length: vessel.rows }, (_, i) => i + 1);
  const t = Math.min(tier, vessel.tiers);
  const count = (tt: number) => placed.filter((i) => i.slot!.tier === tt).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Resumen y tamaño */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-sb-surface-container px-3 py-1"><b>{placed.length}</b> de {vessel.bays * vessel.rows * vessel.tiers} lugares ocupados</span>
        <span className="text-sb-on-surface-variant">{KIND_LABEL[vessel.kind ?? "chata"]} · {vessel.bays} bahías × {vessel.rows} filas × {vessel.tiers} niveles</span>
        {canEdit && !sizing && (
          <button type="button" onClick={() => setSizing(vessel)} className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-sb-on-surface-variant hover:bg-sb-surface-container"><Ruler className="h-3.5 w-3.5" /> Tamaño de la nave</button>
        )}
      </div>
      {sizing && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-sb-outline-variant/50 p-3 text-[11px] text-sb-on-surface-variant">
          <label className="flex flex-col gap-1">Tipo de nave
            <SoftSelect className="h-9 rounded-lg border border-sb-outline-variant bg-sb-surface px-2 text-sm text-sb-on-surface" value={sizing.kind ?? "chata"}
              onChange={(e) => {
                const kind = e.target.value as "chata" | "motonave";
                // Al cambiar el tipo se propone su tamaño típico (se puede ajustar)
                const d = defaultVessel(kind === "motonave" ? "HENRY" : "CHATA");
                setSizing({ ...d, kind });
              }}>
              <option value="chata">Chata con empujador (muchos contenedores)</option>
              <option value="motonave">Motonave (pocos contenedores en proa)</option>
            </SoftSelect>
          </label>
          {([["bays", "Bahías (largo)", 20], ["rows", "Filas (ancho)", 6], ["tiers", "Niveles (alto)", 5]] as const).map(([k, l, max]) => (
            <label key={k} className="flex flex-col gap-1">{l}
              <SoftSelect className="h-9 rounded-lg border border-sb-outline-variant bg-sb-surface px-2 text-sm text-sb-on-surface" value={sizing[k]}
                onChange={(e) => setSizing({ ...sizing, [k]: Number(e.target.value) })}>
                {Array.from({ length: max }, (_, i) => i + 1).map((x) => <option key={x} value={x}>{x}</option>)}
              </SoftSelect>
            </label>
          ))}
          <Button size="sm" variant="secondary" className="rounded-full" onPress={() => setSizing(null)}>Cancelar</Button>
          <Button size="sm" variant="primary" className="rounded-full" isDisabled={busy}
            onPress={async () => { if (await post({ action: "vessel", site, nave, ...sizing }, "Tamaño guardado")) setSizing(null); }}>Guardar</Button>
        </div>
      )}

      {/* Vista: 3D o plano por niveles (en celular el plano se lee mejor) */}
      <div className="flex w-max gap-1 rounded-full bg-sb-surface-container p-1">
        {([["3d", "Vista 3D"], ["plano", "Plano por niveles"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMode(k)}
            className={cn("rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", mode === k ? "bg-sb-on-surface text-sb-surface" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>{l}</button>
        ))}
      </div>

      {/* Niveles: de arriba hacia abajo */}
      <div className={cn("flex w-max max-w-full gap-1 overflow-x-auto rounded-full bg-sb-surface-container p-1", mode === "3d" && "hidden")}>
        {tiers.map((tt) => (
          <button key={tt} type="button" onClick={() => setTier(tt)}
            className={cn("flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", t === tt ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
            {tierName(tt, vessel)}<span className={cn("rounded-full px-1.5 text-[10px]", t === tt ? "bg-white/20" : "bg-sb-surface")}>{count(tt)}</span>
          </button>
        ))}
      </div>

      {/* Ayuda / acción en curso */}
      <p className={cn("rounded-xl px-3 py-2 text-[11px]", picked ? "bg-sb-primary-soft text-sb-on-surface" : "bg-sb-surface-container-low text-sb-on-surface-variant")}>
        {picked
          ? <>Moviendo <b className="font-mono">{picked.code}</b>{picked.slot ? <> (está en {slotName(picked.slot, vessel)})</> : " (sin ubicar)"}: toca {mode === "3d" ? "un «+» o el contenedor con el que quieras intercambiarlo" : "el lugar donde va. Si está ocupado, se intercambian"}.</>
          : canEdit ? (mode === "3d" ? "Toca un contenedor para moverlo y luego el «+» donde va. Gira la nave con los botones de arriba." : "Toca un contenedor para moverlo. Arriba eliges el nivel; la proa está a la izquierda.") : "Así está cargada la nave."}
      </p>

      {mode === "3d" && (
        <Stowage3D vessel={vessel} items={items} sel={sel} canEdit={canEdit && !busy} canDrop={canDrop}
          onTapItem={(id) => { const it = items.find((i) => i.id === id); if (it?.slot) tap(it.slot); else setSel(sel === id ? null : id); }}
          onTapSlot={tap} />
      )}

      {/* Cuadrícula del nivel: bahías × filas, con la forma de la nave */}
      <XScroll className={cn("-mx-1 px-1 pb-1", mode === "3d" && "hidden")}>
        <div className="relative min-w-max rounded-[1.5rem_0.75rem_0.75rem_1.5rem] border-2 border-sb-outline-variant/70 bg-sb-surface-container-low/60 p-2 sm:p-3">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `3.4rem repeat(${vessel.bays}, minmax(4.6rem, 1fr))` }}>
            <span />
            {bays.map((b) => <span key={b} className="text-center text-[10px] font-semibold uppercase tracking-wider text-sb-on-surface-variant">{bayName(b, vessel)}</span>)}
            {rows.map((r) => [
              <span key={`r${r}`} className="self-center text-[10px] font-semibold text-sb-on-surface-variant">{rowName(r, vessel)}</span>,
              ...bays.map((b) => {
                const s = { bay: b, row: r, tier: t };
                const here = at(s);
                const mine = here && here.id === sel;
                const ok = picked && !mine && canDrop(s);
                const blocked = picked && !mine && !ok;
                return (
                  <button key={`${b}-${r}`} type="button" onClick={() => tap(s)} disabled={!canEdit || busy}
                    aria-label={here ? `${here.code} en ${slotName(s, vessel)}` : `Lugar libre: ${slotName(s, vessel)}`}
                    className={cn("flex h-16 flex-col items-center justify-center rounded-lg border text-center transition-all",
                      here ? "border-sb-primary/40 bg-sb-surface shadow-sm" : "border-dashed border-sb-outline-variant/70 bg-transparent",
                      mine && "ring-2 ring-sb-primary ring-offset-1",
                      ok && (here ? "ring-2 ring-sb-ontime/60" : "border-sb-primary bg-sb-primary-soft/60"),
                      blocked && "opacity-35",
                      canEdit && !busy && "cursor-pointer hover:border-sb-primary")}>
                    {here ? (
                      <>
                        <span className="flex items-center gap-1 font-mono text-[10px] font-bold sm:text-[11px]"><Box className="hidden h-3 w-3 opacity-60 sm:block" />{here.code}</span>
                        <span className="text-[10px] text-sb-on-surface-variant">{here.units} unid.</span>
                        {ok && <span className="flex items-center gap-0.5 text-[9px] font-semibold text-sb-ontime"><ArrowLeftRight className="h-2.5 w-2.5" />intercambiar</span>}
                      </>
                    ) : <span className="text-[10px] text-sb-on-surface-variant">{ok ? "Poner aquí" : t > 1 && !at({ ...s, tier: t - 1 }) ? "sin base" : "Libre"}</span>}
                  </button>
                );
              }),
            ])}
          </div>
          <span className="mt-1 block text-[9px] font-semibold uppercase tracking-widest text-sb-on-surface-variant">← Proa · Popa →</span>
        </div>
      </XScroll>

      {/* Sin ubicar */}
      {(loose.length > 0 || picked?.slot) && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-dashed border-sb-outline-variant p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-sb-on-surface-variant"><Inbox className="h-3.5 w-3.5" /> Sin ubicar {loose.length ? `(${loose.length})` : ""}</p>
          <div className="flex flex-wrap gap-1.5">
            {loose.map((i) => (
              <button key={i.id} type="button" disabled={!canEdit} onClick={() => setSel(sel === i.id ? null : i.id)}
                className={cn("flex items-center gap-1 rounded-full border px-3 py-1 font-mono text-[11px] font-semibold", sel === i.id ? "border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant hover:border-sb-primary")}>
                <Box className="h-3 w-3" />{i.code}<span className="font-sans font-normal opacity-70">· {i.units}</span>
              </button>
            ))}
            {picked?.slot && canEdit && (
              <button type="button" disabled={busy} onClick={() => post({ action: "unplace", id: picked.id }, `${picked.code} quedó sin ubicar`)}
                className="rounded-full border border-dashed border-sb-outline-variant px-3 py-1 text-[11px] text-sb-on-surface-variant hover:border-sb-late hover:text-sb-late">Dejar {picked.code} sin ubicar</button>
            )}
          </div>
        </div>
      )}
      {picked && <Button size="sm" variant="secondary" className="self-start rounded-full" onPress={() => setSel(null)}><X className="h-3.5 w-3.5" /> Cancelar movimiento</Button>}

      {/* Lista de lugares (útil para la descarga y para leerlo rápido) */}
      <details className="rounded-xl border border-sb-outline-variant/50 px-3 py-2 text-xs">
        <summary className="cursor-pointer font-semibold">Lista de contenedores y su lugar</summary>
        <ul className="mt-2 flex flex-col divide-y divide-sb-outline-variant/30">
          {[...items].sort((a, b) => (b.slot?.tier ?? 0) - (a.slot?.tier ?? 0) || (a.slot?.bay ?? 99) - (b.slot?.bay ?? 99) || (a.slot?.row ?? 99) - (b.slot?.row ?? 99)).map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-3 py-1.5">
              <span className="font-mono font-semibold">{i.code}</span>
              <span className="text-sb-on-surface-variant">{i.slot ? slotName(i.slot, vessel) : "Sin ubicar"}</span>
              <span className="ml-auto text-sb-on-surface-variant">{i.units} unidades · {i.guias} guía(s)</span>
            </li>
          ))}
          {!items.length && <li className="py-2 text-sb-on-surface-variant">La nave no tiene contenedores.</li>}
        </ul>
      </details>
    </div>
  );
}
