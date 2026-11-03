"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Calendar, addDays, fmtISO, humanDate, todayLima } from "./Calendar";

export type Quick = { label: string; value: string };

/** Atajos de siempre para registrar una fecha que ya pasó: hoy, ayer y anteayer (respetando min y max) */
export function pastQuick(min?: string | null, max?: string | null): Quick[] {
  const t = todayLima();
  return [["Hoy", 0], ["Ayer", -1], ["Anteayer", -2]].map(([l, n]) => ({ label: l as string, value: fmtISO(addDays(t, n as number)) }))
    .filter((q) => (!min || q.value >= min) && (!max || q.value <= max));
}

/**
 * Selector de fecha con calendario 2D (reemplaza el de fecha del navegador).
 * - inline: el calendario se abre debajo del campo empujando el contenido (ideal dentro de modales).
 * - popover: flota sobre la página (tablas y formularios).
 * Atajos opcionales (Hoy, Ayer…), límites min/max y botón para borrar.
 */
export function DatePicker({ value, onChange, min, max, quick, clearable = false, placeholder = "Elegir fecha", mode = "inline", disabled = false, label, id = "dp", className }: {
  value: string; onChange: (v: string) => void; min?: string | null; max?: string | null; quick?: Quick[];
  clearable?: boolean; placeholder?: string; mode?: "inline" | "popover"; disabled?: boolean; label?: string; id?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc, true); };
  }, [open]);
  const pick = (v: string) => { onChange(v); setOpen(false); };

  const panel = (
    <div className="flex flex-col gap-2">
      {!!quick?.length && (
        <div className="flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button key={q.label} type="button" onClick={() => pick(q.value)}
              className={cn("rounded-full border px-3 py-1 text-[11px] font-medium transition-colors", value === q.value ? "border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant hover:bg-sb-surface-container-high")}>{q.label}</button>
          ))}
        </div>
      )}
      <Calendar id={id} value={value} onChange={pick} min={min} max={max} />
    </div>
  );

  return (
    <div ref={root} className={cn("relative", className)}>
      <div className={cn("flex h-10 items-center gap-2 rounded-xl border bg-sb-surface px-3 text-sm transition-colors",
        open ? "border-sb-primary" : "border-sb-outline-variant", disabled && "opacity-50")}>
        <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={label ? `${label}: ${value ? humanDate(value) : "sin fecha"}` : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none">
          <CalendarDays className={cn("h-4 w-4 shrink-0", value ? "text-sb-primary" : "text-sb-on-surface-variant")} />
          <span className={cn("truncate", !value && "text-sb-on-surface-variant")}>{value ? humanDate(value) : placeholder}</span>
        </button>
        {clearable && value && !disabled && (
          <button type="button" aria-label="Borrar fecha" onClick={() => onChange("")} className="grid h-6 w-6 place-items-center rounded-full text-sb-on-surface-variant hover:bg-sb-surface-container-high"><X className="h-3.5 w-3.5" /></button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (mode === "inline" ? (
          <motion.div key="in" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }} className="overflow-hidden">
            <div className="pt-2">{panel}</div>
          </motion.div>
        ) : (
          <motion.div key="pop" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.18 }}
            className="absolute left-0 top-full z-50 mt-2 w-[290px] rounded-2xl border border-sb-outline-variant bg-sb-surface p-2 shadow-xl">
            {panel}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
