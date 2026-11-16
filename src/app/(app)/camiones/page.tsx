"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Truck } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { Sheet } from "@/components/modal/Sheet";
import { DATA_EVENT } from "@/components/UploadCenter";
import { RoadScene, geoPoint, type RoadMap, type RoadTruck } from "@/components/figures/road/RoadScene";
import { PclTripCard } from "@/components/despacho/PclTripCard";
import { TruckView, type TruckRow } from "@/components/despacho/TruckView";
import type { Trip } from "@/components/yur/YurTrips";
import { today } from "@/lib/workflow";
import { STATE_LABEL, type TripState } from "@/lib/yur-road";
import { PCL_NET, PCL_ROADS, PCL_TOWNS } from "@/lib/pcl-road";
import { cn } from "@/lib/cn";

/**
 * PCL · Camiones en ruta, con el mismo diseño que el de Yurimaguas: mapa 3D de las carreteras que salen de Pucallpa
 * con cada camión donde va (por sus paradas y fechas) y del color de su estado; abajo, cada viaje con sus paradas.
 */
const PCL_MAP: RoadMap = {
  towns: PCL_TOWNS, roads: PCL_ROADS, hub: "PUCALLPA", label: "Carretera desde Pucallpa", minor: ["YARINACOCHA", "CAMPO VERDE", "AMARILIS", "TARMA"],
  coast: [geoPoint(-77.5, -10.9), geoPoint(-77.25, -11.5), geoPoint(-77.12, -12.05), geoPoint(-76.85, -12.5), geoPoint(-76.45, -13.2)],
  river: [geoPoint(-74.25, -7.5), geoPoint(-74.45, -8.0), geoPoint(-74.55, -8.38), geoPoint(-74.62, -8.8), geoPoint(-74.4, -9.3)],
};
type Row = { id: number; dispatched_on: string; driver: string; plate: string | null; district: string | null; guia: string | null; dealer: string | null;
  total: number; delivered: number; delivered_on: string | null; est: string | null; w2: number; w3: number };
const FILTERS: (TripState | "todos")[] = ["todos", "camino", "parada", "atrasado", "entregado"];

