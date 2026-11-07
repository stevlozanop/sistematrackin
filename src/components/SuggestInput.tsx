"use client";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type Suggestion = { value: string; label?: string };

/**
 * Buscador con sugerencias mientras se escribe: desde la primera letra (o al tocarlo) muestra lo que coincide
 * y se va acotando con cada dígito. ↑ ↓ para moverse, Enter o clic para elegir, Esc para cerrar.
 * - source: URL que devuelve { items: [{ value, label }] } para lo escrito (o una lista fija)
 * - onPick: al elegir una sugerencia · onEnter: Enter sin sugerencia marcada (lo de siempre)
 */
export function SuggestInput({ value, onChange, onPick, onEnter, source, placeholder, className, inputClassName, disabled, mono, ariaLabel }: {
  value: string; onChange: (v: string) => void; onPick: (v: string) => void; onEnter?: () => void;
  source: ((q: string) => string) | Suggestion[]; placeholder?: string; className?: string; inputClassName?: string;
  disabled?: boolean; mono?: boolean; ariaLabel?: string;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const fixed = Array.isArray(source) ? source : null;
  // La URL ya armada: así el efecto solo corre cuando cambia lo que se busca
  const target = Array.isArray(source) ? null : source(value.trim());

  // Lista fija: se filtra aquí mismo
  const shown = fixed
    ? fixed.filter((s) => !value.trim() || `${s.value} ${s.label ?? ""}`.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 12)
    : items;

  useEffect(() => {
    if (!open || !target) return;
    let alive = true;
    const t = setTimeout(() => {
      setLoading(true);
      fetch(target).then((r) => (r.ok ? r.json() : { items: [] })).then((j) => { if (alive) { setItems(j.items ?? []); setActive(-1); } })
        .catch(() => {}).finally(() => alive && setLoading(false));
    }, 120);
    return () => { alive = false; clearTimeout(t); };
  }, [target, open]);

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);

  const pick = (v: string) => { onPick(v); setOpen(false); setActive(-1); };

  return (
    <div ref={box} className={cn("relative min-w-0 flex-1", className)}>
      <input
        role="combobox" aria-expanded={open && shown.length > 0} aria-controls={id} aria-autocomplete="list" aria-label={ariaLabel ?? placeholder}
        className={inputClassName} placeholder={placeholder} value={value} disabled={disabled} autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
          else if (e.key === "Escape") setOpen(false);
          else if (e.key === "Enter") {
            e.preventDefault();
            if (open && active >= 0 && shown[active]) pick(shown[active].value);
            else if (open && shown.length === 1) pick(shown[0].value);
            else { setOpen(false); onEnter?.(); }
          }
        }}
      />
      {open && !disabled && (shown.length > 0 || loading || value.trim()) && (
        <ul id={id} role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-sb-outline-variant bg-sb-surface p-1 shadow-xl">
          {shown.map((s, i) => (
            <li key={`${s.value}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(s.value); }} onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer flex-col rounded-lg px-3 py-2 text-left", i === active ? "bg-sb-primary-soft" : "hover:bg-sb-surface-container-low")}>
              <span className={cn("text-sm font-semibold", mono && "font-mono")}><Mark text={s.value} q={value.trim()} /></span>
              {s.label && <span className="truncate text-[11px] text-sb-on-surface-variant">{s.label}</span>}
            </li>
          ))}
          {!shown.length && <li className="px-3 py-2 text-xs text-sb-on-surface-variant">{loading ? "Buscando…" : "Nada coincide"}</li>}
        </ul>
      )}
    </div>
  );
}

/** Resalta la parte que coincide con lo escrito */
function Mark({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded bg-sb-primary/20 px-0.5 text-inherit">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}
