"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Search, Truck } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { DatePicker, pastQuick } from "@/components/modal/DatePicker";
import { SuggestInput } from "@/components/SuggestInput";
import { DATA_EVENT } from "@/components/UploadCenter";
import { DELAY_REASONS, SITE_INFO, fmtDate, unitsText, type Site } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { cn } from "@/lib/cn";

/**
 * 6. Entrega · Conductor: escribe su nombre, ve las guías que lleva (en «Tránsito dealer»),
 * marca las que entregó y registra la entrega → «Entregado».
 */

type Row = { guia: string | null; district: string | null; department: string | null; via_lima: number; dealer: string | null; driver: string; w2: number; w3: number; total: number; dispatched: string; need: number };

const field = "h-10 w-full rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-on-surface";
const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");

export default function ConductorPage() {
  const [me, setMe] = useState<{ role: string; name?: string; stages: { site: Site; field: string }[] } | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [drivers, setDrivers] = useState<{ name: string; units: number }[]>([]);
  const [canDeliver, setCanDeliver] = useState(false);
  const [name, setName] = useState("");
  const [searched, setSearched] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const again = () => setReload((x) => x + 1);
    window.addEventListener(DATA_EVENT, again);
    return () => window.removeEventListener(DATA_EVENT, again);
  }, []);

  useEffect(() => { fetch("/api/me").then((r) => r.json()).then(setMe); }, []);
  const sites = useMemo<Site[]>(() => {
    if (!me) return [];
    if (me.role !== "operator") return ["PCL", "YUR"];
    return (["PCL", "YUR"] as Site[]).filter((s) => me.stages.some((st) => st.site === s && st.field === "d_entrega"));
  }, [me]);
  const current = site ?? sites[0] ?? null;

  useEffect(() => {
    if (!current) return;
    fetch(`/api/entrega?${new URLSearchParams({ site: current, drivers: "1" })}`).then((r) => r.json()).then((j) => { setDrivers(j.drivers ?? []); setCanDeliver(!!j.canDeliver); });
  }, [current, reload]);
  useEffect(() => {
    if (!current || !searched) return;
    let alive = true;
    fetch(`/api/entrega?${new URLSearchParams({ site: current, driver: searched })}`).then((r) => r.json()).then((j) => { if (alive) setRows(j.rows ?? []); });
    return () => { alive = false; };
  }, [current, searched, reload]);

  const k = (r: Row) => r.guia ?? "";
  // Paradas del camión: una por distrito de destino
  const stops = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows ?? []) { const d = r.district ?? "—"; m.set(d, [...(m.get(d) ?? []), r]); }
    return [...m.entries()];
  }, [rows]);
  const chosen = (rows ?? []).filter((r) => sel.has(k(r)));
  const need = chosen.reduce((t, r) => t + r.need, 0);
  const min = chosen.reduce((m, r) => (r.dispatched > m ? r.dispatched : m), "");

  async function save() {
    if (!current || !chosen.length) return toast.danger("Marca las guías que entregaste");
    if (min && date < min) return toast.danger(`La entrega no puede ser antes del despacho (${fmtDate(min)})`);
    setSaving(true);
    const r = await fetch("/api/entrega", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deliver", site: current, guias: chosen.map(k), date, lateReason: need ? reason : undefined }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setSaving(false);
    if (!r.ok) return toast.danger(j.error);
    toast.success(`Entrega registrada: ${chosen.length} guía(s)`, { description: `${n(j.units)} unidades → Entregado`, timeout: 7000 });
    if (need && !reason) toast.warning(`${need} unidades quedaron sin motivo de demora`, { description: "Puedes justificarlas después desde PCL/YUR o Alertas", timeout: 8000 });
    setSel(new Set()); setReason(""); setReload((x) => x + 1);
  }

  if (!me) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  if (!sites.length || !current) return <div className="p-6 text-sm text-sb-on-surface-variant">La entrega no es una etapa asignada a ti.</div>;
  const city = current === "PCL" ? "Pucallpa" : "Yurimaguas";

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Entrega · Conductor" sub="6. Escribe tu nombre, marca las guías que entregaste a cada dealer y registra la entrega.">
        {sites.length > 1 && (
          <div className="flex rounded-full bg-sb-surface-container p-1">
            {sites.map((s) => (
              <button key={s} type="button" onClick={() => { setSite(s); setSel(new Set()); setRows(null); setSearched(""); }}
                className={cn("rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200", current === s ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
                {SITE_INFO[s].title}
              </button>
            ))}
          </div>
        )}
      </PageTitle>

      <Card className="overflow-hidden">
        <div className="border-b border-sb-outline-variant/40 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4" /> Lo que llevas en el camión</h3>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_17rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setSel(new Set()); setRows(null); setSearched(name.trim()); }}>
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-[11px] text-sb-on-surface-variant">Nombre del conductor
                <SuggestInput inputClassName={cn(field, "uppercase")} placeholder="Escribe tu nombre (ej. VIDAL)" value={name} onChange={setName}
                  onPick={(v) => { setName(v); setSel(new Set()); setRows(null); setSearched(v); }}
                  onEnter={() => { setSel(new Set()); setRows(null); setSearched(name.trim()); }}
                  source={(q) => `/api/suggest?${new URLSearchParams({ kind: "driver", site: current, q })}`} />
              </label>
              <Button type="submit" variant="primary" className="rounded-full" isDisabled={!name.trim()}><Search className="h-4 w-4" /> Buscar</Button>
              <span className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Estado
                <span className="rounded-full border border-sb-outline-variant px-3 py-2 text-xs font-semibold text-sb-on-surface">Tránsito dealer</span></span>
            </form>
            {!searched && drivers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {drivers.map((d) => (
                  <button key={d.name} type="button" onClick={() => { setName(d.name); setSel(new Set()); setRows(null); setSearched(d.name); }}
                    className="rounded-full border border-sb-outline-variant px-3 py-1 text-xs hover:border-sb-primary">{d.name} <span className="text-sb-on-surface-variant">· {d.units}</span></button>
                ))}
              </div>
            )}
            <div className="overflow-x-auto rounded-xl border border-sb-outline-variant/40">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead>
                  <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant">
                    <th className="px-3 py-2 font-semibold">Distrito</th><th className="px-2 py-2 font-semibold">Dealer</th><th className="px-2 py-2 font-semibold">Guía</th>
                    <th className="px-2 py-2 text-right font-semibold">2W</th><th className="px-2 py-2 text-right font-semibold">3W</th><th className="px-3 py-2 text-center font-semibold">Entregado</th>
                  </tr>
                </thead>
                <tbody>
                  {stops.map(([d, list], si) => {
                    const t = list.reduce((a, r) => ({ total: a.total + r.total, w2: a.w2 + r.w2, w3: a.w3 + r.w3 }), { total: 0, w2: 0, w3: 0 });
                    const origin = list.some((r) => r.via_lima) ? "Lima" : city;
                    return [
                      <tr key={`stop-${d}`} className="border-b border-sb-outline-variant/30 bg-sb-surface-container-low/70">
                        <td colSpan={6} className="px-3 py-2">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="grid h-5 w-5 place-items-center rounded-full bg-sb-primary text-[10px] font-bold text-sb-on-primary">{si + 1}</span>
                            <span className="text-[11px] text-sb-on-surface-variant">{origin} →</span>
                            <b className="text-sm">{d}</b>
                            <span className="text-[11px] text-sb-on-surface-variant">{list[0].department ?? ""} · {list.length} guía(s) · {unitsText(t.w2, t.w3)}</span>
                          </span>
                        </td>
                      </tr>,
                      ...list.map((r) => {
                        const on = sel.has(k(r));
                        const flip = () => canDeliver && setSel((s) => { const y = new Set(s); if (y.has(k(r))) y.delete(k(r)); else y.add(k(r)); return y; });
                        return (
                          <tr key={`${k(r)}|${r.dealer}`} onClick={flip} className={cn("cursor-pointer border-b border-sb-outline-variant/20 last:border-0", on ? "bg-sb-primary-soft" : "hover:bg-sb-surface-container-low")}>
                            <td className="px-3 py-2.5 pl-10 font-medium">{r.district ?? "—"}<span className="block text-[10px] font-normal text-sb-on-surface-variant">despacho {fmtDate(r.dispatched)}</span></td>
                            <td className="max-w-[14rem] truncate px-2 py-2.5" title={r.dealer ?? ""}>{r.dealer ?? "—"}</td>
                            <td className="px-2 py-2.5 font-mono font-semibold">{r.guia ?? "—"}{r.need ? <span className="ml-1 rounded-full bg-sb-late-soft px-1.5 font-sans text-[10px] text-sb-late">{r.need} tarde</span> : null}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums">{r.w2 || ""}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums">{r.w3 || ""}</td>
                            <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" className="h-5 w-5 accent-[var(--sb-primary)]" aria-label={`Entregado ${r.guia}`} checked={on} disabled={!canDeliver} onChange={flip} />
                            </td>
                          </tr>
                        );
                      }),
                    ];
                  })}
                  {!searched && <tr><td colSpan={6} className="px-3 py-8 text-center text-sb-on-surface-variant">Escribe tu nombre y pulsa «Buscar».</td></tr>}
                  {searched && rows && !rows.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-sb-on-surface-variant">No hay entregas pendientes para «{searched}».</td></tr>}
                  {searched && !rows && <tr><td colSpan={6} className="px-3 py-8 text-center text-sb-on-surface-variant">Buscando…</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-sb-outline-variant/40 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <div className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Fecha de entrega
              <DatePicker label="Fecha de entrega" value={date} min={min || null} onChange={setDate} disabled={!canDeliver} quick={pastQuick(min || null, today())} />
            </div>
            {need > 0 && (
              <label className="flex flex-col gap-1 text-[11px] text-sb-late">Motivo de demora ({need} fuera de tiempo · puedes dejarlo para después)
                <select className={field} value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Elegir…</option>{DELAY_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
              </label>
            )}
            <Button variant="primary" className="rounded-full" onPress={save} isDisabled={saving || !chosen.length || !canDeliver}>
              {saving ? "Registrando…" : chosen.length ? `Registrar entrega (${chosen.length})` : "Registrar entrega"}
            </Button>
            {chosen.length > 0 && <p className="text-[11px] text-sb-on-surface-variant">{n(chosen.reduce((t, r) => t + r.total, 0))} unidades pasan a Entregado.</p>}
            {!canDeliver && <p className="text-[11px] text-sb-on-surface-variant">Solo lectura: la entrega no es tu etapa.</p>}
          </div>
        </div>
      </Card>
    </div>
  );
}
