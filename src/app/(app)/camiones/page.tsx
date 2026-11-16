"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCheck, ChevronDown, Clock, MapPin, PackageCheck, Truck } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { Sheet } from "@/components/modal/Sheet";
import { Kind } from "@/components/Kinds";
import { TruckView, type TruckRow } from "@/components/despacho/TruckView";
import { DATA_EVENT } from "@/components/UploadCenter";
import { fmtDate } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { districtCompare } from "@/lib/zones";
import { cn } from "@/lib/cn";

/**
 * PCL · Camiones en ruta (como el de Yurimaguas): un mapa de salidas desde Pucallpa con cada camión donde va y del
 * color de su estado, y abajo cada viaje con su recorrido parada por parada (lo entregado con check, lo atrasado en
 * rojo) y su vista «Detallado» del camión. La entrega la registra el conductor en su página.
 */
type Stop = { id: number; dispatched_on: string; driver: string; plate: string | null; district: string | null; department: string | null;
  total: number; delivered: number; delivered_on: string | null; est: string | null; w2: number; w3: number; guias: number; dealers: string | null };
type State = "camino" | "parada" | "atrasado" | "entregado";
const LABEL: Record<State, string> = { camino: "En camino", parada: "Entregando", atrasado: "Atrasado", entregado: "Entregado" };
const COLOR: Record<State, string> = { camino: "#3b82f6", parada: "#e2922a", atrasado: "var(--sb-late)", entregado: "var(--sb-primary)" };
const FILTERS: (State | "todos")[] = ["todos", "camino", "parada", "atrasado", "entregado"];
const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");
const nice = (s: string | null) => (s ?? "—").toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());

