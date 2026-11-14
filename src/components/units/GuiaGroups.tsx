"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, Inbox, Ship } from "lucide-react";
import { Card } from "@/components/ui";
import { Mix, n } from "@/components/stage/StageKit";
import { SITE_INFO, STATUS_LABEL, STATUS_SHORT, fmtDate, type Site, type Status } from "@/lib/hsp";
import { daysBetween, parseISO, todayLima } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { MiniRoute } from "./MiniRoute";
import type { PanelUnit } from "./RoutePanel";

type Group = {
  guia: string; n: number; w2: number; w3: number; dealers: string | null; naves: string | null; billing: string | null; est: string | null;
  late: number; delivered: number; statuses: string[];
};

/** Columnas de cada guía: estado · guía/dealer · paso · nave · plazo · 2W/3W · total · flecha (celular: estado · guía · total · flecha) */
const COLS = "grid-cols-[0.5rem_minmax(0,1fr)_3.25rem_1rem] lg:grid-cols-[0.5rem_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_8.5rem_7rem_3.25rem_1rem]";

/** Unidades ya cargadas por guía: volver a abrir una guía es instantáneo */
const cache = new Map<string, PanelUnit[]>();
const unitsKey = (site: Site, guia: string, filters: string) => `${site}|${guia}|${filters}`;
function loadUnits(site: Site, guia: string, filters: string): Promise<PanelUnit[]> {
  const k = unitsKey(site, guia, filters);
  const hit = cache.get(k);
  if (hit) return Promise.resolve(hit);
  const p = new URLSearchParams(filters);
  for (const x of ["page", "size", "sort", "dir", "q"]) p.delete(x);
  p.set("site", site); p.set("q", guia); p.set("size", "200"); p.set("sort", "chassis"); p.set("dir", "asc");
  return fetch(`/api/units?${p}`).then((r) => r.json()).then((j) => {
    const list = (j.rows ?? []).filter((u: PanelUnit) => (u.guia ?? "") === guia);
    cache.set(k, list);
    return list;
  });
}

