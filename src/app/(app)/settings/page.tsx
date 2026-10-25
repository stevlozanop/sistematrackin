"use client";
import { useEffect, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { MONTHS, SITE_INFO, type Site } from "@/lib/hsp";

type LT = { site: Site; zone: string; days_cre: number; days_vac: number; units?: number };
type Config = { target: number; creciente: number[]; leadTimes: LT[]; missing: { site: Site; zone: string; units: number }[] };

const input = "h-8 rounded-xl border border-sb-outline-variant bg-sb-surface-container-low px-2 text-xs text-sb-on-surface outline-none transition-colors focus:border-sb-primary";

export default function SettingsPage() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);

  const load = () => fetch("/api/settings").then((r) => r.json()).then((d) => { setCfg(d); setSaved(true); });
  useEffect(() => { load(); }, []);

  if (!cfg) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;

  const change = (next: Partial<Config>) => { setCfg({ ...cfg, ...next }); setSaved(false); };
  const setLT = (i: number, patch: Partial<LT>) => change({ leadTimes: cfg.leadTimes.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const addLT = (site: Site, zone = "") => change({ leadTimes: [...cfg.leadTimes, { site, zone, days_cre: 0, days_vac: 0 }] });

  async function save() {
    setSaving(true);
    const r = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: cfg!.target, creciente: cfg!.creciente, leadTimes: cfg!.leadTimes }),
    });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setSaving(false);
    if (!r.ok) return toast.danger(j.error);
    toast.success("Plazos guardados", { description: "Las fechas estimadas y el nivel de servicio ya usan los nuevos valores." });
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Plazos y meta" sub="Fecha estimada = fecha de facturación + plazo. A tiempo = entregado (o todavía en camino) hasta la fecha estimada." />

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card className="flex flex-col gap-3 p-5">
          <h3 className="text-sm font-semibold">Meta de nivel de servicio</h3>
          <label className="flex items-center gap-2 text-sm">
            <input type="number" min={1} max={100} value={cfg.target} onChange={(e) => change({ target: Number(e.target.value) })} className={`w-20 ${input}`} aria-label="Meta en porcentaje" />
            % de unidades a tiempo
          </label>
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <h3 className="text-sm font-semibold">Meses de creciente del río (YUR)</h3>
          <p className="text-[11px] text-sb-on-surface-variant/70">Según el mes de facturación se usa el plazo de creciente o el de vaciante. En el Excel: creciente de enero a abril.</p>
          <div className="flex flex-wrap gap-1.5">
            {MONTHS.map((m, i) => {
              const on = cfg.creciente.includes(i + 1);
              return (
                <button key={m} className={`sbf-chip ${on ? "active" : ""}`} onClick={() => change({ creciente: on ? cfg.creciente.filter((x) => x !== i + 1) : [...cfg.creciente, i + 1] })}>{m}</button>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {(["PCL", "YUR"] as const).map((site) => {
          const yur = site === "YUR";
          return (
            <Card key={site} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-sb-outline-variant/40 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold">{SITE_INFO[site].title} · plazo por {SITE_INFO[site].zoneLabel.toLowerCase()}</h3>
                  <p className="text-[11px] text-sb-on-surface-variant/70">{yur ? "Días según creciente / vaciante." : "Días desde la facturación."}</p>
                </div>
                <Button size="sm" variant="secondary" className="rounded-full" onPress={() => addLT(site)}><Plus className="h-3.5 w-3.5" /> Agregar</Button>
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant/60">
                    <th className="px-4 py-2 font-semibold">{SITE_INFO[site].zoneLabel}</th>
                    <th className="px-2 py-2 font-semibold">{yur ? "Creciente" : "Días"}</th>
                    {yur && <th className="px-2 py-2 font-semibold">Vaciante</th>}
                    <th className="px-2 py-2 text-right font-semibold">Unidades</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cfg.leadTimes.map((l, i) => l.site !== site ? null : (
                    <tr key={i} className="border-b border-sb-outline-variant/25 last:border-0">
                      <td className="px-4 py-1.5"><input value={l.zone} onChange={(e) => setLT(i, { zone: e.target.value.toUpperCase() })} className={`w-full ${input}`} aria-label="Zona" placeholder={yur ? "RUTA ORIENTE 6" : "DEPARTAMENTO"} /></td>
                      <td className="px-2 py-1.5">
                        <input type="number" min={0} value={l.days_cre} aria-label="Días"
                          onChange={(e) => setLT(i, yur ? { days_cre: Number(e.target.value) } : { days_cre: Number(e.target.value), days_vac: Number(e.target.value) })}
                          className={`w-16 ${input}`} />
                      </td>
                      {yur && <td className="px-2 py-1.5"><input type="number" min={0} value={l.days_vac} aria-label="Días vaciante" onChange={(e) => setLT(i, { days_vac: Number(e.target.value) })} className={`w-16 ${input}`} /></td>}
                      <td className="px-2 py-1.5 text-right text-sb-on-surface-variant">{l.units?.toLocaleString() ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right">
                        <button aria-label={`Quitar ${l.zone}`} className="rounded-full p-1.5 opacity-40 hover:bg-sb-surface-container hover:opacity-100" onClick={() => change({ leadTimes: cfg.leadTimes.filter((_, j) => j !== i) })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cfg.missing.filter((m) => m.site === site).length > 0 && (
                <div className="border-t border-sb-outline-variant/40 px-4 py-3 text-[11px]">
                  <p className="mb-2 font-medium">Zonas con unidades pero sin plazo (no tienen fecha estimada):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cfg.missing.filter((m) => m.site === site).map((m) => (
                      <button key={m.zone} className="sbf-chip" onClick={() => addLT(site, m.zone)}>+ {m.zone} ({m.units})</button>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button
          variant="primary"
          className={`rounded-full transition-opacity duration-300 ${saved ? "pointer-events-none opacity-30" : ""}`}
          isDisabled={saving || saved}
          onPress={save}
        >
          <Save className="h-4 w-4" /> {saved ? "Guardado ✓" : saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}
