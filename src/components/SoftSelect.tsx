"use client";
import * as React from "react";
import { ListBox, Select } from "@heroui/react";
import { cn } from "@/lib/cn";

/**
 * Select suave del sistema: se usa igual que un <select> del navegador (mismos <option>, value y onChange con
 * e.target.value), pero abre una lista flotante con el diseño del sistema: esquinas redondas, sombra suave,
 * aparece desde el campo con un leve desenfoque y marca la opción elegida con el color de la empresa.
 */
type Opt = { id: string; value: string; label: React.ReactNode; text: string; disabled: boolean };
const EMPTY = "__vacio__";

const textOf = (n: React.ReactNode): string =>
  n == null || typeof n === "boolean" ? "" : typeof n === "string" || typeof n === "number" ? String(n)
    : Array.isArray(n) ? n.map(textOf).join("") : React.isValidElement(n) ? textOf((n.props as { children?: React.ReactNode }).children) : "";

function optionsOf(children: React.ReactNode): Opt[] {
  const out: Opt[] = [];
  React.Children.forEach(children, (c) => {
    if (!React.isValidElement(c)) return;
    const p = c.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean };
    if (c.type === React.Fragment) { out.push(...optionsOf(p.children)); return; }
    const text = textOf(p.children);
    const value = p.value !== undefined ? String(p.value) : text;
    out.push({ id: value === "" ? EMPTY : value, value, label: p.children, text: text || value, disabled: !!p.disabled });
  });
  return out;
}

// Las clases de ancho van al contenedor; las de aspecto (alto, borde, texto) al botón
const LAYOUT = /^(?:[a-z]+:)?(?:w-|min-w-|max-w-|flex-|shrink|grow|basis-|col-|row-|self-|justify-self-|order-|m[trblxy]?-|-m[trblxy]?-)/;

export function SoftSelect({ value, onChange, children, className, disabled, required, title, id, ...aria }: {
  value?: string | number | null; onChange?: (e: { target: { value: string } }) => void; children?: React.ReactNode;
  className?: string; disabled?: boolean; required?: boolean; title?: string; id?: string;
  "aria-label"?: string; "aria-labelledby"?: string; name?: string;
}) {
  const opts = React.useMemo(() => optionsOf(children), [children]);
  const v = value == null ? "" : String(value);
  const selected = opts.find((o) => o.value === v)?.id ?? null;
  const tokens = (className ?? "").split(/\s+/).filter(Boolean);
  const outer = tokens.filter((t) => LAYOUT.test(t)).join(" ");
  const inner = tokens.filter((t) => !LAYOUT.test(t)).join(" ");
  return (
    <Select
      id={id} aria-label={aria["aria-label"] ?? title ?? "Elegir"} aria-labelledby={aria["aria-labelledby"]} name={aria.name}
      className={cn("sb-soft-select", outer || "min-w-[10rem]")} value={selected} isDisabled={disabled} isRequired={required}
      placeholder={opts.find((o) => o.value === "")?.text ?? "Elegir…"}
      onChange={(k) => onChange?.({ target: { value: k == null || k === EMPTY ? "" : opts.find((o) => o.id === String(k))?.value ?? String(k) } })}
    >
      <Select.Trigger className={cn("sb-soft-select__trigger", inner)}>
        <Select.Value className="truncate" />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover className="sb-soft-pop">
        <ListBox>
          {opts.map((o) => (
            <ListBox.Item key={o.id} id={o.id} textValue={o.text} isDisabled={o.disabled}>
              {o.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
