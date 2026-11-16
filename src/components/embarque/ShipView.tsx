"use client";
import { useMemo, useState } from "react";
import { Anchor, Box, CalendarDays, Ship, Store } from "lucide-react";
import { Kind, W2, W3 } from "@/components/Kinds";
import { fmtDate } from "@/lib/hsp";
import { cn } from "@/lib/cn";
import type { NaveRow } from "@/components/embarque/NaveContents";

const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");
const nice = (s: string | null) => (s ?? "—").toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());

/**
 * Vista detallada de la nave: el barco visto desde arriba en el río, con sus contenedores en cubierta (en el orden
 * en que se embarcaron). Cada contenedor muestra su código, unidades y la mezcla de motos y motokares; al tocarlo,
 * abajo aparecen sus guías.
 */
export function ShipView({ nave, rows }: { nave: string; rows: NaveRow[] }) {
  const data = useMemo(() => {
    const m = new Map<number, { cid: number; code: string; loaded_on: string; place: string | null; units: NaveRow[] }>();
    for (const r of rows) {
      const c = m.get(r.cid) ?? { cid: r.cid, code: r.code, loaded_on: r.loaded_on, place: r.place ?? null, units: [] };
      c.units.push(r); m.set(r.cid, c);
    }
    const boxes = [...m.values()].sort((a, b) => String(a.loaded_on).localeCompare(String(b.loaded_on)) || a.code.localeCompare(b.code)).map((c) => {
      const w2 = c.units.filter((u) => u.category === "2W").length;
      const guias = new Map<string, { guia: string; dealer: string; district: string; w2: number; w3: number }>();
      for (const u of c.units) {
        const k = u.guia ?? "(sin guía)";
        const g = guias.get(k) ?? { guia: k, dealer: u.dealer ?? "—", district: u.district ?? "—", w2: 0, w3: 0 };
        if (u.category === "2W") g.w2++; else g.w3++;
        guias.set(k, g);
      }
      return { ...c, w2, w3: c.units.length - w2, guias: [...guias.values()] };
    });
    const dates = rows.map((r) => String(r.loaded_on).slice(0, 10)).sort();
    const w2 = rows.filter((r) => r.category === "2W").length;
    return {
      boxes, w2, w3: rows.length - w2, total: rows.length,
      guias: new Set(rows.map((r) => r.guia)).size, dealers: new Set(rows.map((r) => r.dealer)).size,
      from: dates[0] ?? null, to: dates.at(-1) ?? null,
    };
  }, [rows]);
  const [pick, setPick] = useState<number | null>(null);
  const sel = data.boxes.find((b) => b.cid === pick) ?? data.boxes[0] ?? null;
  const max = Math.max(1, ...data.boxes.map((b) => b.units.length));

  return (
    <div className="sb-ship flex flex-col gap-4">
      {/* Fichas de la nave */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-sb-surface-container-low p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant"><Ship className="h-3.5 w-3.5" />Nave</p>
          <p className="mt-1.5 truncate text-lg font-semibold leading-none">{nave}</p>
          <p className="mt-1 text-[11px] text-sb-on-surface-variant">{n(data.boxes.length)} {data.boxes.length === 1 ? "contenedor" : "contenedores"}</p>
        </div>
        <div className="rounded-2xl bg-sb-surface-container-low p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant"><Box className="h-3.5 w-3.5" />A bordo</p>
          <p className="mt-1.5 text-2xl font-semibold leading-none tabular-nums">{n(data.total)}<span className="ml-1 text-xs font-normal text-sb-on-surface-variant">unid.</span></p>
          <p className="mt-1.5 flex flex-wrap gap-1">{(data.w2 > 0 || !data.w3) && <Kind v={data.w2} k="w2" />}{data.w3 > 0 && <Kind v={data.w3} k="w3" short />}</p>
        </div>
        <div className="rounded-2xl bg-sb-surface-container-low p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant"><Store className="h-3.5 w-3.5" />Guías · dealers</p>
          <p className="mt-1.5 text-2xl font-semibold leading-none tabular-nums">{n(data.guias)}<span className="mx-1 text-sm font-normal text-sb-on-surface-variant">·</span>{n(data.dealers)}</p>
        </div>
        <div className="rounded-2xl bg-sb-surface-container-low p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant"><CalendarDays className="h-3.5 w-3.5" />Embarque</p>
          <p className="mt-1.5 text-sm font-semibold leading-tight">{data.from ? fmtDate(data.from) : "—"}{data.to && data.to !== data.from ? ` → ${fmtDate(data.to)}` : ""}</p>
        </div>
      </div>

      {/* El barco visto desde arriba */}
      <div className="sb-ship-sea overflow-x-auto rounded-3xl p-4" style={{ background: "linear-gradient(180deg, color-mix(in oklab, #38bdf8 14%, var(--sb-surface-container-low)), color-mix(in oklab, #0ea5e9 22%, var(--sb-surface-container-low)))" }}>
        <div className="relative mx-auto min-w-[620px] max-w-[900px]">
          {/* Casco: popa a la izquierda (con el puente), proa en punta a la derecha */}
          <div className="absolute inset-0 bg-sb-on-surface/20" style={{ clipPath: "polygon(0 10%, 3% 0, 80% 0, 100% 50%, 80% 100%, 3% 100%, 0 90%)" }} />
          <div className="absolute inset-[3px] bg-sb-surface" style={{ clipPath: "polygon(0 10%, 3% 0, 80% 0, 100% 50%, 80% 100%, 3% 100%, 0 90%)" }} />
          <div className="relative flex min-h-[210px] items-stretch gap-3 py-5 pl-4 pr-[21%]">
            {/* Puente de mando */}
            <div className="flex w-20 shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl bg-sb-surface-container-high">
              <Anchor className="h-5 w-5 text-sb-on-surface-variant" />
              <div className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-2 w-3 rounded-sm bg-sky-300/70 dark:bg-sky-400/40" />)}</div>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-sb-on-surface-variant">Popa</span>
            </div>
            {/* Contenedores en cubierta */}
            <div className="grid flex-1 grid-flow-col grid-rows-2 gap-2" style={{ gridAutoColumns: "minmax(112px, 168px)" }}>
              {data.boxes.map((b) => {
                const on = sel?.cid === b.cid;
                return (
                  <button key={b.cid} type="button" onClick={() => setPick(b.cid)} aria-pressed={on}
                    className={cn("group relative flex flex-col justify-between overflow-hidden rounded-xl border-2 p-2 text-left transition-all duration-300",
                      on ? "border-sb-primary bg-sb-primary-soft shadow-lg" : "border-sb-on-surface/10 bg-sb-surface-container-low hover:-translate-y-0.5 hover:border-sb-primary/50")}>
                    {/* Corrugado del contenedor */}
                    <span aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 7px)" }} />
                    <span className="relative flex items-center gap-1 font-mono text-[11px] font-semibold"><Box className="h-3 w-3" />{b.code}</span>
                    <span className="relative mt-1 text-xl font-semibold leading-none tabular-nums">{n(b.units.length)}<span className="ml-0.5 text-[10px] font-normal text-sb-on-surface-variant">unid.</span></span>
                    <span className="relative mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-sb-surface-container" style={{ width: `${Math.max(30, (b.units.length / max) * 100)}%` }}>
                      <span style={{ width: `${(b.w2 / (b.units.length || 1)) * 100}%`, background: W2 }} />
                      <span style={{ width: `${(b.w3 / (b.units.length || 1)) * 100}%`, background: W3 }} />
                    </span>
                    <span className="relative mt-1 truncate text-[10px] text-sb-on-surface-variant">{b.guias.length} {b.guias.length === 1 ? "guía" : "guías"}{b.place ? ` · ${b.place}` : ""}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <span className="absolute right-[6%] top-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase tracking-wider text-sb-on-surface-variant">Proa ›</span>
        </div>
      </div>

      {/* Guías del contenedor elegido */}
      {sel && (
        <div className="rounded-2xl bg-sb-surface-container-low p-3">
          <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
            <Box className="h-4 w-4" /><span className="font-mono">{sel.code}</span>
            <span className="text-[11px] font-normal text-sb-on-surface-variant">embarcado el {fmtDate(sel.loaded_on)} · {n(sel.units.length)} unidades</span>
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {sel.guias.map((g) => (
              <div key={g.guia} className="flex items-center gap-3 rounded-xl bg-sb-surface px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs font-semibold">{g.guia}</p>
                  <p className="truncate text-[11px] text-sb-on-surface-variant">{nice(g.district)} · {g.dealer}</p>
                </div>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">{(g.w2 > 0 || !g.w3) && <Kind v={g.w2} k="w2" />}{g.w3 > 0 && <Kind v={g.w3} k="w3" short />}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
