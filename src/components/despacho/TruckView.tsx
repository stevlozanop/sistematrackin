"use client";
import { useMemo } from "react";
import { CheckCheck, Gauge, MapPin, PackageCheck, Truck } from "lucide-react";
import { Kind } from "@/components/Kinds";
import { TRUCK } from "@/lib/zones";
import { cn } from "@/lib/cn";

/** Una guía del viaje (lo mismo que trae /api/despacho?trip=) */
export type TruckRow = { guia: string | null; district: string | null; dealer: string | null; w2: number; w3: number; total: number; delivered: number };

const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");
const nice = (s: string | null) => (s ?? "—").toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());
/** Un color por parada (la primera, el de la empresa) */
const COLORS = ["var(--sb-primary)", "#3b82f6", "#a855f7", "#f59e0b", "#ec4899", "#14b8a6", "#ef4444", "#64748b"];
const ROWS = 4; // filas de espacios en la caja del camión (52 espacios = 13 columnas × 4)

/**
 * Vista detallada del viaje: el camión de perfil con su carga. Cada moto ocupa un espacio y cada motokar dos
 * (un camión lleva 52 motos o 26 motokares); cada parada tiene su color y lo ya entregado se ve tenue.
 * La primera parada va junto a la puerta (atrás), para bajarla primero.
 */
