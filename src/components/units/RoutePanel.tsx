"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button, Drawer } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, MapPin, Search, Ship, ShieldAlert } from "lucide-react";
import { STATUS_LABEL, fmtDate, unitsOf, type Site, type Status } from "@/lib/hsp";
import { cn } from "@/lib/cn";
import type { FlowData, Pick } from "@/components/figures/route/RouteFlow";
import { MiniRoute } from "./MiniRoute";

export type PanelUnit = Record<string, unknown> & { id: number; chassis: string; guia?: string | null; dealer?: string | null; material?: string | null; service?: string | null; est_date?: string | null; delay_reason?: string | null; status: string };

/** Pantalla chica: el panel sale desde abajo; grande, desde la derecha */
const useNarrow = () => useSyncExternalStore(
  (cb) => { const m = matchMedia("(max-width: 767px)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
  () => matchMedia("(max-width: 767px)").matches, () => false,
);

/**
 * Detalle de una estación o nave de la ruta: sus unidades agrupadas por guía de remisión.
 * Toca una unidad para abrir su detalle (y registrar o corregir fechas, según el rol).
 */
export function RoutePanel({ site, pick, flow, filters, onClose, onOpenUnit }: {
  site: Site; pick: Pick | null; flow: FlowData | null; filters: string; onClose: () => void; onOpenUnit: (u: PanelUnit) => void;
}) {
  const narrow = useNarrow();
  const [units, setUnits] = useState<PanelUnit[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const key = pick ? (pick.kind === "nave" ? `n:${pick.nave}` : `s:${pick.status}`) : "";

  useEffect(() => {
    if (!pick) return;
    let alive = true;
    const p = new URLSearchParams(filters);
    for (const k of ["status", "page", "size", "sort", "dir", "nave"]) p.delete(k);
    p.set("site", site); p.set("status", pick.status); p.set("size", "200"); p.set("sort", "guia"); p.set("dir", "asc");
    if (pick.kind === "nave") p.set("nave", pick.nave);
    fetch(`/api/units?${p}`).then((r) => r.json()).then((j) => { if (alive) { setUnits(j.rows ?? []); setOpen(new Set()); } }).catch(() => alive && setUnits([]));
    return () => { alive = false; setUnits(null); };
  }, [key, filters, site]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const m = new Map<string, PanelUnit[]>();
    for (const u of units ?? []) { const g = (u.guia as string) || "Sin guía"; m.set(g, [...(m.get(g) ?? []), u]); }
    return [...m.entries()];
  }, [units]);

  const stats = pick?.kind === "stage" ? flow?.stages[pick.status] : null;
  const nave = pick?.kind === "nave" ? flow?.naves.find((x) => x.nave === pick.nave && x.status === pick.status) : null;
  const title = pick ? (pick.kind === "nave" ? `Nave ${pick.nave}` : STATUS_LABEL[pick.status as Status] ?? pick.status) : "";
  const toggle = (g: string) => setOpen((s) => { const y = new Set(s); if (y.has(g)) y.delete(g); else y.add(g); return y; });
  const allOpen = groups.length <= 2;
  const [q, setQ] = useState("");
  const shown = q.trim() ? groups.filter(([g, list]) => `${g} ${list.map((u) => u.dealer).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())) : groups;
  const w2 = (units ?? []).filter((u) => u.category === "2W").length, w3 = (units ?? []).filter((u) => u.category === "3W").length;
  const total = units ? units.length : stats?.n ?? nave?.n ?? 0;
  const late = stats?.late ?? nave?.late ?? 0, soon = stats?.soon ?? 0, noReason = stats?.noReason ?? 0;
  const maxGroup = Math.max(1, ...groups.map(([, l]) => l.length));

  return (
    <Drawer>
      <Drawer.Backdrop isOpen={!!pick} onOpenChange={(o) => !o && onClose()}>
        <Drawer.Content placement={narrow ? "bottom" : "right"}>
          <Drawer.Dialog className={cn(narrow ? "max-h-[88dvh]" : "w-[460px] max-w-[92vw]")}>
            <Drawer.CloseTrigger aria-label="Cerrar" />
            <Drawer.Header className="flex flex-col gap-3 pr-10">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sb-primary-soft text-sb-primary">
                  {pick?.kind === "nave" ? <Ship className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-sb-on-surface-variant">{pick?.kind === "nave" ? "Nave" : "Estación de la ruta"} · {site === "PCL" ? "Pucallpa" : "Yurimaguas"}</p>
                  <Drawer.Heading className="truncate text-[17px] font-semibold tracking-tight">{title}</Drawer.Heading>
                </div>
              </div>
              {/* Resumen: unidades, motos y motokares, guías */}
              <div className="rounded-2xl bg-sb-surface-container-low p-3.5">
                <div className="flex items-end justify-between gap-3">
                  <span className="flex flex-col leading-tight">
                    <b className="text-[22px] tabular-nums tracking-tight">{total.toLocaleString("es-PE")}</b>
                    <span className="text-[11px] text-sb-on-surface-variant">{total === 1 ? "unidad" : "unidades"} · {groups.length} {groups.length === 1 ? "guía" : "guías"}</span>
                  </span>
                  {units && (
                    <span className="flex gap-3 text-[11.5px] tabular-nums">
                      <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-sb-primary" />{w2} motos</span>
                      <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-sb-primary/40" />{w3} motokares</span>
                    </span>
                  )}
                </div>
                {units && total > 0 && (
                  <span className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-sb-surface-container-high">
                    <motion.span className="h-full bg-sb-primary" initial={{ width: 0 }} animate={{ width: `${(w2 / total) * 100}%` }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />
                    <motion.span className="h-full bg-sb-primary/40" initial={{ width: 0 }} animate={{ width: `${(w3 / total) * 100}%` }} transition={{ duration: 0.5, delay: 0.06, ease: [0.22, 1, 0.36, 1] }} />
                  </span>
                )}
                {nave && <p className="mt-2 text-[11.5px] text-sb-on-surface-variant">{nave.status === "TRANSITO FLUVIAL" ? `Zarpó el ${fmtDate(nave.since)} · día ${nave.days} de viaje` : `Cargando desde el ${fmtDate(nave.since)}`}</p>}
              </div>
              {/* Alertas: solo las que hay */}
              {late + soon + noReason > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  <Alert n={late} label="fuera de tiempo" tone="late" icon={AlertTriangle} />
                  <Alert n={soon} label="por vencer" tone="warn" icon={Clock} />
                  <Alert n={noReason} label="sin motivo" tone="late" icon={ShieldAlert} />
                </div>
              ) : units && units.length > 0 ? (
                <p className="flex items-center gap-2 rounded-2xl bg-sb-ontime-soft/60 px-3 py-2 text-[12px] font-medium"><CheckCircle2 className="h-4 w-4 text-sb-ontime" /> Todo a tiempo en este punto</p>
              ) : null}
              {groups.length > 5 && (
                <label className="flex h-10 items-center gap-2 rounded-full bg-sb-surface-container px-3.5 text-[13px]">
                  <Search className="h-4 w-4 shrink-0 text-sb-on-surface-variant" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar guía o dealer…" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-sb-on-surface-variant/60" />
                </label>
              )}
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-2 pt-1">
              {!units ? (
                <div className="flex flex-col gap-2" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[62px] shrink-0 animate-pulse rounded-2xl bg-sb-surface-container-low" />)}</div>
              ) : !units.length ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-sb-surface-container text-sb-on-surface-variant"><MapPin className="h-5 w-5" /></span>
                  <b className="text-[14px]">Sin unidades aquí</b>
                  <p className="max-w-xs text-[12.5px] text-sb-on-surface-variant">No hay unidades en este punto con los filtros actuales.</p>
                </div>
              ) : shown.map(([g, list], gi) => {
                const isOpen = allOpen || open.has(g);
                const lateN = list.filter((u) => u.service === "FUERA DE TIEMPO").length;
                const dealers = [...new Set(list.map((u) => u.dealer).filter(Boolean))] as string[];
                const g2 = list.filter((u) => u.category === "2W").length;
                return (
                  <motion.div key={g} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(gi, 8) * 0.03, ease: [0.22, 1, 0.36, 1] }}
                    className={cn("shrink-0 overflow-hidden rounded-2xl transition-colors", isOpen ? "bg-sb-surface-container-low" : "bg-sb-surface ring-1 ring-sb-outline-variant/70 hover:bg-sb-surface-container-low")}>
                    <button type="button" onClick={() => toggle(g)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sb-surface-container text-[11px] font-bold text-sb-on-surface-variant">{initials(dealers[0])}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[13px] font-semibold">{g}</span>
                        <span className="block truncate text-[11.5px] text-sb-on-surface-variant">{dealers.map(nice).join(" · ") || "Sin dealer"}</span>
                        <span className="mt-1.5 flex h-1 w-full max-w-[9rem] overflow-hidden rounded-full bg-sb-surface-container-high">
                          <span className="h-full bg-sb-primary" style={{ width: `${(g2 / maxGroup) * 100}%` }} />
                          <span className="h-full bg-sb-primary/40" style={{ width: `${((list.length - g2) / maxGroup) * 100}%` }} />
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <b className="text-[12.5px]">{unitsOf(list as { category?: string | null }[])}</b>
                        {lateN > 0 && <span className="rounded-full bg-sb-late-soft px-2 py-px text-[10px] font-semibold text-sb-late">{lateN} tarde</span>}
                      </span>
                      <ChevronDown className={cn("h-4 w-4 shrink-0 text-sb-on-surface-variant transition-transform duration-300", isOpen && "rotate-180")} />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden px-2 pb-2">
                          {list.map((u) => (
                            <li key={u.id}>
                              <button type="button" onClick={() => onOpenUnit(u)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-sb-surface">
                                <span className={cn("shrink-0 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold", u.category === "3W" ? "bg-sb-primary/15 text-sb-primary" : "bg-sb-surface-container-high text-sb-on-surface")}>
                                  {u.category === "3W" ? "Motokar" : u.category === "2W" ? "Moto" : "—"}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-mono text-[12px] font-semibold">{u.chassis}</span>
                                  <span className="block truncate text-[11px] text-sb-on-surface-variant">{u.material ?? "—"} · estimada {fmtDate(u.est_date) || "—"}</span>
                                  <MiniRoute site={site} unit={u as never} className="mt-1" />
                                </span>
                                {u.service === "FUERA DE TIEMPO"
                                  ? <span className="flex max-w-[7rem] shrink-0 items-center gap-1 truncate rounded-full bg-sb-late-soft px-2 py-0.5 text-[10px] font-semibold text-sb-late"><AlertTriangle className="h-3 w-3 shrink-0" />{u.delay_reason ?? "Sin motivo"}</span>
                                  : <span className="flex shrink-0 items-center gap-1 rounded-full bg-sb-ontime-soft px-2 py-0.5 text-[10px] font-semibold text-sb-ontime"><CheckCircle2 className="h-3 w-3" />A tiempo</span>}
                              </button>
                            </li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
              {units && units.length > 0 && !shown.length && <p className="py-8 text-center text-[12.5px] text-sb-on-surface-variant">Ninguna guía coincide con «{q}».</p>}
            </Drawer.Body>
            <Drawer.Footer>
              <Button variant="secondary" className="w-full rounded-full" onPress={onClose}>Cerrar</Button>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

/** Aviso del encabezado: número grande y su etiqueta; apagado si es cero */
function Alert({ n, label, tone, icon: Icon }: { n: number; label: string; tone: "late" | "warn"; icon: typeof Clock }) {
  return (
    <span className={cn("flex flex-col gap-0.5 rounded-2xl px-3 py-2", n === 0 ? "bg-sb-surface-container-low opacity-50" : tone === "late" ? "bg-sb-late-soft/70" : "bg-amber-500/12")}>
      <Icon className={cn("h-3.5 w-3.5", n === 0 ? "text-sb-on-surface-variant" : tone === "late" ? "text-sb-late" : "text-amber-600 dark:text-amber-400")} />
      <b className="text-[16px] leading-none tabular-nums">{n}</b>
      <span className="text-[10.5px] leading-tight text-sb-on-surface-variant">{label}</span>
    </span>
  );
}

/** «MOTOCORP DE LA SELVA JAEN» → «Motocorp De La Selva Jaen»; iniciales para el avatar */
const SMALL = new Set(["de", "la", "del", "las", "los", "y", "e"]);
const nice = (s: string) => s.toLowerCase().replace(/(^|[\s(.-])(\p{L}+)/gu, (m, a: string, w: string) => a + (a && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1)));
const initials = (s?: string) => (s ?? "?").replace(/[^\p{L}\s]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
