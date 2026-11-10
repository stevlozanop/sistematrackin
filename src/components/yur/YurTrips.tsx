"use client";
import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { CheckCircle2, ChevronDown, MapPin, PackageCheck, Truck } from "lucide-react";
import { fmtDate, unitsText } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { STATE_LABEL, townOf, tripPosition, type TripState } from "@/lib/yur-road";
import { cn } from "@/lib/cn";

/**
 * Viajes de camión de la ruta Yurimaguas con sus paradas en orden. En cada parada:
 * «Llegué» (el camión llegó) y «Entregar» (las guías de esa parada pasan a Entregado y el dealer recibe el aviso).
 * Lo usan el mapa de camiones (planificador) y la pantalla del conductor.
 */
export type TripGuia = { guia: string | null; dealer: string | null; district: string | null; total: number; delivered: number; w2: number; w3: number };
export type Trip = {
  id: number; dispatched_on: string; driver: string; plate: string | null; total: number; delivered: number; w2: number; w3: number; routes: string[];
  stops: { district: string; seq: number; eta: string | null; arrived_on: string | null; total: number; delivered: number; guias: TripGuia[] }[];
};

const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");
export const STATE_CHIP: Record<TripState, string> = {
  camino: "bg-sb-primary-soft text-sb-primary",
  parada: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  atrasado: "bg-sb-late-soft text-sb-late",
  entregado: "bg-sb-surface-container-high text-sb-on-surface-variant",
};

export function TripCard({ t, open, onToggle, canArrive, canDeliver, onChanged, id }: {
  t: Trip; open: boolean; onToggle: () => void; canArrive: boolean; canDeliver: boolean; onChanged: () => void; id?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const pos = tripPosition(t, today());
  const where = pos.state === "entregado" ? `Terminó en ${townOf(pos.at)?.name ?? pos.at ?? "—"}`
    : pos.at ? `En ${townOf(pos.at)?.name ?? pos.at}`
    : `Rumbo a ${townOf(pos.next?.district)?.name ?? pos.next?.district ?? "—"}${pos.next?.eta ? ` · llega aprox. ${fmtDate(pos.next.eta)}` : ""}`;

  async function arrive(district: string) {
    setBusy(`a${district}`);
    const r = await fetch("/api/yur", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "arrive", trip: t.id, district, date: today() }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setBusy(null);
    if (!r.ok) return toast.danger(j.error);
    toast.success(`Llegada a ${townOf(district)?.name ?? district} registrada`);
    onChanged();
  }
  async function deliver(district: string, guias: string[]) {
    setBusy(`d${district}`);
    const r = await fetch("/api/entrega", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deliver", site: "YUR", guias, date: today() }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setBusy(null);
    if (!r.ok) return toast.danger(j.error);
    toast.success(`Entregado en ${townOf(district)?.name ?? district}: ${n(j.units)} unidades`, { description: "El dealer recibe el aviso para confirmar" });
    onChanged();
  }

  return (
    <div id={id} className="scroll-mt-20 overflow-hidden rounded-2xl border border-sb-outline-variant/50 bg-sb-surface">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", STATE_CHIP[pos.state])}><Truck className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold">
            {t.driver}{t.plate && <span className="font-mono text-[11px] font-normal text-sb-on-surface-variant">{t.plate}</span>}
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", STATE_CHIP[pos.state])}>{STATE_LABEL[pos.state]}{pos.late ? ` · +${pos.late} d` : ""}</span>
          </span>
          <span className="block truncate text-[11px] text-sb-on-surface-variant">{where}</span>
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-sb-surface-container-high">
            <span className={cn("block h-full rounded-full", pos.state === "atrasado" ? "bg-sb-late" : "bg-sb-primary")} style={{ width: `${Math.round(pos.progress * 100)}%` }} />
          </span>
        </span>
        <span className="shrink-0 text-right tabular-nums">
          <b className="block text-base leading-none">{n(t.delivered)}/{n(t.total)}</b>
          <span className="block text-[10px] text-sb-on-surface-variant">entregadas</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-sb-on-surface-variant transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-sb-outline-variant/30">
          <p className="px-4 pt-2 text-[11px] text-sb-on-surface-variant">Salió {fmtDate(t.dispatched_on)} · {t.routes.join(" + ")} · {unitsText(t.w2, t.w3)}</p>
          <ol className="flex flex-col py-2">
            {[...t.stops].sort((a, b) => a.seq - b.seq).map((st, i, all) => {
              const done = st.total > 0 && st.delivered >= st.total;
              const pending = st.guias.filter((g) => g.guia && g.delivered < g.total).map((g) => g.guia!) ;
              const isNext = pos.next?.district === st.district;
              const late = !done && st.eta && today() > st.eta;
              return (
                <li key={st.district} className="relative flex gap-3 px-4 py-2">
                  {/* Línea del recorrido */}
                  {i < all.length - 1 && <span className={cn("absolute left-[1.69rem] top-9 h-[calc(100%-1.5rem)] w-0.5", done ? "bg-sb-primary" : "bg-sb-outline-variant/60")} />}
                  <span className={cn("z-[1] grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                    done ? "bg-sb-primary text-sb-on-primary" : isNext ? "bg-sb-on-surface text-sb-surface" : "bg-sb-surface-container-high text-sb-on-surface-variant")}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : st.seq}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
                      {townOf(st.district)?.name ?? st.district}
                      {late && <span className="rounded-full bg-sb-late-soft px-2 py-0.5 text-[10px] font-semibold text-sb-late">atrasada</span>}
                    </p>
                    <p className="text-[11px] text-sb-on-surface-variant">
                      {st.eta ? `Estimada ${fmtDate(st.eta)}` : "Sin fecha estimada"}
                      {st.arrived_on ? ` · llegó ${fmtDate(st.arrived_on)}` : ""}
                      {` · ${n(st.delivered)}/${n(st.total)} entregadas`}
                    </p>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {st.guias.map((g) => (
                        <li key={`${g.guia}-${g.dealer}`} className="flex items-center gap-2 text-[11px]">
                          <span className={cn("font-mono", g.delivered >= g.total ? "text-sb-on-surface-variant line-through" : "font-semibold")}>{g.guia ?? "—"}</span>
                          <span className="min-w-0 flex-1 truncate text-sb-on-surface-variant">{g.dealer}</span>
                          <span className="tabular-nums">{g.total}</span>
                        </li>
                      ))}
                    </ul>
                    {!done && (canArrive || canDeliver) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {canArrive && !st.arrived_on && (
                          <Button size="sm" variant={isNext ? "primary" : "secondary"} className="rounded-full" isDisabled={!!busy} onPress={() => arrive(st.district)}>
                            <MapPin className="h-3.5 w-3.5" /> {busy === `a${st.district}` ? "Registrando…" : "Llegué"}
                          </Button>
                        )}
                        {canDeliver && pending.length > 0 && (
                          <Button size="sm" variant={st.arrived_on ? "primary" : "secondary"} className="rounded-full" isDisabled={!!busy} onPress={() => deliver(st.district, pending)}>
                            <PackageCheck className="h-3.5 w-3.5" /> {busy === `d${st.district}` ? "Registrando…" : `Entregar ${pending.length} guía(s)`}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
