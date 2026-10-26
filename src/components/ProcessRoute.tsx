"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Anchor, Building2, Container, Factory, PackageCheck, PackagePlus, Ship, Truck, Warehouse, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { SITE_INFO, fmtDate, type DateField, type Site } from "@/lib/hsp";

type StepDef = { n: string; label: string; place: string; icon: LucideIcon; field?: DateField; lima?: boolean };

/** Pasos que sigue el sistema (desde que la moto armada se factura en Iquitos). */
const STEPS: Record<Site, StepDef[]> = {
  PCL: [
    { n: "1", label: "IQT-Port", place: "Iquitos · armada y facturada", icon: Factory },
    { n: "2", label: "Tránsito fluvial", place: "Zarpe de Iquitos", icon: Ship, field: "d_zarpe" },
    { n: "3", label: "Arribo puerto", place: "Puerto Pucallpa", icon: Anchor, field: "d_arribo" },
    { n: "4", label: "En almacén", place: "Entrega almacén (in)", icon: Warehouse, field: "d_almacen" },
    { n: "5", label: "Tránsito dealer", place: "Despacho almacén (out)", icon: Truck, field: "d_despacho" },
    { n: "5.1", label: "En almacén Lima", place: "Entrega alm. Lima (in)", icon: Building2, field: "d_alm_lima", lima: true },
    { n: "5.2", label: "Tránsito dealer 2", place: "Salida alm. Lima (out)", icon: Truck, field: "d_sal_lima", lima: true },
    { n: "6", label: "Entregado", place: "Entrega al dealer", icon: PackageCheck, field: "d_entrega" },
  ],
  YUR: [
    { n: "1", label: "IQT-Port", place: "Carga en Iquitos", icon: PackagePlus, field: "d_carga" },
    { n: "2", label: "Tránsito fluvial", place: "Zarpe de Iquitos", icon: Ship, field: "d_zarpe" },
    { n: "3", label: "Arribo puerto", place: "Puerto Yurimaguas", icon: Anchor, field: "d_arribo" },
    { n: "4", label: "En almacén", place: "Ingreso ENAPU (in)", icon: Warehouse, field: "d_almacen" },
    { n: "5", label: "Tránsito dealer", place: "Despacho (out)", icon: Truck, field: "d_despacho" },
    { n: "6", label: "Entregado", place: "Entrega al dealer", icon: PackageCheck, field: "d_entrega" },
  ],
};

/** Lo que pasa antes de que la unidad exista en el sistema. */
const BEFORE: { label: string; icon: LucideIcon }[] = [
  { label: "Japón · caja seca", icon: Container },
  { label: "Callao", icon: Anchor },
  { label: "Terrestre", icon: Truck },
  { label: "Puerto Pucallpa", icon: Anchor },
  { label: "Fluvial", icon: Ship },
  { label: "Iquitos · fábrica (se arma)", icon: Factory },
];

