"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Check, Inbox, Search, Truck } from "lucide-react";
import { Kind } from "@/components/Kinds";
import { Card, PageTitle } from "@/components/ui";
import { DatePicker, pastQuick } from "@/components/modal/DatePicker";
import { SuggestInput } from "@/components/SuggestInput";
import { DATA_EVENT } from "@/components/UploadCenter";
import { DELAY_REASONS, SITE_INFO, fmtDate, type Site } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { cn } from "@/lib/cn";
import { TripCard, type Trip } from "@/components/yur/YurTrips";
import { SoftSelect } from "@/components/SoftSelect";

/**
 * 6. Entrega · Conductor: escribe su nombre, ve las guías que lleva (en «Tránsito dealer»),
 * marca las que entregó y registra la entrega → «Entregado».
 */

type Row = { guia: string | null; district: string | null; department: string | null; via_lima: number; dealer: string | null; driver: string; w2: number; w3: number; total: number; dispatched: string; need: number };

const field = "h-10 w-full rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-on-surface";
const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");
/** Guía: marca · guía/dealer · despachada · motos y motokares · total (celular: marca · guía · total) */
const GCOLS = "grid-cols-[1.25rem_minmax(0,1fr)_3rem] gap-x-3 sm:grid-cols-[1.25rem_minmax(0,1fr)_6rem_10rem_3rem]";
const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-sb-outline-variant/60 px-4 py-10 text-center text-xs text-sb-on-surface-variant">
    <Inbox className="h-5 w-5 opacity-50" />{children}
  </div>
);

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
  // Yurimaguas: viajes del conductor con sus paradas (Llegué / Entregar parada por parada)
  const [trips, setTrips] = useState<{ canArrive: boolean; canDeliver: boolean; trips: Trip[] } | null>(null);
  const [openTrip, setOpenTrip] = useState<number | null>(null);
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

  useEffect(() => {
    if (current !== "YUR" || !searched) return;
    let alive = true;
    fetch(`/api/yur?${new URLSearchParams({ view: "viajes", driver: searched })}`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      const live = { ...j, trips: (j.trips ?? []).filter((t: Trip) => t.delivered < t.total) };
      setTrips(live);
      setOpenTrip((o) => o ?? live.trips[0]?.id ?? null);
    }).catch(() => {});
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
                className={cn("sb-pill rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200", current === s ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
                {SITE_INFO[s].title}
              </button>
            ))}
          </div>
        )}
      </PageTitle>

      {current === "YUR" && searched && trips && trips.trips.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4" /> Tu viaje · paradas en orden</h3>
          <p className="-mt-1 text-[11px] text-sb-on-surface-variant">Al llegar a cada pueblo pulsa «Llegué»; al dejar las motos, «Entregar». Así la empresa ve dónde vas y el dealer recibe su aviso.</p>
          {trips.trips.map((t) => (
            <TripCard key={t.id} t={t} open={openTrip === t.id} onToggle={() => setOpenTrip(openTrip === t.id ? null : t.id)}
              canArrive={trips.canArrive} canDeliver={trips.canDeliver} onChanged={() => setReload((x) => x + 1)} />
          ))}
        </div>
      )}

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
                    className="sb-pill rounded-full border border-sb-outline-variant px-3 py-1 text-xs hover:border-sb-primary">{d.name} <span className="text-sb-on-surface-variant">· {d.units}</span></button>
                ))}
              </div>
            )}
            {/* Paradas del camión: una por distrito, con sus guías para marcar como entregadas */}
            <div className="flex flex-col gap-2.5">
              {!searched && <Empty>Escribe tu nombre y pulsa «Buscar».</Empty>}
              {searched && !rows && [0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-sb-surface-container-low" />)}
              {searched && rows && !rows.length && <Empty>No hay entregas pendientes para «{searched}».</Empty>}
              {stops.map(([d, list], si) => {
                const t = list.reduce((a, r) => ({ total: a.total + r.total, w2: a.w2 + r.w2, w3: a.w3 + r.w3 }), { total: 0, w2: 0, w3: 0 });
                const origin = list.some((r) => r.via_lima) ? "Lima" : city;
                const marked = list.filter((r) => sel.has(k(r))), all = marked.length === list.length;
                const late = list.reduce((x, r) => x + r.need, 0);
                const flipStop = () => canDeliver && setSel((s) => { const y = new Set(s); for (const r of list) { if (all) y.delete(k(r)); else y.add(k(r)); } return y; });
                return (
                  <div key={d} className="overflow-hidden rounded-2xl border border-sb-outline-variant/50">
                    {/* Parada */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-sb-surface-container-low/70 px-3 py-2.5">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sb-primary text-xs font-bold text-sb-on-primary">{si + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] uppercase tracking-wider text-sb-on-surface-variant">{origin} → parada {si + 1}{list[0].department ? ` · ${list[0].department}` : ""}</p>
                        <p className="truncate text-base font-semibold uppercase leading-tight tracking-tight">{d}</p>
                      </div>
                      <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
                        {(t.w2 > 0 || !t.w3) && <Kind v={t.w2} k="w2" />}
                        {t.w3 > 0 && <Kind v={t.w3} k="w3" />}
                        {late > 0 && <span className="rounded-full bg-sb-late-soft px-2 py-0.5 text-[11px] font-semibold text-sb-late">{late} tarde</span>}
                      <button type="button" onClick={flipStop} disabled={!canDeliver}
                        className={cn("sb-pill-sm ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50",
                          all ? "border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant bg-sb-surface hover:border-sb-primary")}>
                        <Check className="h-3 w-3" strokeWidth={3} />{all ? (list.length === 1 ? "Entregada" : "Todas entregadas") : list.length === 1 ? "Marcar entregada" : `Marcar las ${list.length}`}
                        {list.length > 1 && <span className="tabular-nums opacity-70">{marked.length}/{list.length}</span>}
                      </button>
                      </div>
                    </div>
                    {/* Encabezado (escritorio) */}
                    <div className={cn(GCOLS, "hidden border-b border-sb-outline-variant/30 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant sm:grid")}>
                      <span /><span>Guía · dealer</span><span>Despachada</span><span>Motos y motokares</span><span className="text-right">Total</span>
                    </div>
                    <div className="flex flex-col p-1">
                      {list.map((r) => {
                        const on = sel.has(k(r));
                        const flip = () => canDeliver && setSel((s) => { const y = new Set(s); if (y.has(k(r))) y.delete(k(r)); else y.add(k(r)); return y; });
                        return (
                          <button key={`${k(r)}|${r.dealer}`} type="button" role="checkbox" aria-checked={on} aria-label={`Entregado ${r.guia}`} onClick={flip} disabled={!canDeliver}
                            className={cn(GCOLS, "grid items-center gap-y-1 rounded-xl px-2 py-2.5 text-left transition-colors duration-200 disabled:cursor-default", on ? "bg-sb-primary-soft" : "hover:bg-sb-surface-container-low")}>
                            <span className={cn("grid h-5 w-5 place-items-center rounded-full border transition-all duration-200", on ? "scale-105 border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant bg-sb-surface")}>
                              <Check className={cn("h-3 w-3 transition-opacity", on ? "opacity-100" : "opacity-0")} strokeWidth={3} />
                            </span>
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5 font-mono text-sm font-semibold tracking-tight">
                                {r.guia ?? "—"}{r.need ? <span className="rounded-full bg-sb-late-soft px-1.5 font-sans text-[10px] font-semibold text-sb-late">{r.need} tarde</span> : null}
                              </span>
                              <span className="block truncate text-[11px] text-sb-on-surface-variant" title={r.dealer ?? ""}>{r.dealer ?? "—"}</span>
                              <span className="mt-1 flex flex-wrap items-center gap-1 sm:hidden">
                                {(r.w2 > 0 || !r.w3) && <Kind v={r.w2} k="w2" />}{r.w3 > 0 && <Kind v={r.w3} k="w3" short />}
                                <span className="text-[10px] text-sb-on-surface-variant">· despacho {fmtDate(r.dispatched)}</span>
                              </span>
                            </span>
                            <span className="hidden text-xs sm:block">{fmtDate(r.dispatched)}</span>
                            <span className="hidden flex-wrap gap-1 sm:flex">{(r.w2 > 0 || !r.w3) && <Kind v={r.w2} k="w2" />}{r.w3 > 0 && <Kind v={r.w3} k="w3" short />}</span>
                            <span className="text-right"><span className="block text-sm font-semibold tabular-nums">{n(r.total)}</span><span className="block text-[10px] text-sb-on-surface-variant">unid.</span></span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-sb-outline-variant/40 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <div className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Fecha de entrega
              <DatePicker label="Fecha de entrega" value={date} min={min || null} onChange={setDate} disabled={!canDeliver} quick={pastQuick(min || null, today())} />
            </div>
            {need > 0 && (
              <label className="flex flex-col gap-1 text-[11px] text-sb-late">Motivo de demora ({need} fuera de tiempo · puedes dejarlo para después)
                <SoftSelect className={field} value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Elegir…</option>{DELAY_REASONS.map((r) => <option key={r}>{r}</option>)}</SoftSelect>
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
