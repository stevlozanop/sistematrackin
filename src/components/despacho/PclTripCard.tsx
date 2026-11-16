"use client";
import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { CheckCircle2, ChevronDown, PackageCheck, Truck } from "lucide-react";
import { fmtDate, unitsText } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { STATE_LABEL } from "@/lib/yur-road";
import { PCL_NET } from "@/lib/pcl-road";
import { STATE_CHIP, type Trip } from "@/components/yur/YurTrips";
import { cn } from "@/lib/cn";

const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");

/**
 * Viaje de camión de la ruta Pucallpa, con el mismo diseño que los de Yurimaguas: estado, dónde va, avance y sus
 * paradas en orden con las guías de cada una. Quien registra la entrega puede «Entregar» parada por parada
 * (el dealer recibe el aviso para confirmar); «Detallado» abre el camión con su carga.
 */
export function PclTripCard({ t, open, onToggle, canDeliver, onChanged, onDetail, id }: {
  t: Trip; open: boolean; onToggle: () => void; canDeliver: boolean; onChanged: () => void; onDetail: () => void; id?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const pos = PCL_NET.tripPosition(t, today());
  const name = (d?: string | null) => PCL_NET.townOf(d)?.name ?? d ?? "—";
  const where = pos.state === "entregado" ? `Terminó en ${name(pos.at)}`
    : pos.at ? `En ${name(pos.at)}`
    : `Rumbo a ${name(pos.next?.district)}${pos.next?.eta ? ` · vence ${fmtDate(pos.next.eta)}` : ""}`;

  async function deliver(district: string, guias: string[]) {
    setBusy(district);
    const r = await fetch("/api/entrega", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deliver", site: "PCL", guias, date: today() }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setBusy(null);
    if (!r.ok) return toast.danger(j.error);
    toast.success(`Entregado en ${name(district)}: ${n(j.units + (j.confirmed ?? 0))} unidades`, { description: "El dealer recibe el aviso para confirmar (doble check)" });
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
          <p className="flex flex-wrap items-center gap-2 px-4 pt-2 text-[11px] text-sb-on-surface-variant">
            <span>Salió {fmtDate(t.dispatched_on)} de Pucallpa · {unitsText(t.w2, t.w3)}</span>
            <button type="button" onClick={onDetail} className="sb-pill ml-auto flex items-center gap-1.5 rounded-full border border-sb-outline-variant px-3 py-1 text-[11px] font-semibold text-sb-on-surface hover:border-sb-primary">
              <Truck className="h-3.5 w-3.5" />Detallado
            </button>
          </p>
          <ol className="flex flex-col py-2">
            {[...t.stops].sort((a, b) => a.seq - b.seq).map((st, i, all) => {
              const done = st.total > 0 && st.delivered >= st.total;
              const pending = st.guias.filter((g) => g.guia && g.delivered < g.total).map((g) => g.guia!);
              const isNext = pos.next?.district === st.district;
              const late = !done && st.eta && today() > st.eta;
              return (
                <li key={st.district} className="relative flex gap-3 px-4 py-2">
                  {i < all.length - 1 && <span className={cn("absolute left-[1.69rem] top-9 h-[calc(100%-1.5rem)] w-0.5", done ? "bg-sb-primary" : "bg-sb-outline-variant/60")} />}
                  <span className={cn("z-[1] grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                    done ? "bg-sb-primary text-sb-on-primary" : isNext ? "bg-sb-on-surface text-sb-surface" : "bg-sb-surface-container-high text-sb-on-surface-variant")}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : st.seq}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
                      {name(st.district)}
                      {late && <span className="rounded-full bg-sb-late-soft px-2 py-0.5 text-[10px] font-semibold text-sb-late">atrasada</span>}
                    </p>
                    <p className="text-[11px] text-sb-on-surface-variant">
                      {st.eta ? `Vence ${fmtDate(st.eta)}` : "Sin fecha límite"}
                      {st.arrived_on ? ` · entregó ${fmtDate(st.arrived_on)}` : ""}
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
                    {!done && canDeliver && pending.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant={isNext ? "primary" : "secondary"} className="rounded-full" isDisabled={!!busy} onPress={() => deliver(st.district, pending)}>
                          <PackageCheck className="h-3.5 w-3.5" /> {busy === st.district ? "Registrando…" : `Entregar ${pending.length} guía(s)`}
                        </Button>
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
