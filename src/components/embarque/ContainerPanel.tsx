"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button, Chip, Drawer, Spinner } from "@heroui/react";
import { Box, ChevronDown, MapPin, Ship } from "lucide-react";
import { fmtDate, type Site } from "@/lib/hsp";
import { cn } from "@/lib/cn";
import type { NaveRow } from "./NaveContents";

/** Pantalla chica: el panel sale desde abajo; grande, desde la derecha */
const useNarrow = () => useSyncExternalStore(
  (cb) => { const m = matchMedia("(max-width: 767px)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
  () => matchMedia("(max-width: 767px)").matches, () => false,
);
const model = (m: string | null) => (m ?? "—").split(/[ _]/)[0];

/**
 * Lo que lleva un contenedor (se abre al tocarlo en el muelle): su lugar en la nave,
 * las guías con su dealer y destino, los modelos y los chasis.
 */
export function ContainerPanel({ site, pick, onClose, onOpenNave }: {
  site: Site; pick: { id: number; code: string; nave: string } | null; onClose: () => void; onOpenNave: (nave: string) => void;
}) {
  const narrow = useNarrow();
  const [rows, setRows] = useState<NaveRow[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!pick) return;
    let alive = true;
    fetch(`/api/embarque?${new URLSearchParams({ site, nave: pick.nave })}`).then((r) => r.json())
      .then((j) => { if (alive) { setRows((j.rows ?? []).filter((r: NaveRow) => r.cid === pick.id)); setOpen(new Set()); } });
    return () => { alive = false; setRows(null); };
  }, [site, pick]);

  const guias = useMemo(() => {
    const m = new Map<string, NaveRow[]>();
    for (const r of rows ?? []) { const g = r.guia ?? "(sin guía)"; m.set(g, [...(m.get(g) ?? []), r]); }
    return [...m.entries()];
  }, [rows]);
  const w2 = (rows ?? []).filter((r) => r.category === "2W").length;
  const models = [...(rows ?? []).reduce((m, r) => m.set(model(r.material), (m.get(model(r.material)) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const first = rows?.[0];

  return (
    <Drawer>
      <Drawer.Backdrop isOpen={!!pick} onOpenChange={(o) => !o && onClose()}>
        <Drawer.Content placement={narrow ? "bottom" : "right"}>
          <Drawer.Dialog className={cn(narrow ? "max-h-[85dvh]" : "w-[420px] max-w-[92vw]")}>
            <Drawer.CloseTrigger aria-label="Cerrar" />
            <Drawer.Header className="flex flex-col gap-1">
              <Drawer.Heading className="flex items-center gap-2 font-mono"><Box className="h-4 w-4" />{pick?.code}</Drawer.Heading>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-sb-on-surface-variant">
                <span className="inline-flex items-center gap-1"><Ship className="h-3 w-3" />{pick?.nave}</span>
                {first?.place && <Chip size="sm" variant="soft">{first.place}</Chip>}
                {first && <span>embarcado {fmtDate(first.loaded_on)}</span>}
              </p>
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-3">
              {!rows ? <div className="grid place-items-center py-10"><Spinner /></div> : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {[["Unidades", rows.length], ["2W · 3W", `${w2} · ${rows.length - w2}`], ["Guías", guias.length]].map(([l, v]) => (
                      <div key={l} className="rounded-xl bg-sb-surface-container-low px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant">{l}</p>
                        <p className="text-lg font-bold tabular-nums">{v}</p>
                      </div>
                    ))}
                  </div>
                  {models.length > 0 && <div className="flex flex-wrap gap-1">{models.map(([m, n]) => <Chip key={m} size="sm" variant="soft">{m} ×{n}</Chip>)}</div>}
                  <div className="flex flex-col gap-2">
                    {guias.map(([g, us]) => {
                      const isOpen = open.has(g) || guias.length === 1;
                      return (
                        <div key={g} className="overflow-hidden rounded-xl border border-sb-outline-variant/50">
                          <button type="button" onClick={() => setOpen((s) => { const y = new Set(s); if (y.has(g)) y.delete(g); else y.add(g); return y; })}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-sb-surface-container-low">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{us[0].dealer ?? "—"}</span>
                              <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-sb-on-surface-variant">
                                <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{us[0].district ?? "—"}</span>
                                <span className="font-mono">{g}</span>
                              </span>
                            </span>
                            <b className="text-base tabular-nums">{us.length}</b>
                            <ChevronDown className={cn("h-4 w-4 text-sb-on-surface-variant transition-transform", isOpen && "rotate-180")} />
                          </button>
                          {isOpen && (
                            <ul className="border-t border-sb-outline-variant/40 bg-sb-surface-container-low/50">
                              {us.map((u) => (
                                <li key={u.chassis} className="flex items-baseline gap-2 border-b border-sb-outline-variant/20 px-3 py-1.5 text-[11px] last:border-0">
                                  <span className="select-text font-mono font-medium">{u.chassis}</span>
                                  <span className="truncate text-sb-on-surface-variant">{u.material} · {u.category}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                    {!guias.length && <p className="py-6 text-center text-xs text-sb-on-surface-variant">Este contenedor no tiene unidades pendientes.</p>}
                  </div>
                </>
              )}
            </Drawer.Body>
            <Drawer.Footer>
              {pick && <Button variant="secondary" className="w-full rounded-full" onPress={() => { onClose(); onOpenNave(pick.nave); }}><Ship className="h-4 w-4" /> Ver la nave completa y su plano</Button>}
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
