"use client";
import { SITE_INFO, fmtDate, type DateField, type Site } from "@/lib/hsp";
import { cn } from "@/lib/cn";

/**
 * Recorrido de una unidad en una línea (reemplaza las 9 columnas de fechas en la tabla compacta):
 * un punto por paso, lleno si ya tiene fecha. Al pasar el cursor por un punto se ve el paso y su fecha.
 */
export function MiniRoute({ site, unit, className }: { site: Site; unit: Partial<Record<DateField, string | null>>; className?: string }) {
  const steps = SITE_INFO[site].dates;
  const done = steps.filter((d) => unit[d.key]).length;
  const lastDone = [...steps].reverse().find((d) => unit[d.key]);
  return (
    <div className={cn("flex min-w-[9rem] flex-col gap-1", className)}>
      <div className="flex items-center" aria-label={`${done} de ${steps.length} pasos registrados`}>
        {steps.map((d, i) => {
          const on = !!unit[d.key];
          return (
            <span key={d.key} className="flex items-center">
              {i > 0 && <span className={cn("h-0.5 w-2.5", on ? "bg-sb-primary" : "bg-sb-outline-variant")} />}
              <span title={`${d.label}: ${on ? fmtDate(unit[d.key]) : "pendiente"}`}
                className={cn("h-2.5 w-2.5 rounded-full border", on ? "border-sb-primary bg-sb-primary" : "border-sb-outline bg-sb-surface")} />
            </span>
          );
        })}
      </div>
      <span className="text-[10px] text-sb-on-surface-variant">{lastDone ? `${lastDone.label.split(". ")[1] ?? lastDone.label} · ${fmtDate(unit[lastDone.key])}` : "Sin fechas aún"}</span>
    </div>
  );
}
