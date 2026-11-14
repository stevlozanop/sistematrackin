import { cn } from "@/lib/cn";
import { TableLabels } from "@/components/TableLabels";

/**
 * Tarjeta del diseño suave: sin borde, muy redondeada y con una sombra casi invisible.
 * Si la pantalla le pone un color de borde (ej. rojo para lo atrasado), el borde aparece.
 */
export const Card = ({ className, ...p }: React.ComponentProps<"div">) => (
  <div className={cn("sb-card rounded-[var(--sb-radius-card)] bg-sb-surface shadow-[var(--sb-shadow-card)]", /\bborder-(?!0\b)/.test(className ?? "") && "border", className)} {...p} />
);

export const PageTitle = ({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 className="sb-title text-[22px] font-semibold leading-tight tracking-[-0.02em]" aria-label={title}>
        {/* Cada letra en su propio elemento: el estilo «Burbuja» pone cada una en su burbuja (los demás no lo notan) */}
        {title.split(" ").map((w, i) => (
          <span key={i} aria-hidden className="sb-word">{i > 0 && " "}{[...w].map((ch, j) => <span key={j} className="sb-ch">{ch}</span>)}</span>
        ))}
      </h2>
      {sub && <p className="sb-sub mt-1 max-w-3xl text-[12.5px] leading-relaxed text-sb-on-surface-variant">{sub}</p>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </div>
);

/** Tabla con el estilo de EduconectaV2: encabezado en mayúsculas tenue, filas con separadores finos. */
export const Table = ({ className, ...p }: React.ComponentProps<"table">) => (
  <TableLabels>
    <table className={cn("w-full text-left text-xs", className)} {...p} />
  </TableLabels>
);
export const Thead = ({ children }: { children: React.ReactNode }) => (
  <thead><tr className="border-b border-sb-outline-variant/60">{children}</tr></thead>
);
export const Th = ({ className, ...p }: React.ComponentProps<"th">) => (
  <th className={cn("whitespace-nowrap px-3 py-3 text-left text-[11px] font-medium text-sb-on-surface-variant", className)} {...p} />
);
export const Tr = ({ className, ...p }: React.ComponentProps<"tr">) => (
  <tr className={cn("sb-row border-b border-sb-outline-variant/40 transition-colors duration-200 last:border-0 hover:bg-sb-surface-container-low", className)} {...p} />
);
export const Td = ({ className, ...p }: React.ComponentProps<"td">) => (
  <td className={cn("whitespace-nowrap px-3 py-3 align-middle text-sb-on-surface/85", className)} {...p} />
);
export const Empty = ({ cols, children }: { cols: number; children: React.ReactNode }) => (
  <tr><td colSpan={cols} className="px-3 py-12 text-center text-sb-on-surface-variant/60">{children}</td></tr>
);

export const Pill = ({ active, children }: { active?: boolean; children: React.ReactNode }) => (
  <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[10.5px] font-medium", active ? "bg-sb-primary-soft text-sb-primary" : "bg-sb-surface-container text-sb-on-surface-variant")}>
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

/** Código de empresa con estilo de código: EMP-01 en letra monoespaciada, con marco del color de la empresa. */
export const CodeTag = ({ code, size = "sm", className }: { code: string; size?: "xs" | "sm"; className?: string }) => (
  <span
    title="Código de empresa"
    className={cn(
      "inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-sb-primary/35 bg-sb-primary-soft font-mono font-semibold tracking-wider text-sb-primary",
      size === "xs" ? "px-1.5 py-px text-[9px]" : "px-2 py-0.5 text-[11px]",
      className,
    )}
  >
    {code}
  </span>
);
