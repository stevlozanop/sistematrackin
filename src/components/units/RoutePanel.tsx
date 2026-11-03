"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button, Chip, Drawer, Spinner } from "@heroui/react";
import { AlertTriangle, ChevronDown, Clock, Ship } from "lucide-react";
import { STATUS_LABEL, fmtDate, type Site, type Status } from "@/lib/hsp";
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
  const allOpen = groups.length <= 3;

  return (
    <Drawer>
      <Drawer.Backdrop isOpen={!!pick} onOpenChange={(o) => !o && onClose()}>
        <Drawer.Content placement={narrow ? "bottom" : "right"}>
          <Drawer.Dialog className={cn(narrow ? "max-h-[85dvh]" : "w-[440px] max-w-[92vw]")}>
            <Drawer.CloseTrigger aria-label="Cerrar" />
            <Drawer.Header className="flex flex-col gap-2">
              <Drawer.Heading className="flex items-center gap-2">{pick?.kind === "nave" && <Ship className="h-4 w-4" />}{title}</Drawer.Heading>
              <div className="flex flex-wrap gap-1.5">
                <Chip size="sm" variant="soft">{(units?.length ?? stats?.n ?? nave?.n ?? 0).toLocaleString()} motos</Chip>
                <Chip size="sm" variant="soft">{groups.length} guías</Chip>
                {(stats?.late ?? nave?.late ?? 0) > 0 && <Chip size="sm" color="danger" variant="soft">{stats?.late ?? nave?.late} fuera de tiempo</Chip>}
                {(stats?.soon ?? 0) > 0 && <Chip size="sm" color="warning" variant="soft">{stats?.soon} por vencer</Chip>}
                {(stats?.noReason ?? 0) > 0 && <Chip size="sm" color="danger" variant="secondary">{stats?.noReason} sin motivo</Chip>}
                {nave && <Chip size="sm" variant="soft">{nave.status === "TRANSITO FLUVIAL" ? `Zarpó ${fmtDate(nave.since)} · día ${nave.days}` : `Cargando desde ${fmtDate(nave.since)}`}</Chip>}
              </div>
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-2">
              {!units ? <div className="grid place-items-center py-10"><Spinner /></div>
                : !units.length ? <p className="py-10 text-center text-sm text-sb-on-surface-variant">No hay motos en este punto con los filtros actuales.</p>
                : groups.map(([g, list]) => {
                  const isOpen = allOpen || open.has(g);
                  const late = list.filter((u) => u.service === "FUERA DE TIEMPO").length;
                  return (
                    <div key={g} className="rounded-xl border border-sb-outline-variant/60">
                      <button type="button" onClick={() => toggle(g)} aria-expanded={isOpen} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-sm font-semibold">{g}</span>
                          <span className="block truncate text-[11px] text-sb-on-surface-variant">{[...new Set(list.map((u) => u.dealer).filter(Boolean))].join(" · ") || "—"}</span>
                        </span>
                        <span className="shrink-0 text-right text-xs"><b>{list.length}</b> motos{late > 0 && <span className="block text-[10px] font-semibold text-sb-late">{late} tarde</span>}</span>
                        <ChevronDown className={cn("h-4 w-4 shrink-0 text-sb-on-surface-variant transition-transform", isOpen && "rotate-180")} />
                      </button>
                      {isOpen && (
                        <ul className="border-t border-sb-outline-variant/40">
                          {list.map((u) => (
                            <li key={u.id}>
                              <button type="button" onClick={() => onOpenUnit(u)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs transition-colors hover:bg-sb-surface-container-low">
                                <span className="min-w-0 flex-1">
                                  <span className="block font-mono font-semibold">{u.chassis}</span>
                                  <span className="block truncate text-[11px] text-sb-on-surface-variant">{u.material ?? "—"} · est. {fmtDate(u.est_date) || "—"}</span>
                                  <MiniRoute site={site} unit={u as never} className="mt-1" />
                                </span>
                                {u.service === "FUERA DE TIEMPO"
                                  ? <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-sb-late"><AlertTriangle className="h-3 w-3" />{u.delay_reason ?? "Sin motivo"}</span>
                                  : <span className="flex shrink-0 items-center gap-1 text-[10px] text-sb-on-surface-variant"><Clock className="h-3 w-3" />A tiempo</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
            </Drawer.Body>
            <Drawer.Footer>
              <Button variant="secondary" className="w-full" onPress={onClose}>Cerrar</Button>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
