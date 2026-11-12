"use client";
import { AlertTriangle, CheckCircle2, Clock, Ship, Truck, Warehouse, Factory } from "lucide-react";
import { today } from "@/lib/workflow";
import { worstTramo, yurTramos, type Tramo } from "@/lib/yur";
import { cn } from "@/lib/cn";

const ICON: Record<Tramo["key"], typeof Ship> = { iquitos: Factory, rio: Ship, puerto: Warehouse, carretera: Truck };

/**
 * Ruta Yurimaguas: los 4 tramos de la unidad (Iquitos, río, puerto de Yurimaguas y carretera) con los días
 * que tardó o lleva cada uno frente a lo normal. Si se pasó, dice en qué tramo y sugiere el motivo de demora.
 */
export function YurTramos({ unit, onUseReason }: {
  unit: Parameters<typeof yurTramos>[0] & { delay_reason?: string | null };
  onUseReason?: (reason: string) => void;
}) {
  const t = yurTramos(unit, today());
  const worst = worstTramo(t);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-sb-outline-variant/50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-sb-on-surface-variant">Plazos por tramo · ruta Yurimaguas</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {t.map((x) => {
          const Icon = ICON[x.key];
          const state = x.days === null ? "wait" : x.late ? "late" : x.running ? "run" : "ok";
          return (
            <div key={x.key} className={cn("flex flex-col gap-0.5 rounded-lg px-2.5 py-2 text-xs",
              state === "late" ? "bg-sb-late-soft/70" : state === "ok" ? "bg-sb-ontime-soft/60" : state === "run" ? "bg-sb-primary-soft/60" : "bg-sb-surface-container-low")}>
              <span className="flex items-center gap-1 font-semibold"><Icon className="h-3.5 w-3.5" />{x.label}</span>
              <span className="text-[10px] leading-tight text-sb-on-surface-variant">{x.detail}</span>
              <span className={cn("mt-0.5 flex items-center gap-1 font-bold tabular-nums", state === "late" && "text-sb-late")}>
                {state === "late" ? <AlertTriangle className="h-3 w-3" /> : state === "ok" ? <CheckCircle2 className="h-3 w-3 text-sb-ontime" /> : <Clock className="h-3 w-3 opacity-60" />}
                {x.days === null ? "Aún no empieza" : `${x.days} ${x.days === 1 ? "día" : "días"}${x.running ? " (en curso)" : ""}`}
              </span>
              <span className="text-[10px] text-sb-on-surface-variant">lo normal: {x.target === 0 ? "mismo día" : `hasta ${x.target} d`}</span>
            </div>
          );
        })}
      </div>
      {worst && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-sb-late-soft/50 px-3 py-2 text-[12px]">
          <AlertTriangle className="h-4 w-4 shrink-0 text-sb-late" />
          <span className="min-w-0 flex-1">El retraso está en <b>{worst.label.toLowerCase()}</b> (+{worst.days! - worst.target} d). Motivo que corresponde: <b>{worst.reason}</b>.</span>
          {onUseReason && !unit.delay_reason && (
            <button type="button" onClick={() => onUseReason(worst.reason)} className="sb-pill rounded-full bg-sb-late px-3 py-1 text-[11px] font-semibold text-white">Usar este motivo</button>
          )}
        </div>
      )}
    </div>
  );
}
