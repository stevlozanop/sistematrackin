"use client";
import { useEffect, useRef } from "react";
import { animate, useInView, useMotionValue, useTransform, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";

/** Colores del nivel de servicio: azul = a tiempo, rojo = fuera de tiempo (siempre con ícono y texto). */
export const SERVICE_STYLE = {
  "A TIEMPO": { label: "A tiempo", icon: CheckCircle2, solid: "bg-sb-ontime text-white", soft: "bg-sb-ontime-soft", dot: "bg-sb-ontime", text: "text-sb-ontime" },
  "FUERA DE TIEMPO": { label: "Fuera de tiempo", icon: AlertTriangle, solid: "bg-sb-late text-white", soft: "bg-sb-late-soft", dot: "bg-sb-late", text: "text-sb-late" },
} as const;
export type ServiceKey = keyof typeof SERVICE_STYLE;

/** Etiqueta «A tiempo» (azul) / «Fuera de tiempo» (rojo). */
export function ServiceBadge({ s, size = "sm", className }: { s: ServiceKey | null; size?: "sm" | "xs"; className?: string }) {
  if (!s) return <span className="text-[10px] text-muted">Sin plazo</span>;
  const st = SERVICE_STYLE[s];
  const Icon = st.icon;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold",
      size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[10px]",
      st.solid, className,
    )}>
      <Icon className={size === "sm" ? "h-3 w-3" : "h-2.5 w-2.5"} /> {st.label}
    </span>
  );
}

/** Número que sube animado desde 0 la primera vez que aparece en pantalla. */
export function AnimatedNumber({ value, className, suffix = "" }: { value: number; className?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${Math.round(v).toLocaleString()}${suffix}`);
  useEffect(() => {
    if (!inView) return;
    const c = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [inView, value, mv]);
  return <motion.span ref={ref} className={cn("tabular-nums", className)}>{text}</motion.span>;
}

/** Barra apilada azul/rojo con el % a tiempo y fuera de tiempo (se llena animada). */
export function ServiceSplitBar({ onTime, late, className, labels = true }: { onTime: number; late: number; className?: string; labels?: boolean }) {
  const total = onTime + late;
  const p = total ? (onTime / total) * 100 : 0;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-sb-surface-container-high" role="img"
        aria-label={`A tiempo ${Math.round(p)}%, fuera de tiempo ${Math.round(100 - p)}%`}>
        {onTime > 0 && <motion.div className="h-full rounded-full bg-sb-ontime" initial={{ width: 0 }} animate={{ width: `${p}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />}
        {late > 0 && <motion.div className="h-full flex-1 rounded-full bg-sb-late" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.2 }} />}
      </div>
      {labels && total > 0 && (
        <div className="flex justify-between text-[10px] text-sb-on-surface-variant">
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sb-ontime" />{Math.round(p)}% a tiempo</span>
          <span className="inline-flex items-center gap-1">{Math.round(100 - p)}% fuera<span className="h-1.5 w-1.5 rounded-full bg-sb-late" /></span>
        </div>
      )}
    </div>
  );
}
