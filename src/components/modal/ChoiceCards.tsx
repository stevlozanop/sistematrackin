"use client";
import { motion } from "framer-motion";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/** Tarjetas para elegir una opción: la elegida se marca con un fondo que se desliza de una a otra */
export function ChoiceCards<T extends string>({ value, onChange, options, columns = 2, id = "choice" }: {
  value: T; onChange: (v: T) => void; columns?: 1 | 2 | 3 | 4; id?: string;
  options: { key: T; label: string; desc?: string; icon?: LucideIcon; disabled?: boolean }[];
}) {
  return (
    <div className={cn("grid gap-2", columns === 1 ? "grid-cols-1" : columns === 3 ? "grid-cols-2 sm:grid-cols-3" : columns === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-2")} role="radiogroup">
      {options.map((o) => {
        const on = value === o.key;
        const Icon = o.icon;
        return (
          <motion.button key={o.key} type="button" role="radio" aria-checked={on} disabled={o.disabled}
            whileHover={o.disabled ? undefined : { y: -2 }} whileTap={o.disabled ? undefined : { scale: 0.97 }} onClick={() => onChange(o.key)}
            className={cn("relative rounded-2xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40", on ? "border-sb-primary" : "border-sb-outline-variant/60 hover:border-sb-outline")}>
            {on && <motion.span layoutId={`${id}-on`} className="absolute inset-0 rounded-2xl bg-sb-primary-soft" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
            <span className="relative z-10 flex items-center gap-2 text-sm font-semibold">
              {Icon && <Icon className={cn("h-4 w-4 shrink-0", on ? "text-sb-primary" : "text-sb-on-surface-variant")} />}
              <span className="line-clamp-2 min-w-0 flex-1 leading-snug">{o.label}</span>
              {on && <Check className="h-4 w-4 shrink-0 text-sb-primary" />}
            </span>
            {o.desc && <span className="relative z-10 mt-0.5 block text-[11px] leading-snug text-sb-on-surface-variant">{o.desc}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}
