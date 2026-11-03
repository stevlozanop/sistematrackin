"use client";
import { Description, Radio, RadioGroup } from "@heroui/react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/** Elegir una opción con el RadioGroup de HeroUI, en forma de tarjetas (título, descripción e ícono). */
export function ChoiceCards<T extends string>({ value, onChange, options, columns = 2, label }: {
  value: T; onChange: (v: T) => void; columns?: 1 | 2 | 3 | 4; label?: string;
  options: { key: T; label: string; desc?: string; icon?: LucideIcon; disabled?: boolean }[];
  /** Se acepta por compatibilidad */
  id?: string;
}) {
  return (
    <RadioGroup aria-label={label ?? "Opciones"} value={value} onChange={(v) => onChange(v as T)}
      className={cn("grid gap-2 **:data-[slot=radio]:mt-0", columns === 1 ? "grid-cols-1" : columns === 3 ? "grid-cols-1 sm:grid-cols-3" : columns === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-2")}>
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <Radio key={o.key} value={o.key} isDisabled={o.disabled} className="h-full w-full">
            <Radio.Content className="flex h-full w-full cursor-pointer items-start gap-3 rounded-2xl border border-sb-outline-variant/70 p-3 transition-colors hover:border-sb-outline data-[selected=true]:border-sb-primary data-[selected=true]:bg-sb-primary-soft">
              <Radio.Control className="mt-0.5 shrink-0"><Radio.Indicator /></Radio.Control>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">{Icon && <Icon className="h-4 w-4 shrink-0 text-sb-on-surface-variant" />}{o.label}</span>
                {o.desc && <Description className="text-xs">{o.desc}</Description>}
              </div>
            </Radio.Content>
          </Radio>
        );
      })}
    </RadioGroup>
  );
}
