"use client";
import { useEffect, useState } from "react";
import { Button, Chip, Spinner } from "@heroui/react";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, FileStack, Ship } from "lucide-react";
import { Card } from "@/components/ui";
import { STATUS_LABEL, fmtDate, type Site, type Status } from "@/lib/hsp";
import { cn } from "@/lib/cn";
import { MiniRoute } from "./MiniRoute";
import type { PanelUnit } from "./RoutePanel";

type Group = {
  guia: string; n: number; w2: number; w3: number; dealers: string | null; naves: string | null; billing: string | null; est: string | null;
  late: number; delivered: number; statuses: string[];
};

/** Unidades de una guía (se cargan al abrirla) */
function GuiaUnits({ site, guia, filters, onOpenUnit }: { site: Site; guia: string; filters: string; onOpenUnit: (u: PanelUnit) => void }) {
  const [units, setUnits] = useState<PanelUnit[] | null>(null);
  useEffect(() => {
    let alive = true;
    const p = new URLSearchParams(filters);
    for (const k of ["page", "size", "sort", "dir", "q"]) p.delete(k);
    p.set("site", site); p.set("q", guia); p.set("size", "200"); p.set("sort", "chassis"); p.set("dir", "asc");
    fetch(`/api/units?${p}`).then((r) => r.json()).then((j) => alive && setUnits((j.rows ?? []).filter((u: PanelUnit) => (u.guia ?? "") === guia)));
    return () => { alive = false; };
  }, [site, guia, filters]);
  if (!units) return <div className="grid place-items-center py-6"><Spinner size="sm" /></div>;
  return (
    <ul className="divide-y divide-sb-outline-variant/30 border-t border-sb-outline-variant/40">
      {units.map((u) => (
        <li key={u.id}>
          <button type="button" onClick={() => onOpenUnit(u)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left text-xs transition-colors hover:bg-sb-surface-container-low">
            <span className="min-w-[10rem]">
              <span className="block font-mono font-semibold">{u.chassis}</span>
              <span className="block text-[11px] text-sb-on-surface-variant">{u.material ?? "—"}</span>
            </span>
            <MiniRoute site={site} unit={u as never} />
            <span className="ml-auto text-[11px] text-sb-on-surface-variant">{STATUS_LABEL[u.status as Status] ?? u.status} · est. {fmtDate(u.est_date) || "—"}</span>
            {u.service === "FUERA DE TIEMPO" && <Chip size="sm" color="danger" variant="soft">{u.delay_reason ?? "Sin motivo"}</Chip>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Vista «Por guía»: una tarjeta por guía de remisión (todas sus motos viajan juntas),
 * con cuántas son, a qué dealer van, en qué paso están y cuántas van tarde. Se abre para ver cada unidad.
 */
export function GuiaGroups({ site, filters, reload, onOpenUnit }: { site: Site; filters: string; reload: number; onOpenUnit: (u: PanelUnit) => void }) {
  const [data, setData] = useState<{ total: number; size: number; groups: Group[] } | null>(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [prev, setPrev] = useState(filters);
  if (prev !== filters) { setPrev(filters); setPage(1); }
  useEffect(() => {
    let alive = true;
    const p = new URLSearchParams(filters);
    for (const k of ["page", "size", "sort", "dir"]) p.delete(k);
    p.set("site", site); p.set("page", String(page));
    fetch(`/api/units/groups?${p}`).then((r) => r.json()).then((j) => alive && !j.error && setData(j));
    return () => { alive = false; };
  }, [site, filters, page, reload]);
  if (!data) return <Card className="grid place-items-center py-12"><Spinner /></Card>;
  const pages = Math.max(1, Math.ceil(data.total / data.size));
  const toggle = (g: string) => setOpen((s) => { const y = new Set(s); if (y.has(g)) y.delete(g); else y.add(g); return y; });

  return (
    <div className="flex flex-col gap-2">
      {!data.groups.length && <Card className="px-4 py-10 text-center text-sm text-sb-on-surface-variant">No hay guías con los filtros actuales.</Card>}
      {data.groups.map((g) => {
        const isOpen = open.has(g.guia);
        const steps = g.statuses.map((s) => STATUS_LABEL[s as Status] ?? s);
        return (
          <Card key={g.guia || "sin-guia"} className="overflow-hidden">
            <button type="button" onClick={() => toggle(g.guia)} aria-expanded={isOpen} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left">
              <span className="flex min-w-[12rem] flex-1 items-start gap-3">
                <FileStack className="mt-0.5 h-4 w-4 shrink-0 text-sb-on-surface-variant" />
                <span className="min-w-0">
                  <span className="block font-mono text-sm font-semibold">{g.guia || "Sin guía"}</span>
                  <span className="block truncate text-xs text-sb-on-surface-variant">{g.dealers ?? "—"}</span>
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                {steps.slice(0, 2).map((s) => <Chip key={s} size="sm" variant="soft">{s}</Chip>)}
                {steps.length > 2 && <Chip size="sm" variant="soft">+{steps.length - 2}</Chip>}
                {g.naves && <Chip size="sm" variant="soft"><Ship className="h-3 w-3" />{g.naves}</Chip>}
                {g.late > 0 && <Chip size="sm" color="danger" variant="soft"><AlertTriangle className="h-3 w-3" />{g.late} tarde</Chip>}
              </span>
              <span className="flex items-center gap-3 text-right text-xs">
                <span><b className="text-sm">{g.n}</b> motos<span className="block text-[10px] text-sb-on-surface-variant">2W {g.w2} · 3W {g.w3}</span></span>
                <span className="hidden text-[11px] text-sb-on-surface-variant sm:block">Fact. {fmtDate(g.billing) || "—"}<span className="block">Est. {fmtDate(g.est) || "—"}</span></span>
                <ChevronDown className={cn("h-4 w-4 text-sb-on-surface-variant transition-transform", isOpen && "rotate-180")} />
              </span>
            </button>
            {isOpen && <GuiaUnits site={site} guia={g.guia} filters={filters} onOpenUnit={onOpenUnit} />}
          </Card>
        );
      })}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-sb-on-surface-variant">
          {data.total.toLocaleString()} guías
          <Button isIconOnly size="sm" variant="tertiary" aria-label="Página anterior" isDisabled={page <= 1} onPress={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="font-medium text-sb-on-surface">{page} / {pages}</span>
          <Button isIconOnly size="sm" variant="tertiary" aria-label="Página siguiente" isDisabled={page >= pages} onPress={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}
