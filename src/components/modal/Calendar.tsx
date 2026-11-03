"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/** Fechas como texto YYYY-MM-DD en hora de Perú (sin saltos por zona horaria) */
export const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEK = ["L", "M", "M", "J", "V", "S", "D"];
const pad = (n: number) => String(n).padStart(2, "0");
export const fmtISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const todayLima = () => { const n = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" })); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const addMonths = (d: Date, n: number) => { const r = new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); if (r.getDate() !== d.getDate()) r.setDate(0); return r; };
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 864e5);
export const humanDate = (s: string, short = false) => {
  const d = parseISO(s);
  const m = MONTHS[d.getMonth()].toLowerCase();
  return short ? `${d.getDate()} ${m.slice(0, 3)} ${d.getFullYear()}` : `${d.getDate()} de ${m} de ${d.getFullYear()}`;
};

/**
 * Calendario de un mes (2D): el día elegido se marca con un círculo que se desliza, hoy va subrayado,
 * los días fuera de [min, max] no se pueden elegir, y opcionalmente sombrea un periodo (desde → hasta la fecha elegida)
 * con los últimos `warnDays` en ámbar (licencias).
 */
export function Calendar({ value, onChange, min, max, period, warnDays = 0, id = "cal" }: {
  value: string; onChange: (v: string) => void; min?: string | null; max?: string | null;
  /** Sombrear desde esta fecha hasta la elegida */
  period?: string | null; warnDays?: number; id?: string;
}) {
  const today = todayLima();
  const sel = value ? parseISO(value) : null;
  const lo = min ? parseISO(min) : null;
  const hi = max ? parseISO(max) : null;
  const from = period ? parseISO(period) : null;
  const [view, setView] = useState(() => { const b = sel ?? (hi && hi < today ? hi : today); return { y: b.getFullYear(), m: b.getMonth(), dir: 0 }; });
  const go = (n: number) => setView((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth(), dir: n }; });
  const first = new Date(view.y, view.m, 1);
  const lead = (first.getDay() + 6) % 7; // la semana empieza el lunes
  const count = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => new Date(view.y, view.m, i + 1))];
  const warnFrom = sel && warnDays ? addDays(sel, -warnDays) : null;

  return (
    <div className="rounded-2xl border border-sb-outline-variant/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Mes anterior" onClick={() => go(-1)} className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-sb-surface-container-high"><ChevronLeft className="h-4 w-4" /></button>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={`${view.y}-${view.m}`} initial={{ opacity: 0, y: view.dir >= 0 ? 8 : -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: view.dir >= 0 ? -8 : 8 }} transition={{ duration: 0.2 }} className="text-sm font-semibold">
            {MONTHS[view.m]} {view.y}
          </motion.span>
        </AnimatePresence>
        <button type="button" aria-label="Mes siguiente" onClick={() => go(1)} className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-sb-surface-container-high"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-sb-on-surface-variant/70">
        {WEEK.map((w, i) => <span key={i}>{w}</span>)}
      </div>
      <div className="relative overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={`${view.y}-${view.m}`}
            initial={{ x: view.dir > 0 ? 40 : view.dir < 0 ? -40 : 0, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: view.dir > 0 ? -40 : 40, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }} className="mt-1 grid grid-cols-7 gap-y-1">
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const s = fmtISO(d);
              const off = (lo && d < lo) || (hi && d > hi);
              const picked = sel && s === fmtISO(sel);
              const inPeriod = sel && from && d >= from && d < sel;
              const inWarn = inPeriod && warnFrom && d >= warnFrom;
              return (
                <button key={s} type="button" disabled={!!off} onClick={() => onChange(s)} aria-label={humanDate(s)} aria-pressed={!!picked}
                  className={cn("relative mx-auto grid h-8 w-full place-items-center text-xs transition-colors",
                    inPeriod && !inWarn && "bg-sb-primary-soft", inWarn && "bg-amber-500/15",
                    off ? "cursor-not-allowed text-sb-on-surface-variant/30" : "hover:font-semibold")}>
                  {picked && <motion.span layoutId={`${id}-day`} className="absolute inset-0.5 rounded-full bg-sb-primary" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
                  <span className={cn("relative z-10", picked && "font-bold text-sb-on-primary", s === fmtISO(today) && !picked && "font-bold underline decoration-2 underline-offset-4")}>{d.getDate()}</span>
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
