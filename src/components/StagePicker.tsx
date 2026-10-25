"use client";
import { SITES, SITE_INFO } from "@/lib/hsp";
import type { Stage } from "@/lib/workflow";

/** Casillas para elegir las etapas (por módulo) que llenará un encargado. */
export function StagePicker({ value, onChange }: { value: Stage[]; onChange: (v: Stage[]) => void }) {
  const has = (s: Stage) => value.some((v) => v.site === s.site && v.field === s.field);
  const toggle = (s: Stage) => onChange(has(s) ? value.filter((v) => !(v.site === s.site && v.field === s.field)) : [...value, s]);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {SITES.map((site) => (
        <fieldset key={site} className="rounded-xl border border-sb-outline-variant/60 p-3">
          <legend className="px-1 text-[11px] font-semibold">{SITE_INFO[site].title}</legend>
          <div className="flex flex-col gap-1.5">
            {SITE_INFO[site].dates.map((d) => {
              const st = { site, field: d.key };
              return (
                <label key={d.key} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input type="checkbox" checked={has(st)} onChange={() => toggle(st)} className="h-3.5 w-3.5 accent-[var(--sb-primary)]" />
                  {d.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
