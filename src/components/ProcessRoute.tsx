"use client";
import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { SITE_INFO, fmtDate, type DateField, type Site } from "@/lib/hsp";

/** Pasos que sigue el sistema (desde que la moto armada se factura en Iquitos). */
const STEPS: Record<Site, { n: string; label: string; place: string; field?: DateField; lima?: boolean }[]> = {
  PCL: [
    { n: "1", label: "IQT-Port", place: "Iquitos (armada y facturada)" },
    { n: "2", label: "Tránsito fluvial", place: "Zarpe de Iquitos", field: "d_zarpe" },
    { n: "3", label: "Arribo puerto", place: "Puerto Pucallpa", field: "d_arribo" },
    { n: "4", label: "En almacén", place: "Entrega almacén (in)", field: "d_almacen" },
    { n: "5", label: "Tránsito dealer", place: "Despacho almacén (out)", field: "d_despacho" },
    { n: "5.1", label: "En almacén Lima", place: "Entrega alm. Lima (in)", field: "d_alm_lima", lima: true },
    { n: "5.2", label: "Tránsito dealer 2", place: "Salida alm. Lima (out)", field: "d_sal_lima", lima: true },
    { n: "6", label: "Entregado", place: "Entrega al dealer", field: "d_entrega" },
  ],
  YUR: [
    { n: "1", label: "IQT-Port", place: "Carga en Iquitos", field: "d_carga" },
    { n: "2", label: "Tránsito fluvial", place: "Zarpe de Iquitos", field: "d_zarpe" },
    { n: "3", label: "Arribo puerto", place: "Puerto Yurimaguas", field: "d_arribo" },
    { n: "4", label: "En almacén", place: "Ingreso ENAPU (in)", field: "d_almacen" },
    { n: "5", label: "Tránsito dealer", place: "Despacho (out)", field: "d_despacho" },
    { n: "6", label: "Entregado", place: "Entrega al dealer", field: "d_entrega" },
  ],
};

/** Lo que pasa antes de que la unidad exista en el sistema. */
const BEFORE = ["Japón (caja seca)", "Callao", "Terrestre", "Puerto Pucallpa", "Fluvial", "Iquitos: fábrica (se arma)"];

function Step({ n, label, place, date, on, mine, done, lima }: {
  n: string; label: string; place: string; date?: string | null; on?: boolean; mine?: boolean; done?: boolean; lima?: boolean;
}) {
  return (
    <div className={cn(
      "flex min-w-[6.5rem] flex-col rounded-xl border px-2 py-1.5",
      on ? "border-sb-on-surface bg-sb-on-surface text-sb-surface"
        : mine ? "border-sb-on-surface border-dashed"
        : done ? "border-sb-outline-variant/60 bg-sb-surface-container-low"
        : "border-sb-outline-variant/40",
      lima && !on && "border-dashed",
    )}>
      <span className="text-[10px] font-semibold opacity-70">{n}{mine ? " · tu paso" : lima ? " · solo Ruta Lima" : ""}</span>
      <span className="text-xs font-semibold leading-tight">{label}</span>
      <span className="text-[10px] leading-tight opacity-70">{place}</span>
      {date !== undefined && <span className="mt-0.5 text-[10px] font-medium">{date ? fmtDate(date) : "—"}</span>}
    </div>
  );
}

const Arrow = () => <ChevronRight className="h-3.5 w-3.5 shrink-0 self-center opacity-40" />;

/**
 * Recorrido de una unidad, numerado como en el Excel.
 * - current: paso actual (ej. "4") · mine: campos que registra el usuario · dates: fechas de una unidad
 * - viaLima: false oculta 5.1 / 5.2 (dealer que no va por Lima)
 */
export function ProcessRoute({ site, current, mine, dates, viaLima, showBefore }: {
  site: Site; current?: string; mine?: DateField[]; dates?: Partial<Record<DateField, string | null>>;
  viaLima?: boolean; showBefore?: boolean;
}) {
  const steps = STEPS[site].filter((s) => viaLima !== false || !s.lima);
  const idx = steps.findIndex((s) => s.n === current);
  return (
    <div className="flex flex-col gap-2">
      {showBefore && (
        <div className="flex flex-wrap items-center gap-1 text-[10px] text-sb-on-surface-variant">
          <span className="mr-1 font-semibold uppercase tracking-wider">Antes del sistema:</span>
          {BEFORE.map((b, i) => (
            <Fragment key={b}>
              {i > 0 && <span className="opacity-40">→</span>}
              <span className={cn("rounded-full px-2 py-0.5", i === BEFORE.length - 1 ? "bg-sb-surface-container-high font-semibold text-sb-on-surface" : "bg-sb-surface-container-low")}>{b}</span>
            </Fragment>
          ))}
          <span className="opacity-40">→ se factura y empieza el seguimiento:</span>
        </div>
      )}
      <div className="flex flex-wrap items-stretch gap-1">
        {steps.map((s, i) => (
          <Fragment key={s.n}>
            {i > 0 && <Arrow />}
            <Step
              n={s.n} label={s.label} place={s.place} lima={s.lima}
              date={dates && s.field ? dates[s.field] ?? null : undefined}
              on={s.n === current} done={idx >= 0 && i < idx}
              mine={!!s.field && !!mine?.includes(s.field)}
            />
          </Fragment>
        ))}
      </div>
      <p className="text-[10px] text-sb-on-surface-variant/70">
        {SITE_INFO[site].title}: cada paso se registra en orden; (in) = entrada, (out) = salida.
        {site === "PCL" && viaLima !== false && " 5.1 y 5.2 solo aplican a dealers de Ruta Lima."}
      </p>
    </div>
  );
}
