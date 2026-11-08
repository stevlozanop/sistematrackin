"use client";
import { useMemo, useState } from "react";
import { Chip } from "@heroui/react";
import { Box, ChevronDown, MapPin, Pencil, Search, Trash2, X } from "lucide-react";
import type { Site } from "@/lib/hsp";
import { ContainerEdit } from "./ContainerEdit";
import { fmtDate, unitsOf } from "@/lib/hsp";
import { cn } from "@/lib/cn";

export type NaveRow = { cid: number; code: string; loaded_on: string; place?: string | null; guia: string | null; district: string | null; dealer: string | null; category: string | null; chassis: string; motor: string | null; material: string | null };

const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");
/** «GL125E3 S/D-RO» → modelo «GL125E3» */
const model = (m: string | null) => (m ?? "—").split(/[ _]/)[0];

/** Modelos de una lista de unidades, de más a menos: [["AFS110PE", 8], ["GL125E3", 2]] */
function models(us: NaveRow[]) {
  const m = new Map<string, number>();
  for (const u of us) m.set(model(u.material), (m.get(model(u.material)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Contenido de una nave, en capas para no marear:
 * 1) resumen en cifras; 2) un contenedor a la vez (pestañas); 3) guías cerradas con dealer, destino y modelos;
 * los chasis aparecen solo al abrir una guía o al buscarlos.
 */
export function NaveContents({ site, nave, rows, canUndo, onUndo, naves = [], onEdited }: {
  site: Site; nave: string; rows: NaveRow[]; canUndo: boolean; onUndo: (id: number, code: string) => void;
  naves?: string[]; onEdited?: (moved: boolean) => void;
}) {
  const containers = useMemo(() => {
    const m = new Map<number, { code: string; loaded_on: string; place: string | null; units: NaveRow[] }>();
    for (const r of rows) {
      const c = m.get(r.cid) ?? { code: r.code, loaded_on: r.loaded_on, place: r.place ?? null, units: [] };
      c.units.push(r);
      m.set(r.cid, c);
    }
    return [...m.entries()].map(([id, c]) => ({ id, ...c }));
  }, [rows]);
  const [pick, setPick] = useState<number | "all">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);

  const needle = q.trim().toLowerCase();
  const scope = pick === "all" ? rows : rows.filter((r) => r.cid === pick);
  const match = (u: NaveRow) => !needle || [u.chassis, u.guia, u.dealer, u.district, u.material, u.code].some((x) => (x ?? "").toLowerCase().includes(needle));
  const shown = scope.filter(match);

  // Guías visibles (dentro del contenedor elegido o de todos)
  const guias = useMemo(() => {
    const m = new Map<string, { key: string; guia: string; code: string; cid: number; dealer: string; district: string; units: NaveRow[] }>();
    for (const u of shown) {
      const key = `${u.cid}|${u.guia ?? ""}`;
      const g = m.get(key) ?? { key, guia: u.guia ?? "(sin guía)", code: u.code, cid: u.cid, dealer: u.dealer ?? "—", district: u.district ?? "—", units: [] };
      g.units.push(u);
      m.set(key, g);
    }
    return [...m.values()];
  }, [shown]);

  const w2 = scope.filter((u) => u.category === "2W").length;
  const dealers = new Set(scope.map((u) => u.dealer)).size;
  const toggle = (k: string) => setOpen((s) => { const y = new Set(s); if (y.has(k)) y.delete(k); else y.add(k); return y; });
  const current = pick === "all" ? null : containers.find((c) => c.id === pick);

  if (!rows.length) return <p className="py-6 text-center text-xs text-sb-on-surface-variant">Esta nave ya no tiene contenedores pendientes.</p>;

  return (
    <div className="flex max-h-[66vh] flex-col gap-3 overflow-y-auto pr-1 [&>*]:shrink-0">
      {/* 1. Resumen */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {[
          ["Unidades", n(scope.length)],
          ["2W · 3W", `${n(w2)} · ${n(scope.length - w2)}`],
          ["Guías", n(new Set(scope.map((u) => `${u.cid}|${u.guia}`)).size)],
          ["Dealers", n(dealers)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-sb-surface-container-low px-2 py-1.5 sm:px-3 sm:py-2">
            <p className="truncate text-[9px] uppercase tracking-wider text-sb-on-surface-variant sm:text-[10px]">{l}</p>
            <p className="text-base font-bold tabular-nums sm:text-lg">{v}</p>
          </div>
        ))}
      </div>

      {/* 2. Contenedores: uno a la vez */}
      {containers.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[{ id: "all" as const, code: "Todos", units: rows, place: null }, ...containers].map((c) => (
            <button key={c.id} type="button" onClick={() => setPick(c.id)}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                pick === c.id ? "border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant text-sb-on-surface-variant hover:text-sb-on-surface")}>
              {c.id !== "all" && <Box className="h-3.5 w-3.5" />}{c.code}
              <span className={cn("rounded-full px-1.5 text-[10px]", pick === c.id ? "bg-white/20" : "bg-sb-surface-container")}>{c.units.length}</span>
            </button>
          ))}
        </div>
      )}
      {(current || containers.length === 1) && (() => {
        const c = current ?? containers[0];
        if (editing === c.id) {
          const gs = new Map<string, { guia: string; dealer: string; district: string; units: number }>();
          for (const u of c.units) {
            const k = u.guia ?? "";
            const g = gs.get(k) ?? { guia: k, dealer: u.dealer ?? "—", district: u.district ?? "—", units: 0 };
            g.units++; gs.set(k, g);
          }
          return (
            <ContainerEdit key={c.id} site={site} id={c.id} code={c.code} nave={nave} loadedOn={c.loaded_on} guias={[...gs.values()].filter((g) => g.guia)} naves={naves}
              onCancel={() => setEditing(null)}
              onDone={({ moved }) => { setEditing(null); if (moved) setPick("all"); onEdited?.(moved); }} />
          );
        }
        return (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-sb-outline-variant/50 px-3 py-2 text-xs">
            <span className="flex items-center gap-2"><Box className="h-4 w-4" /><b className="text-sm">{c.code}</b><span className="text-sb-on-surface-variant">embarcado {fmtDate(c.loaded_on)}</span>{c.place && <span className="rounded-full bg-sb-primary-soft px-2 py-0.5 text-[10px] font-semibold">{c.place}</span>}</span>
            {canUndo && (
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => setEditing(c.id)} className="flex items-center gap-1 rounded-full px-2 py-1 font-medium text-sb-on-surface hover:bg-sb-surface-container">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button type="button" onClick={() => onUndo(c.id, c.code)} className="flex items-center gap-1 rounded-full px-2 py-1 text-sb-on-surface-variant hover:bg-sb-late-soft hover:text-sb-late">
                  <Trash2 className="h-3.5 w-3.5" /> Quitar
                </button>
              </span>
            )}
          </div>
        );
      })()}

      {canUndo && pick === "all" && containers.length > 1 && (
        <p className="-mt-1 text-[11px] text-sb-on-surface-variant">Elige un contenedor arriba para editarlo o quitarlo.</p>
      )}

      {/* Buscar chasis, guía o dealer */}
      <label className="flex h-10 items-center gap-2 rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm focus-within:border-sb-on-surface">
        <Search className="h-4 w-4 text-sb-on-surface-variant" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar chasis, guía, dealer o modelo" className="min-w-0 flex-1 bg-transparent outline-none" />
        {q && <button type="button" onClick={() => setQ("")} aria-label="Limpiar búsqueda"><X className="h-4 w-4 text-sb-on-surface-variant" /></button>}
      </label>

      {/* 3. Guías cerradas: dealer, destino y modelos; los chasis al abrir */}
      <div className="flex flex-col gap-2">
        {!guias.length && <p className="py-4 text-center text-xs text-sb-on-surface-variant">Nada coincide con «{q}».</p>}
        {guias.map((g) => {
          const isOpen = !!needle || open.has(g.key);
          return (
            <div key={g.key} className="overflow-hidden rounded-xl border border-sb-outline-variant/50">
              <button type="button" onClick={() => toggle(g.key)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-sb-surface-container-low">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{g.dealer}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-sb-on-surface-variant">
                    <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{g.district}</span>
                    <span className="font-mono">{g.guia}</span>
                    {pick === "all" && containers.length > 1 && <span>· {g.code}</span>}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {models(g.units).map(([m, c]) => <Chip key={m} size="sm" variant="soft">{m} ×{c}</Chip>)}
                  </span>
                </span>
                <span className="text-right"><b className="block text-lg leading-none tabular-nums">{g.units.length}</b><span className="block whitespace-nowrap text-[10px] text-sb-on-surface-variant">{unitsOf(g.units)}</span></span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-sb-on-surface-variant transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <ul className="grid border-t border-sb-outline-variant/40 bg-sb-surface-container-low/50 sm:grid-cols-2">
                  {g.units.map((u) => (
                    <li key={u.chassis} className="flex items-baseline gap-2 border-b border-sb-outline-variant/20 px-3 py-1.5 text-[11px]">
                      <span className="font-mono font-medium">{u.chassis}</span>
                      <span className="truncate text-sb-on-surface-variant">{u.material} · {u.category}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
