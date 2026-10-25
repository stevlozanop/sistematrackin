"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { SITE_INFO, type Site } from "@/lib/hsp";
import { AREAS, areaOf, stageLabel, type Stage } from "@/lib/workflow";
import { StagePicker } from "@/components/StagePicker";

export type Assignment = { area: string; stages: Stage[]; carrier: string; canImport: boolean };

/**
 * Paso 1: módulo (PCL Pucallpa o YUR Yurimaguas). Paso 2: área de ese módulo (las etapas se asignan solas).
 * El encargado solo verá el módulo que se elija aquí.
 */
export function AreaPicker({ value, onChange, carriers }: { value: Assignment; onChange: (v: Assignment) => void; carriers: string[] }) {
  const area = areaOf(value.area);
  const [module, setModule] = useState<Site | "CUSTOM" | null>(area ? (area.site ?? "CUSTOM") : null);
  const pick = (m: Site | "CUSTOM") => {
    setModule(m);
    if (m === "CUSTOM") onChange({ ...value, area: "CUSTOM", stages: value.area === "CUSTOM" ? value.stages : [], carrier: "" });
    else if (area?.site !== m) onChange({ ...value, area: "", stages: [], carrier: "" });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-sb-on-surface-variant">1. ¿En qué módulo trabaja?</span>
        <div className="grid grid-cols-2 gap-2">
          {(["PCL", "YUR"] as const).map((m) => (
            <button key={m} type="button" onClick={() => pick(m)}
              className={cn("rounded-xl border p-2.5 text-left transition-colors", module === m ? "border-sb-on-surface bg-sb-on-surface text-sb-surface" : "border-sb-outline-variant/60 hover:bg-sb-surface-container-low")}>
              <div className="text-sm font-semibold">{SITE_INFO[m].title}</div>
              <div className="text-[10px] opacity-70">{m === "PCL" ? "Iquitos → Pucallpa → dealers (y Ruta Lima)" : "Iquitos → Yurimaguas → dealers"}</div>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => pick("CUSTOM")} className={cn("self-start text-[11px] underline underline-offset-2", module === "CUSTOM" ? "font-semibold" : "text-sb-on-surface-variant")}>
          Personalizado: elegir etapas a mano (puede mezclar PCL y YUR)
        </button>
      </div>
      {module && module !== "CUSTOM" && <span className="text-[11px] font-semibold text-sb-on-surface-variant">2. ¿Qué área de {SITE_INFO[module].title}?</span>}
      <div className="grid gap-2 sm:grid-cols-2">
        {AREAS.filter((a) => module && module !== "CUSTOM" && a.site === module).map((a) => {
          const on = value.area === a.id;
          return (
            <button
              type="button"
              key={a.id}
              onClick={() => onChange({ ...value, area: a.id, stages: a.id === "CUSTOM" ? value.stages : [], carrier: a.carrier ? value.carrier : "" })}
              className={cn("rounded-xl border p-2.5 text-left transition-colors", on ? "border-sb-on-surface bg-sb-on-surface text-sb-surface" : "border-sb-outline-variant/60 hover:bg-sb-surface-container-low")}
            >
              <div className="text-xs font-semibold">{a.label}</div>
              <div className="mt-0.5 text-[10px] leading-snug opacity-70">
                {a.site ? a.fields.map((f) => stageLabel(a.site!, f)).join(" · ") : a.desc}
              </div>
            </button>
          );
        })}
      </div>
      {area && area.id !== "CUSTOM" && <p className="text-[11px] text-muted">{area.desc}</p>}
      {area?.id === "CUSTOM" && <StagePicker value={value.stages} onChange={(stages) => onChange({ ...value, stages })} />}
      {area?.carrier && (
        <label className="flex flex-col gap-1 text-xs">
          Empresa de transporte (opcional)
          <input
            list="area-carriers"
            value={value.carrier}
            onChange={(e) => onChange({ ...value, carrier: e.target.value })}
            placeholder="Vacío = ve las unidades de todas las empresas"
            className="h-9 rounded-xl border border-sb-outline-variant bg-sb-surface-container-low px-3 text-xs outline-none focus:border-sb-primary"
          />
          <datalist id="area-carriers">{carriers.map((c) => <option key={c} value={c} />)}</datalist>
          <span className="text-[10px] text-muted">Si eliges una empresa, este usuario solo verá y registrará las unidades que lleva esa empresa.</span>
        </label>
      )}
      {module && (
        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-sb-outline-variant/60 p-2.5 text-xs">
          <input type="checkbox" checked={value.canImport} onChange={(e) => onChange({ ...value, canImport: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[var(--sb-primary)]" />
          <span>
            <b>Puede subir Excel con las fechas de su etapa</b>
            <span className="block text-[10px] text-muted">Carga masiva: solo se guardan sus etapas, en orden y sin cambiar fechas ya registradas.</span>
          </span>
        </label>
      )}
    </div>
  );
}
