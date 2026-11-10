"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, PageTitle } from "@/components/ui";
import { DATA_EVENT } from "@/components/UploadCenter";
import { RoadScene, type RoadTruck } from "@/components/figures/road/RoadScene";
import { TripCard, type Trip } from "@/components/yur/YurTrips";
import { today } from "@/lib/workflow";
import { ORIGIN, STATE_LABEL, pathBetween, townOf, tripPosition, type TripState } from "@/lib/yur-road";
import { cn } from "@/lib/cn";

/**
 * YUR · Camiones en ruta: mapa 3D de la carretera desde Yurimaguas con cada camión donde va
 * (por sus paradas y fechas) y del color de su estado; abajo, cada viaje con sus paradas.
 * El conductor o el planificador marcan «Llegué» y «Entregar» parada por parada.
 */
type Data = { canArrive: boolean; canDeliver: boolean; trips: Trip[]; enapu: number };
const FILTERS: (TripState | "todos")[] = ["todos", "camino", "parada", "atrasado", "entregado"];

export default function YurViajesPage() {
  const [data, setData] = useState<Data | null>(null);
  const [reload, setReload] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [filter, setFilter] = useState<TripState | "todos">("todos");

  const load = useCallback(() => { fetch("/api/yur?view=viajes").then((r) => r.json()).then(setData).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load, reload]);
  useEffect(() => {
    const again = () => setReload((x) => x + 1);
    window.addEventListener(DATA_EVENT, again);
    return () => window.removeEventListener(DATA_EVENT, again);
  }, []);

  const rows = useMemo(() => (data?.trips ?? []).map((t) => ({ t, p: tripPosition(t, today()) })), [data]);
  const count = (st: TripState) => rows.filter((r) => r.p.state === st).length;
  const shown = rows.filter((r) => filter === "todos" || r.p.state === filter);
  const trucks: RoadTruck[] = shown.map(({ t, p }) => ({
    id: t.id, label: t.driver.split(" ")[0], state: p.state, x: p.x, y: p.y, angle: p.angle,
    sub: p.state === "entregado" ? "entregado" : p.at ? `en ${townOf(p.at)?.name ?? p.at}` : `→ ${townOf(p.next?.district)?.name ?? "—"}`,
  }));
  // Viaje elegido: su camino completo y sus paradas, resaltados en el mapa
  const chosen = rows.find((r) => r.t.id === sel)?.t ?? null;
  const stopIds = (chosen?.stops ?? []).sort((a, b) => a.seq - b.seq).map((s) => townOf(s.district)?.id).filter(Boolean) as string[];
  const path = stopIds.reduce<string[]>((acc, id) => [...acc, ...pathBetween(acc[acc.length - 1] ?? ORIGIN, id)], [ORIGIN]);

  const pickTruck = (id: number) => {
    setSel(id);
    setTimeout(() => document.getElementById(`viaje-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  if (!data) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="YUR · Camiones en ruta" sub="Dónde va cada camión por la carretera desde Yurimaguas y en qué estado está. Toca un camión para ver su viaje; en cada parada se marca «Llegué» y «Entregar»." />

      <div className="flex gap-2 overflow-x-auto pb-1 scroll-hidden">
        {FILTERS.map((f) => {
          const v = f === "todos" ? rows.length : count(f);
          return (
            <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
              className={cn("flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-left transition-colors", filter === f ? "border-sb-primary bg-sb-primary-soft" : "border-sb-outline-variant/60 bg-sb-surface")}>
              {f !== "todos" && <i className={cn("h-2.5 w-2.5 rounded-full", `rd-tk-${f}`)} style={{ background: "var(--tk)" }} />}
              <span className="flex flex-col leading-tight">
                <b className="text-lg tabular-nums">{v}</b>
                <span className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant">{f === "todos" ? "Camiones" : STATE_LABEL[f]}</span>
              </span>
            </button>
          );
        })}
      </div>

      <Card className="p-2 sm:p-3">
        <RoadScene trucks={trucks} selected={sel} onPick={pickTruck} path={sel ? path : []} stops={stopIds} enapu={data.enapu} />
      </Card>

      <div className="flex flex-col gap-2">
        {shown.map(({ t }) => (
          <TripCard key={t.id} id={`viaje-${t.id}`} t={t} open={sel === t.id} onToggle={() => setSel(sel === t.id ? null : t.id)}
            canArrive={data.canArrive} canDeliver={data.canDeliver} onChanged={() => setReload((x) => x + 1)} />
        ))}
        {!shown.length && <p className="rounded-2xl border border-dashed border-sb-outline-variant px-4 py-8 text-center text-xs text-sb-on-surface-variant">
          {rows.length ? "Ningún camión en este estado." : "No hay camiones en la carretera. Se arman en «YUR · Despacho por ruta»."}</p>}
      </div>
    </div>
  );
}