export default function PclCamionesPage() {
  const [data, setData] = useState<{ canDeliver: boolean; rows: Stop[] } | null>(null);
  const [filter, setFilter] = useState<State | "todos">("todos");
  const [open, setOpen] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ id: number; driver: string; plate: string | null } | null>(null);
  const [detailRows, setDetailRows] = useState<TruckRow[] | null>(null);
  const load = useCallback(() => { fetch("/api/despacho?site=PCL&route=1").then((r) => r.json()).then((j) => setData({ canDeliver: !!j.canDeliver, rows: j.rows ?? [] })).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { window.addEventListener(DATA_EVENT, load); return () => window.removeEventListener(DATA_EVENT, load); }, [load]);
  useEffect(() => {
    if (!detail) return;
    fetch(`/api/despacho?site=PCL&trip=${detail.id}`).then((r) => r.json()).then((j) => setDetailRows(j.rows ?? []));
  }, [detail]);

  // Viajes con sus paradas en el orden de la ruta, y su estado
  const trips = useMemo(() => {
    const now = today();
    const m = new Map<number, { id: number; driver: string; plate: string | null; dispatched_on: string; stops: Stop[] }>();
    for (const r of data?.rows ?? []) {
      const t = m.get(r.id) ?? { id: r.id, driver: r.driver, plate: r.plate, dispatched_on: r.dispatched_on, stops: [] };
      t.stops.push(r); m.set(r.id, t);
    }
    return [...m.values()].map((t) => {
      t.stops.sort((a, b) => districtCompare(a.district ?? "", b.district ?? ""));
      const total = t.stops.reduce((x, s) => x + s.total, 0), delivered = t.stops.reduce((x, s) => x + s.delivered, 0);
      const late = t.stops.some((s) => s.delivered < s.total && s.est && String(s.est).slice(0, 10) < now);
      const done = t.stops.filter((s) => s.delivered >= s.total).length;
      const state: State = delivered >= total ? "entregado" : late ? "atrasado" : done > 0 || delivered > 0 ? "parada" : "camino";
      return { ...t, total, delivered, done, state, w2: t.stops.reduce((x, s) => x + s.w2, 0), w3: t.stops.reduce((x, s) => x + s.w3, 0) };
    });
  }, [data]);
  const count = (st: State) => trips.filter((t) => t.state === st).length;
  const shown = trips.filter((t) => filter === "todos" || t.state === filter);

  // Mapa de salidas: Pucallpa a la izquierda y cada distrito de destino en abanico
  const map = useMemo(() => {
    const dists = [...new Set(shown.flatMap((t) => t.stops.map((s) => s.district ?? "—")))].sort(districtCompare);
    const O = { x: 92, y: 190 };
    const nodes = new Map(dists.map((d, i) => {
      const a = dists.length === 1 ? 0 : (-62 + (124 * i) / (dists.length - 1)) * (Math.PI / 180);
      return [d, { x: O.x + 120 + 440 * Math.cos(a), y: O.y + 160 * Math.sin(a) / Math.sin(62 * Math.PI / 180) }];
    }));
    const slot = new Map<string, number>();
    const trucks = shown.map((t) => {
      const lastDone = [...t.stops].reverse().find((s) => s.delivered > 0);
      const first = nodes.get(t.stops[0]?.district ?? "—") ?? O;
      let p = { x: O.x + (first.x - O.x) * 0.55, y: O.y + (first.y - O.y) * 0.55 };
      if (t.state === "entregado") p = nodes.get(t.stops.at(-1)?.district ?? "—") ?? p;
      else if (lastDone) {
        const at = nodes.get(lastDone.district ?? "—") ?? p;
        const next = t.stops.find((s) => s.delivered < s.total);
        const to = next ? nodes.get(next.district ?? "—") ?? at : at;
        p = { x: at.x + (to.x - at.x) * 0.4, y: at.y + (to.y - at.y) * 0.4 };
      }
      const k = `${Math.round(p.x / 20)}|${Math.round(p.y / 20)}`, i = slot.get(k) ?? 0; slot.set(k, i + 1);
      return { t, x: p.x, y: p.y - i * 18 };
    });
    return { O, nodes, trucks };
  }, [shown]);

  if (!data) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="PCL · Camiones en ruta" sub="Dónde va cada camión que salió de Pucallpa y en qué estado está. Toca un camión para ver su recorrido; la entrega la registra el conductor en su página." />

      <div className="flex gap-2 overflow-x-auto pb-1 scroll-hidden">
        {FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
            className={cn("sb-pill flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-left transition-colors", filter === f ? "border-sb-primary bg-sb-primary-soft" : "border-sb-outline-variant/60 bg-sb-surface")}>
            {f !== "todos" && <i className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[f] }} />}
            <span className="flex flex-col leading-tight">
              <b className="text-lg tabular-nums">{f === "todos" ? trips.length : count(f)}</b>
              <span className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant">{f === "todos" ? "Camiones" : LABEL[f]}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Mapa de salidas desde Pucallpa */}
      <Card className="overflow-x-auto p-2 sm:p-3">
        <svg viewBox="0 0 800 380" className="mx-auto block w-full min-w-[560px] max-w-[1000px]" role="img" aria-label="Camiones en ruta desde Pucallpa">
          <defs>
            <radialGradient id="pcl-glow"><stop offset="0" stopColor="var(--sb-primary)" stopOpacity=".25" /><stop offset="1" stopColor="var(--sb-primary)" stopOpacity="0" /></radialGradient>
          </defs>
          {[...map.nodes.entries()].map(([d, p]) => (
            <path key={d} d={`M${map.O.x},${map.O.y} Q${(map.O.x + p.x) / 2},${map.O.y + (p.y - map.O.y) * 0.2} ${p.x},${p.y}`} fill="none"
              stroke="currentColor" strokeOpacity=".16" strokeWidth="2.5" strokeDasharray="1 7" strokeLinecap="round" className="text-sb-on-surface" />
          ))}
          <circle cx={map.O.x} cy={map.O.y} r="46" fill="url(#pcl-glow)" />
          <circle cx={map.O.x} cy={map.O.y} r="11" fill="var(--sb-primary)" />
          <text x={map.O.x} y={map.O.y + 32} textAnchor="middle" className="fill-sb-on-surface text-[13px] font-semibold">Pucallpa</text>
          <text x={map.O.x} y={map.O.y + 46} textAnchor="middle" className="fill-sb-on-surface-variant text-[10px]">almacén</text>
          {[...map.nodes.entries()].map(([d, p]) => (
            <g key={d}>
              <circle cx={p.x} cy={p.y} r="6.5" className="fill-sb-surface" stroke="currentColor" strokeOpacity=".5" strokeWidth="2" />
              <text x={p.x + 12} y={p.y + 4} className="fill-sb-on-surface text-[11px] font-semibold">{nice(d)}</text>
            </g>
          ))}
          {map.trucks.map(({ t, x, y }) => (
            <g key={t.id} transform={`translate(${x},${y})`} className="cursor-pointer" onClick={() => { setOpen(t.id); setTimeout(() => document.getElementById(`viaje-${t.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }}>
              <rect x="-34" y="-11" width="68" height="22" rx="11" fill={COLOR[t.state]} stroke={open === t.id ? "currentColor" : "none"} strokeWidth="2" className="text-sb-on-surface" />
              <text y="4" textAnchor="middle" className="fill-white text-[10.5px] font-bold">{t.driver.split(" ")[0].slice(0, 9)}</text>
            </g>
          ))}
          {!map.trucks.length && <text x="400" y="190" textAnchor="middle" className="fill-sb-on-surface-variant text-[13px]">No hay camiones con ese estado.</text>}
        </svg>
      </Card>

      {/* Cada viaje con su recorrido */}
      <div className="flex flex-col gap-2">
        {shown.map((t) => {
          const isOpen = open === t.id;
          return (
            <Card key={t.id} id={`viaje-${t.id}`} className="scroll-mt-4 overflow-hidden">
              <button type="button" onClick={() => setOpen(isOpen ? null : t.id)} aria-expanded={isOpen}
                className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left sm:grid-cols-[2.5rem_minmax(0,1fr)_10rem_7rem_1.25rem]">
                <span className="grid h-10 w-10 place-items-center rounded-2xl text-white" style={{ background: COLOR[t.state] }}>
                  {t.state === "entregado" ? <CheckCheck className="h-5 w-5" /> : <Truck className="h-5 w-5" />}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                    {t.driver}{t.plate && <span className="rounded-md bg-sb-surface-container px-1.5 py-0.5 font-mono text-[10px] font-normal text-sb-on-surface-variant">{t.plate}</span>}
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: COLOR[t.state] }}>{LABEL[t.state]}</span>
                  </span>
                  <span className="block truncate text-[11px] text-sb-on-surface-variant">Salió {fmtDate(t.dispatched_on)} · {t.stops.map((s) => nice(s.district)).join(" → ")}</span>
                </span>
                <span className="hidden sm:block">
                  <span className="flex h-1.5 overflow-hidden rounded-full bg-sb-surface-container"><span className="transition-[width] duration-500" style={{ width: `${t.total ? (t.delivered / t.total) * 100 : 0}%`, background: COLOR[t.state] }} /></span>
                  <span className="mt-1 block text-[10px] tabular-nums text-sb-on-surface-variant">{n(t.delivered)} de {n(t.total)} entregadas · {t.done}/{t.stops.length} paradas</span>
                </span>
                <span className="text-right"><span className="block text-sm font-semibold tabular-nums">{n(t.total)}</span><span className="block text-[10px] text-sb-on-surface-variant">unid.</span></span>
                <ChevronDown className={cn("hidden h-4 w-4 text-sb-on-surface-variant transition-transform sm:block", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="border-t border-sb-outline-variant/40 px-4 py-3">
                  {/* Recorrido: Pucallpa → paradas */}
                  <ol className="flex gap-2 overflow-x-auto pb-2 scroll-hidden">
                    <li className="flex shrink-0 items-center gap-2 rounded-2xl bg-sb-primary-soft px-3 py-2 text-xs font-semibold text-sb-primary"><MapPin className="h-3.5 w-3.5" />Pucallpa</li>
                    {t.stops.map((s, i) => {
                      const done = s.delivered >= s.total, late = !done && !!s.est && String(s.est).slice(0, 10) < today();
                      return (
                        <li key={`${s.district}-${i}`} className={cn("flex min-w-[11rem] shrink-0 flex-col gap-1 rounded-2xl border px-3 py-2",
                          done ? "border-sb-primary/40 bg-sb-primary-soft/60" : late ? "border-sb-late/40 bg-sb-late-soft/50" : "border-sb-outline-variant/60 bg-sb-surface-container-low")}>
                          <span className="flex items-center gap-1.5 text-xs font-semibold">
                            <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white", done ? "bg-sb-primary" : late ? "bg-sb-late" : "bg-sb-on-surface-variant/60")}>{done ? <CheckCheck className="h-3 w-3" /> : i + 1}</span>
                            {nice(s.district)}
                          </span>
                          <span className="truncate text-[10px] text-sb-on-surface-variant" title={s.dealers ?? ""}>{s.guias} {s.guias === 1 ? "guía" : "guías"} · {s.dealers ?? "—"}</span>
                          <span className="flex flex-wrap items-center gap-1">{(s.w2 > 0 || !s.w3) && <Kind v={s.w2} k="w2" />}{s.w3 > 0 && <Kind v={s.w3} k="w3" short />}</span>
                          <span className={cn("flex items-center gap-1 text-[10px] font-semibold", done ? "text-sb-primary" : late ? "text-sb-late" : "text-sb-on-surface-variant")}>
                            {done ? <><PackageCheck className="h-3 w-3" />Entregado {fmtDate(s.delivered_on)}</> : <><Clock className="h-3 w-3" />{late ? "Vencido" : "Vence"} {s.est ? fmtDate(s.est) : "—"} · {n(s.delivered)}/{n(s.total)}</>}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="flex flex-wrap gap-1">{(t.w2 > 0 || !t.w3) && <Kind v={t.w2} k="w2" />}{t.w3 > 0 && <Kind v={t.w3} k="w3" short />}</span>
                    <span className="ml-auto flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setDetailRows(null); setDetail({ id: t.id, driver: t.driver, plate: t.plate }); }}
                        className="sb-pill flex items-center gap-1.5 rounded-full border border-sb-outline-variant px-3 py-1.5 text-xs font-semibold hover:border-sb-primary"><Truck className="h-3.5 w-3.5" />Detallado</button>
                      {data.canDeliver && t.state !== "entregado" && (
                        <Link href="/conductor" className="sb-pill flex items-center gap-1.5 rounded-full bg-sb-primary px-3 py-1.5 text-xs font-semibold text-sb-on-primary"><PackageCheck className="h-3.5 w-3.5" />Registrar entrega</Link>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {!shown.length && <p className="rounded-2xl border border-dashed border-sb-outline-variant px-4 py-8 text-center text-xs text-sb-on-surface-variant">{trips.length ? "Ningún camión con ese estado." : "Todavía no hay camiones despachados desde Pucallpa."}</p>}
      </div>

      <Sheet open={!!detail} onClose={() => setDetail(null)} size="lg" icon={Truck} title={detail ? `Camión de ${detail.driver}` : ""} sub={detail?.plate ? `placa ${detail.plate}` : ""}>
        {detail && (detailRows ? <TruckView driver={detail.driver} plate={detail.plate} rows={detailRows} /> : <div className="h-40 animate-pulse rounded-2xl bg-sb-surface-container-low" />)}
      </Sheet>
    </div>
  );
}
