"use client";
import { cn } from "@/lib/cn";
import { AREAS, areaOf, stageLabel, type Stage } from "@/lib/workflow";
import { StagePicker } from "@/components/StagePicker";

export type Assignment = { area: string; stages: Stage[]; carrier: string };

/** Elegir el área del encargado (las etapas se asignan solas) y, si es transporte, su empresa. */
export function AreaPicker({ value, onChange, carriers }: { value: Assignment; onChange: (v: Assignment) => void; carriers: string[] }) {
  const area = areaOf(value.area);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {AREAS.map((a) => {
          const on = value.area === a.id;
          return (
            <button
              type="button"
              key={a.id}
              onClick={() => onChange({ area: a.id, stages: a.id === "CUSTOM" ? value.stages : [], carrier: a.carrier ? value.carrier : "" })}
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
    </div>
  );
}