/** Unidades de una guía: chasis, modelo, recorrido por pasos, estado y plazo */
function GuiaUnits({ site, guia, filters, onOpenUnit }: { site: Site; guia: string; filters: string; onOpenUnit: (u: PanelUnit) => void }) {
  const [units, setUnits] = useState<PanelUnit[] | null>(() => cache.get(unitsKey(site, guia, filters)) ?? null);
  useEffect(() => {
    let alive = true;
    loadUnits(site, guia, filters).then((u) => alive && setUnits(u));
    return () => { alive = false; };
  }, [site, guia, filters]);
  if (!units) return <div className="flex flex-col gap-1 px-3 pb-3">{[0, 1, 2].map((i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-sb-surface-container-low" />)}</div>;
  return (
    <ul className="mx-3 mb-3 flex flex-col gap-0.5 border-l-2 border-sb-outline-variant/40 pl-2">
      {units.map((u) => {
        const late = u.service === "FUERA DE TIEMPO";
        return (
          <li key={u.id}>
            <button type="button" onClick={() => onOpenUnit(u)}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-sb-surface-container-low sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
              <span className="min-w-0">
                <span className="block truncate font-mono font-semibold">{u.chassis}</span>
                <span className="block truncate text-[11px] text-sb-on-surface-variant">{u.material ?? "—"} · {String(u.category ?? "—")}</span>
              </span>
              <span className="order-3 col-span-2 min-w-0 sm:order-none sm:col-span-1"><MiniRoute site={site} unit={u as never} /></span>
              <span className="text-right">
                <span className="block text-[11px] font-medium">{STATUS_SHORT[u.status as Status] ?? u.status}</span>
                <span className={cn("block text-[10px]", late ? "font-semibold text-sb-late" : "text-sb-on-surface-variant")}>{late ? (u.delay_reason ?? "Sin motivo") : `est. ${fmtDate(u.est_date) || "—"}`}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Vista «Por guía»: una fila por guía de remisión (todas sus motos viajan juntas): a qué dealer va, en qué paso está
 * (con su avance), en qué nave, cuánto falta o cuánto va tarde, cuántas motos y motokares. Se despliega para ver cada unidad.
 */
export function GuiaGroups({ site, filters, reload, onOpenUnit }: { site: Site; filters: string; reload: number; onOpenUnit: (u: PanelUnit) => void }) {
  const [data, setData] = useState<{ total: number; size: number; groups: Group[] } | null>(null);
  const [loaded, setLoaded] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [prev, setPrev] = useState(filters);
  const top = useRef<HTMLDivElement>(null);
  if (prev !== filters) { setPrev(filters); setPage(1); }
  useEffect(() => {
    let alive = true;
    const p = new URLSearchParams(filters);
    for (const k of ["page", "size", "sort", "dir"]) p.delete(k);
    p.set("site", site); p.set("page", String(page));
    const key = `${site}|${filters}|${page}|${reload}`;
    fetch(`/api/units/groups?${p}`).then((r) => r.json()).then((j) => { if (alive && !j.error) { setData(j); cache.clear(); } }).finally(() => alive && setLoaded(key));
    return () => { alive = false; };
  }, [site, filters, page, reload]);

  // Mientras llega lo nuevo se queda lo anterior (atenuado): no hay pantalla en blanco
  const busy = loaded !== `${site}|${filters}|${page}|${reload}`;
  if (!data) return <Card className="flex flex-col gap-1 p-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-[58px] animate-pulse rounded-xl bg-sb-surface-container-low" />)}</Card>;
  const pages = Math.max(1, Math.ceil(data.total / data.size));
  const toggle = (g: string) => setOpen((s) => { const y = new Set(s); if (y.has(g)) y.delete(g); else y.add(g); return y; });
  const go = (p: number) => { setPage(p); top.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const statuses = SITE_INFO[site].statuses as string[];
  const today = todayLima();
  const motos = data.groups.reduce((t, g) => t + g.n, 0), late = data.groups.reduce((t, g) => t + g.late, 0);

  return (
    <Card ref={top} className={cn("scroll-mt-4 overflow-hidden transition-opacity duration-200", busy && "opacity-70")}>
      {/* Resumen y leyenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-sb-outline-variant/40 px-4 py-3 text-[11px] text-sb-on-surface-variant">
        <span><b className="text-sm text-sb-on-surface tabular-nums">{n(data.total)}</b> guías{pages > 1 ? ` · página ${page} de ${pages}` : ""}</span>
        <span><b className="text-sb-on-surface tabular-nums">{n(motos)}</b> unidades en esta página</span>
        {late > 0 && <span className="font-semibold text-sb-late">{n(late)} fuera de tiempo</span>}
        <span className="ml-auto hidden items-center gap-3 sm:flex">
          <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-sb-ontime" />a tiempo</span>
          <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-sb-late" />con atraso</span>
          <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-sb-primary" />entregada</span>
        </span>
      </div>

      <div className="p-2 sm:p-3">
        {!!data.groups.length && (
          <div className={cn(COLS, "hidden gap-x-3 px-3 pb-2 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant lg:grid")}>
            <span /><span>Guía · dealer</span><span>Paso</span><span>Nave</span><span>Plazo</span><span>2W · 3W</span><span className="text-right">Total</span><span />
          </div>
        )}
        {!data.groups.length && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-sb-outline-variant/60 px-4 py-12 text-center text-xs text-sb-on-surface-variant">
            <Inbox className="h-5 w-5 opacity-50" />No hay guías con los filtros actuales.
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          {data.groups.map((g) => {
            const isOpen = open.has(g.guia);
            const done = g.delivered >= g.n;
            // Paso de la guía: el menos avanzado de sus unidades (lo que falta por mover)
            const idx = Math.min(...g.statuses.map((s) => statuses.indexOf(s)).filter((i) => i >= 0), statuses.length - 1);
            const st = statuses[idx] as Status | undefined;
            const pct = ((idx + 1) / statuses.length) * 100;
            const left = g.est ? daysBetween(today, parseISO(g.est.slice(0, 10))) : null;
            const tone = done ? "done" : g.late > 0 || (left !== null && left < 0) ? "late" : "ok";
            return (
              <div key={g.guia || "sin-guia"} className={cn("rounded-xl transition-colors duration-200", isOpen ? "bg-sb-surface-container-low" : "hover:bg-sb-surface-container-low")}>
                <button type="button" onClick={() => toggle(g.guia)} onMouseEnter={() => { loadUnits(site, g.guia, filters).catch(() => {}); }} aria-expanded={isOpen}
                  className={cn(COLS, "grid w-full items-center gap-x-3 gap-y-1 px-3 py-3 text-left")}>
                  <span className={cn("h-2 w-2 rounded-full", tone === "done" ? "bg-sb-primary" : tone === "late" ? "bg-sb-late" : "bg-sb-ontime")} />
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-sm font-semibold tracking-tight">{g.guia || "Sin guía"}</span>
                    <span className="block truncate text-[11px] text-sb-on-surface-variant" title={g.dealers ?? ""}>{g.dealers ?? "—"}</span>
                    {/* Celular: paso y plazo debajo */}
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 lg:hidden">
                      <span className="rounded-full bg-sb-surface-container px-2 py-0.5 text-[10px] font-medium">{st ? STATUS_LABEL[st] : "—"}</span>
                      {g.late > 0 && <span className="rounded-full bg-sb-late-soft px-2 py-0.5 text-[10px] font-semibold text-sb-late">{g.late} tarde</span>}
                    </span>
                  </span>
                  <span className="hidden min-w-0 lg:block">
                    <span className="block truncate text-xs font-medium">{st ? STATUS_LABEL[st] : "—"}{g.statuses.length > 1 && <span className="font-normal text-sb-on-surface-variant"> +{g.statuses.length - 1}</span>}</span>
                    <span className="mt-1 flex h-1 w-full max-w-[8rem] overflow-hidden rounded-full bg-sb-surface-container"><span className={cn("rounded-full", done ? "bg-sb-primary" : "bg-sb-on-surface/60")} style={{ width: `${pct}%` }} /></span>
                  </span>
                  <span className="hidden min-w-0 items-center gap-1 truncate text-[11px] text-sb-on-surface-variant lg:flex">{g.naves ? <><Ship className="h-3 w-3 shrink-0" /><span className="truncate">{g.naves}</span></> : "—"}</span>
                  <span className="hidden lg:block">
                    {done ? <span className="inline-flex rounded-full bg-sb-primary-soft px-2 py-0.5 text-[11px] font-semibold text-sb-primary">Entregada</span>
                      : g.late > 0 ? <span className="inline-flex rounded-full bg-sb-late-soft px-2 py-0.5 text-[11px] font-semibold text-sb-late">{g.late} fuera de tiempo</span>
                        : left !== null ? <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", left < 0 ? "bg-sb-late-soft text-sb-late" : "bg-sb-ontime-soft text-sb-ontime")}>{left < 0 ? `Vencida hace ${-left} d` : left === 0 ? "Vence hoy" : `Quedan ${left} d`}</span>
                          : <span className="text-[11px] text-sb-on-surface-variant">Sin plazo</span>}
                    <span className="mt-0.5 block truncate text-[10px] text-sb-on-surface-variant" title={`Facturada ${fmtDate(g.billing) || "—"}`}>estimada {fmtDate(g.est) || "—"}</span>
                  </span>
                  <span className="hidden lg:block"><Mix w2={g.w2} w3={g.w3} /></span>
                  <span className="text-right">
                    <span className="block text-sm font-semibold tabular-nums">{g.n}</span>
                    <span className="block text-[10px] text-sb-on-surface-variant">{g.delivered && !done ? `${g.delivered} entreg.` : "unid."}</span>
                  </span>
                  <ChevronDown className={cn("h-4 w-4 text-sb-on-surface-variant transition-transform duration-300", isOpen && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                      <GuiaUnits site={site} guia={g.guia} filters={filters} onOpenUnit={onOpenUnit} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-sb-outline-variant/40 px-4 py-2.5 text-xs text-sb-on-surface-variant">
          {n(data.total)} guías
          <Button isIconOnly size="sm" variant="tertiary" aria-label="Página anterior" isDisabled={page <= 1 || busy} onPress={() => go(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="font-medium tabular-nums text-sb-on-surface">{page} / {pages}</span>
          <Button isIconOnly size="sm" variant="tertiary" aria-label="Página siguiente" isDisabled={page >= pages || busy} onPress={() => go(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}
    </Card>
  );
}