/** Una estación del recorrido: círculo con ícono, número, nombre y lugar. */
function Station({ s, i, last, state, mine, date, showDate }: {
  s: StepDef; i: number; last: boolean; state: "done" | "current" | "todo"; mine: boolean; date?: string | null; showDate: boolean;
}) {
  const Icon = s.icon;
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.06, duration: 0.3 }}
      className="relative flex gap-3 pb-5 last:pb-0 @3xl:flex-1 @3xl:flex-col @3xl:items-center @3xl:gap-2 @3xl:pb-0 @3xl:text-center"
    >
      {/* Línea hacia la siguiente estación: vertical en celular, horizontal en pantalla grande */}
      {!last && (
        <span className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-0.5 overflow-hidden bg-sb-outline-variant @3xl:left-[calc(50%+20px)] @3xl:top-[19px] @3xl:h-0.5 @3xl:w-[calc(100%-40px)]">
          {state === "done" && (
            <motion.span className="absolute inset-0 origin-top bg-sb-primary @3xl:origin-left"
              initial={{ scaleY: 0, scaleX: 0 }} animate={{ scaleY: 1, scaleX: 1 }} transition={{ delay: 0.2 + i * 0.06, duration: 0.4 }} />
          )}
        </span>
      )}
      <span className="relative shrink-0">
        <span className={cn(
          "relative z-10 grid h-10 w-10 place-items-center rounded-full border-2 transition-colors",
          state === "done" && "border-sb-primary bg-sb-primary text-sb-on-primary",
          state === "current" && "border-sb-on-surface bg-sb-surface text-sb-on-surface",
          state === "todo" && "border-sb-outline-variant bg-sb-surface text-sb-on-surface-variant",
          s.lima && state === "todo" && "border-dashed",
          mine && "ring-2 ring-sb-ontime ring-offset-2 ring-offset-sb-surface",
        )}>
          <Icon className="h-4 w-4" />
        </span>
        {state === "current" && <span className="absolute inset-0 animate-ping rounded-full bg-sb-primary/20" />}
        <span className="absolute -right-1.5 -top-1.5 z-20 rounded-full bg-sb-surface-container-highest px-1 text-[9px] font-bold leading-4 text-sb-on-surface">{s.n}</span>
      </span>
      <div className="min-w-0 pt-0.5 @3xl:pt-0">
        <div className="text-xs font-semibold leading-tight">{s.label}</div>
        <div className="text-[10px] leading-tight text-sb-on-surface-variant">{s.place}</div>
        {s.lima && <div className="mt-0.5 inline-block rounded-full border border-dashed border-sb-outline px-1.5 text-[9px] text-sb-on-surface-variant">solo Ruta Lima</div>}
        {mine && <div className="mt-0.5 inline-block rounded-full bg-sb-ontime px-1.5 text-[9px] font-semibold text-white">tu paso</div>}
        {showDate && <div className={cn("mt-0.5 text-[10px] font-semibold", !date && "text-sb-on-surface-variant/60")}>{date ? fmtDate(date) : "—"}</div>}
      </div>
    </motion.li>
  );
}

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
    <div className="@container flex flex-col gap-4">
      {showBefore && <BeforeSystem />}
      <ol className="flex flex-col @3xl:flex-row @3xl:items-start">
        {steps.map((s, i) => (
          <Station
            key={s.n} s={s} i={i} last={i === steps.length - 1}
            state={idx < 0 ? (dates || s.lima ? "todo" : "done") : i < idx ? "done" : i === idx ? "current" : "todo"}
            mine={!!s.field && !!mine?.includes(s.field)}
            date={dates && s.field ? dates[s.field] ?? null : undefined}
            showDate={!!dates && !!s.field}
          />
        ))}
      </ol>
      <p className="text-[10px] text-sb-on-surface-variant/70">
        {SITE_INFO[site].title}: cada paso se registra en orden · (in) = entrada · (out) = salida.
        {site === "PCL" && viaLima !== false && " Los pasos 5.1 y 5.2 (borde punteado) solo aplican a dealers de Ruta Lima."}
      </p>
    </div>
  );
}

/** Tramo previo (importación y armado), en gris: todavía no se registra en el sistema. */
export function BeforeSystem() {
  return (
    <div className="rounded-xl bg-sb-surface-container-low px-3 py-2.5">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-sb-on-surface-variant">Antes del sistema · importación y armado</div>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
        {BEFORE.map((b, i) => {
          const Icon = b.icon;
          const lastOne = i === BEFORE.length - 1;
          return (
            <motion.li key={b.label} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-1">
              {i > 0 && <span className="mx-0.5 h-px w-3 border-t border-dashed border-sb-outline" />}
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]",
                lastOne ? "bg-sb-primary font-semibold text-sb-on-primary" : "bg-sb-surface text-sb-on-surface-variant")}>
                <Icon className="h-3 w-3" /> {b.label}
              </span>
            </motion.li>
          );
        })}
        <li className="ml-1 text-[10px] text-sb-on-surface-variant">→ se factura y empieza el seguimiento ↓</li>
      </ol>
    </div>
  );
}

/** Para el dashboard: el tramo previo + pestañas PCL / YUR. */
export function ProcessRouteTabs() {
  const [site, setSite] = useState<Site>("PCL");
  return (
    <div className="flex flex-col gap-4">
      <BeforeSystem />
      <div className="flex gap-1.5">
        {(["PCL", "YUR"] as const).map((s) => (
          <button key={s} className={`sbf-chip ${site === s ? "active" : ""}`} onClick={() => setSite(s)}>{SITE_INFO[s].title}</button>
        ))}
      </div>
      <ProcessRoute key={site} site={site} />
    </div>
  );
}