export default function PclCamionesPage() {
  const [data, setData] = useState<{ canDeliver: boolean; rows: Row[] } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [filter, setFilter] = useState<TripState | "todos">("todos");
  const [detail, setDetail] = useState<Trip | null>(null);
  const [detailRows, setDetailRows] = useState<TruckRow[] | null>(null);
  const load = useCallback(() => { fetch("/api/despacho?site=PCL&route=1").then((r) => r.json()).then((j) => setData({ canDeliver: !!j.canDeliver, rows: j.rows ?? [] })).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { window.addEventListener(DATA_EVENT, load); return () => window.removeEventListener(DATA_EVENT, load); }, [load]);
  useEffect(() => {
    if (!detail) return;
    fetch(`/api/despacho?site=PCL&trip=${detail.id}`).then((r) => r.json()).then((j) => setDetailRows(j.rows ?? []));
  }, [detail]);

  // Viajes con sus paradas (un distrito por parada, en el orden de la carretera) y las guías de cada una
  const trips = useMemo<Trip[]>(() => {
    const m = new Map<number, { t: Trip; rows: Row[] }>();
    for (const r of data?.rows ?? []) {
      const e = m.get(r.id) ?? { t: { id: r.id, dispatched_on: r.dispatched_on, driver: r.driver, plate: r.plate, total: 0, delivered: 0, w2: 0, w3: 0, routes: [], stops: [] }, rows: [] };
      e.rows.push(r); m.set(r.id, e);
    }
    return [...m.values()].map(({ t, rows }) => {
      const order = PCL_NET.orderStops(rows.map((r) => r.district ?? "—"));
      t.stops = order.map((d, i) => {
        const list = rows.filter((r) => (r.district ?? "—") === d);
        const total = list.reduce((x, r) => x + r.total, 0), delivered = list.reduce((x, r) => x + r.delivered, 0);
        const ests = list.map((r) => r.est).filter(Boolean).map((x) => String(x).slice(0, 10)).sort();
        const got = list.map((r) => r.delivered_on).filter(Boolean).map((x) => String(x).slice(0, 10)).sort();
        return {
          district: d, seq: i + 1, eta: ests[0] ?? null, arrived_on: delivered > 0 ? got[0] ?? null : null, total, delivered,
          guias: list.map((r) => ({ guia: r.guia, dealer: r.dealer, district: r.district, total: r.total, delivered: r.delivered, w2: r.w2, w3: r.w3 })),
        };
      });
      t.total = rows.reduce((x, r) => x + r.total, 0); t.delivered = rows.reduce((x, r) => x + r.delivered, 0);
      t.w2 = rows.reduce((x, r) => x + r.w2, 0); t.w3 = rows.reduce((x, r) => x + r.w3, 0);
      return t;
    });
  }, [data]);
  const rows = useMemo(() => trips.map((t) => ({ t, p: PCL_NET.tripPosition(t, today()) })), [trips]);
  const count = (st: TripState) => rows.filter((r) => r.p.state === st).length;
  const shown = rows.filter((r) => filter === "todos" || r.p.state === filter);
  const name = (d?: string | null) => PCL_NET.townOf(d)?.name ?? d ?? "—";
  const trucks: RoadTruck[] = shown.map(({ t, p }) => ({
    id: t.id, label: t.driver.split(" ")[0], state: p.state, x: p.x, y: p.y, angle: p.angle,
    sub: p.state === "entregado" ? "entregado" : p.at ? `en ${name(p.at)}` : `→ ${name(p.next?.district)}`,
  }));
  // Viaje elegido: su camino completo y sus paradas, resaltados en el mapa
  const chosen = rows.find((r) => r.t.id === sel)?.t ?? null;
  const stopIds = (chosen?.stops ?? []).map((s) => PCL_NET.townOf(s.district)?.id).filter(Boolean) as string[];
  const path = stopIds.reduce<string[]>((acc, id) => [...acc, ...PCL_NET.pathBetween(acc[acc.length - 1] ?? PCL_NET.origin, id)], [PCL_NET.origin]);
  const pickTruck = (id: number) => {
    setSel(id);
    setTimeout(() => document.getElementById(`viaje-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  if (!data) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="PCL · Camiones en ruta" sub="Dónde va cada camión por las carreteras desde Pucallpa y en qué estado está. Toca un camión para ver su viaje; en cada parada se marca «Entregar»." />

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
        <RoadScene map={PCL_MAP} hubTag="almacén" trucks={trucks} selected={sel} onPick={pickTruck} path={sel ? path : []} stops={stopIds} enapu={0} />
      </Card>

      <div className="flex flex-col gap-2">
        {shown.map(({ t }) => (
          <PclTripCard key={t.id} id={`viaje-${t.id}`} t={t} open={sel === t.id} onToggle={() => setSel(sel === t.id ? null : t.id)}
            canDeliver={data.canDeliver} onChanged={load} onDetail={() => { setDetailRows(null); setDetail(t); }} />
        ))}
        {!shown.length && <p className="rounded-2xl border border-dashed border-sb-outline-variant px-4 py-8 text-center text-xs text-sb-on-surface-variant">
          {rows.length ? "Ningún camión con ese estado." : "Todavía no hay camiones despachados desde Pucallpa."}
        </p>}
      </div>

      <Sheet open={!!detail} onClose={() => setDetail(null)} size="lg" icon={Truck} title={detail ? `Camión de ${detail.driver}` : ""} sub={detail?.plate ? `placa ${detail.plate}` : ""}>
        {detail && (detailRows ? <TruckView driver={detail.driver} plate={detail.plate} rows={detailRows} /> : <div className="h-40 animate-pulse rounded-2xl bg-sb-surface-container-low" />)}
      </Sheet>
    </div>
  );
}