export function TruckView({ driver, plate, rows }: { driver: string; plate: string | null; rows: TruckRow[] }) {
  const data = useMemo(() => {
    const stops: { district: string; color: string; w2: number; w3: number; total: number; delivered: number; dealers: Set<string>; guias: number }[] = [];
    const cells: { kind: "w2" | "w3"; color: string; done: boolean; title: string }[] = [];
    for (const r of rows) {
      const d = r.district ?? "—";
      let st = stops.find((x) => x.district === d);
      if (!st) { st = { district: d, color: COLORS[stops.length % COLORS.length], w2: 0, w3: 0, total: 0, delivered: 0, dealers: new Set(), guias: 0 }; stops.push(st); }
      st.w2 += Number(r.w2); st.w3 += Number(r.w3); st.total += Number(r.total); st.delivered += Number(r.delivered); st.guias++;
      if (r.dealer) st.dealers.add(r.dealer);
      // Lo entregado de la guía se marca en sus primeras unidades
      let left = Number(r.delivered);
      const add = (kind: "w2" | "w3", count: number) => {
        for (let i = 0; i < count; i++) {
          cells.push({ kind, color: st!.color, done: left > 0, title: `${nice(d)} · guía ${r.guia ?? "—"} · ${r.dealer ?? "—"} · ${kind === "w2" ? "moto" : "motokar"}${left > 0 ? " · entregada" : ""}` });
          left--;
        }
      };
      add("w3", Number(r.w3)); add("w2", Number(r.w2));
    }
    const w2 = stops.reduce((t, s) => t + s.w2, 0), w3 = stops.reduce((t, s) => t + s.w3, 0);
    const used = w2 + w3 * 2, cap = TRUCK.w2;
    const total = w2 + w3, delivered = stops.reduce((t, s) => t + s.delivered, 0);
    return { stops, cells, w2, w3, used, cap, total, delivered, cols: Math.max(13, Math.ceil(used / ROWS)) };
  }, [rows]);
  const pct = Math.round((data.used / data.cap) * 100);
  const over = data.used > data.cap;

  return (
    <div className="sb-truck flex flex-col gap-4">
      {/* Fichas: vehículo · capacidad · entregas · paradas */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-sb-surface-container-low p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant"><Truck className="h-3.5 w-3.5" />Vehículo</p>
          <p className="mt-1.5 font-mono text-lg font-semibold leading-none">{plate ?? "Sin placa"}</p>
          <p className="mt-1 truncate text-[11px] text-sb-on-surface-variant">Chofer {driver}</p>
        </div>
        <div className="rounded-2xl bg-sb-surface-container-low p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant"><Gauge className="h-3.5 w-3.5" />Capacidad usada</p>
          <p className={cn("mt-1.5 text-2xl font-semibold leading-none tabular-nums", over && "text-sb-late")}>{pct}%</p>
          <span className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-sb-surface-container"><span className={cn("transition-[width] duration-700", over ? "bg-sb-late" : "bg-sb-primary")} style={{ width: `${Math.min(100, pct)}%` }} /></span>
          <p className="mt-1 text-[10px] text-sb-on-surface-variant">{n(data.used)} de {data.cap} espacios</p>
        </div>
        <div className="rounded-2xl bg-sb-surface-container-low p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant"><PackageCheck className="h-3.5 w-3.5" />Entregadas</p>
          <p className="mt-1.5 text-2xl font-semibold leading-none tabular-nums">{n(data.delivered)}<span className="text-sm font-normal text-sb-on-surface-variant">/{n(data.total)}</span></p>
          <span className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-sb-surface-container"><span className="bg-sb-primary transition-[width] duration-700" style={{ width: `${data.total ? (data.delivered / data.total) * 100 : 0}%` }} /></span>
        </div>
        <div className="rounded-2xl bg-sb-surface-container-low p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant"><MapPin className="h-3.5 w-3.5" />Paradas</p>
          <p className="mt-1.5 text-2xl font-semibold leading-none tabular-nums">{n(data.stops.length)}</p>
          <p className="mt-1 flex flex-wrap gap-1">{(data.w2 > 0 || !data.w3) && <Kind v={data.w2} k="w2" />}{data.w3 > 0 && <Kind v={data.w3} k="w3" short />}</p>
        </div>
      </div>

      {/* El camión de perfil: caja de carga con sus espacios y la cabina adelante */}
      <div className="sb-truck-stage overflow-x-auto rounded-3xl bg-sb-surface-container-low px-4 pb-4 pt-5">
        <div className="relative mx-auto min-w-[560px] max-w-[880px]">
          <div className="flex items-end">
            {/* Caja */}
            <div className="relative flex-1 rounded-[18px] border-2 border-sb-on-surface/15 bg-sb-surface p-2 shadow-[inset_0_2px_0_rgb(255_255_255/0.5)]">
              <span className="absolute -top-2.5 left-4 rounded-full bg-sb-surface px-2 text-[10px] font-semibold text-sb-on-surface-variant">Puerta · se baja primero ←</span>
              <div className="grid gap-[3px]" style={{ gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`, gridTemplateColumns: `repeat(${data.cols}, minmax(0, 1fr))`, gridAutoFlow: "column dense", aspectRatio: `${data.cols} / ${ROWS}` }}>
                {data.cells.map((c, i) => (
                  <span key={i} title={c.title}
                    className={cn("sb-truck-cell relative grid place-items-center rounded-[6px] transition-transform duration-300 hover:z-10 hover:scale-110", c.kind === "w3" && "row-span-2")}
                    style={{ background: c.done ? `color-mix(in oklab, ${c.color} 22%, transparent)` : c.color, outline: c.done ? `1px dashed ${c.color}` : undefined }}>
                    {c.done && <CheckCheck className="h-2.5 w-2.5" style={{ color: c.color }} />}
                    {!c.done && c.kind === "w3" && <span className="text-[8px] font-bold text-white/90">3W</span>}
                  </span>
                ))}
                {Array.from({ length: Math.max(0, data.cols * ROWS - data.used) }).map((_, i) => (
                  <span key={`e${i}`} className="rounded-[6px] border border-dashed border-sb-on-surface/10" />
                ))}
              </div>
            </div>
            {/* Cabina */}
            <div className="relative ml-1.5 w-[17%] min-w-[84px] self-stretch">
              <div className="absolute inset-x-0 bottom-0 top-[30%] rounded-[14px_30px_10px_10px] border-2 border-sb-on-surface/15 bg-sb-surface-container-high">
                <div className="absolute right-[9%] top-[10%] h-[38%] w-[48%] rounded-[6px_18px_6px_6px] bg-sky-300/55 dark:bg-sky-400/25" />
                <div className="absolute left-[12%] top-[56%] h-[3px] w-[28%] rounded-full bg-sb-on-surface/25" />
                <div className="absolute -right-[3px] bottom-[14%] h-[14%] w-[6px] rounded-full bg-amber-300" />
              </div>
            </div>
          </div>
          {/* Chasis y ruedas */}
          <div className="relative mt-1 h-3 rounded-full bg-sb-on-surface/70" />
          <div className="relative -mt-2 h-10">
            {[7, 19, 64, 88].map((x) => (
              <span key={x} className="absolute top-0 grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full bg-sb-on-surface shadow-md" style={{ left: `${x}%` }}>
                <span className="h-4 w-4 rounded-full bg-sb-surface-container-high" />
              </span>
            ))}
          </div>
        </div>
        {over && <p className="mt-3 text-center text-[11px] font-semibold text-sb-late">La carga supera un camión ({n(data.used)} espacios de {data.cap}).</p>}
      </div>

      {/* Paradas con su color */}
      <div className="grid gap-2 sm:grid-cols-2">
        {data.stops.map((s, i) => {
          const done = s.delivered >= s.total;
          return (
            <div key={s.district} className="flex items-center gap-3 rounded-2xl bg-sb-surface-container-low px-3 py-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: s.color }}>{done ? <CheckCheck className="h-3.5 w-3.5" /> : i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{nice(s.district)}</p>
                <p className="truncate text-[11px] text-sb-on-surface-variant">{s.guias} {s.guias === 1 ? "guía" : "guías"} · {[...s.dealers].map(nice).join(", ")}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{n(s.total)}</p>
                <p className={cn("text-[10px]", done ? "font-semibold text-sb-primary" : "text-sb-on-surface-variant")}>{done ? "entregado" : `${n(s.delivered)} entregadas`}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-sb-on-surface-variant">Cada cuadro es una moto; los motokares (3W) ocupan dos. Un camión lleva {TRUCK.w2} motos o {TRUCK.w3} motokares. Lo entregado se ve con borde punteado.</p>
    </div>
  );
}
