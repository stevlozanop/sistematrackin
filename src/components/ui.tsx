import { cn } from "@/lib/cn";

export const Card = ({ className, ...p }: React.ComponentProps<"div">) => (
  <div className={cn("rounded-2xl border border-sb-outline-variant/40 bg-sb-surface", className)} {...p} />
);

export const PageTitle = ({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {sub && <p className="mt-0.5 text-[12px] text-sb-on-surface-variant/70">{sub}</p>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </div>
);

/** Tabla con el estilo de EduconectaV2: encabezado en mayúsculas tenue, filas con separadores finos. */
export const Table = ({ className, ...p }: React.ComponentProps<"table">) => (
  <div className="overflow-x-auto">
    <table className={cn("w-full text-left text-xs", className)} {...p} />
  </div>
);
export const Thead = ({ children }: { children: React.ReactNode }) => (
  <thead><tr className="border-b border-sb-outline-variant/40">{children}</tr></thead>
);
export const Th = ({ className, ...p }: React.ComponentProps<"th">) => (
  <th className={cn("whitespace-nowrap px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-sb-on-surface-variant/50", className)} {...p} />
);
export const Tr = ({ className, ...p }: React.ComponentProps<"tr">) => (
  <tr className={cn("border-b border-sb-outline-variant/25 transition-colors last:border-0 hover:bg-sb-surface-container-low", className)} {...p} />
);
export const Td = ({ className, ...p }: React.ComponentProps<"td">) => (
  <td className={cn("whitespace-nowrap px-3 py-2.5 align-middle text-sb-on-surface/80", className)} {...p} />
);
export const Empty = ({ cols, children }: { cols: number; children: React.ReactNode }) => (
  <tr><td colSpan={cols} className="px-3 py-12 text-center text-sb-on-surface-variant/60">{children}</td></tr>
);

export const Pill = ({ active, children }: { active?: boolean; children: React.ReactNode }) => (
  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium", active ? "bg-sb-on-surface text-sb-surface" : "bg-sb-surface-container-high text-sb-on-surface-variant")}>
    {children}
  </span>
);

export const Checkbox = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <input
    type="checkbox"
    aria-label={label}
    checked={checked}
    onChange={(e) => onChange(e.target.checked)}
    className="h-3.5 w-3.5 cursor-pointer rounded-[4px] accent-[var(--sb-primary)]"
  />
);
