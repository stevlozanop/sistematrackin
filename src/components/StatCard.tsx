"use client";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type Stat = { label: string; value: React.ReactNode; icon: LucideIcon; onClick?: () => void; active?: boolean };

/**
 * Réplica de «Metrics Grid» del dashboard de docentes de EduconectaV2
 * (components/dashboard/minimalist): celdas unidas por líneas de 1px dentro de un bloque redondeado.
 */
export function StatGrid({ items, className }: { items: Stat[]; className?: string }) {
  return (
    <div className={cn("grid gap-px overflow-hidden rounded-2xl bg-sb-outline-variant/20", className)}>
      {items.map((m, i) => {
        const Icon = m.icon;
        const cell = (
          <div
            className={cn(
              "group flex h-full flex-col gap-3 bg-sb-surface p-5 text-left",
              m.onClick && "cursor-pointer transition-colors hover:bg-sb-surface-container-low",
              m.active && "bg-sb-surface-container",
            )}
          >
            <div className="flex items-center justify-between">
              <Icon className="h-4 w-4 text-sb-on-surface-variant/50 transition-colors group-hover:text-sb-primary" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant/50">{m.label}</p>
              <p className="mt-0.5 text-xl font-bold tracking-tight text-sb-on-surface">{m.value}</p>
            </div>
          </div>
        );
        return (
          <motion.div key={m.label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 + i * 0.04 }}>
            {m.onClick ? <button type="button" onClick={m.onClick} className="block h-full w-full">{cell}</button> : cell}
          </motion.div>
        );
      })}
    </div>
  );
}
