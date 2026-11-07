"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, toast } from "@heroui/react";
import { ArrowDown, Eye, Plus, Truck, X } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { Sheet } from "@/components/modal/Sheet";
import { DatePicker, pastQuick } from "@/components/modal/DatePicker";
import { DATA_EVENT } from "@/components/UploadCenter";
import { DELAY_REASONS, SITE_INFO, fmtDate, type Site } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { cn } from "@/lib/cn";

/**
 * 5. Despacho de almacén: se arma el viaje del camión agregando guías, con chofer, placa y fecha
 * → sus unidades pasan a «Tránsito dealer». Abajo, el resumen de los viajes y su detalle.
 */

type Guia = { guia: string; district: string; dealer: string; w2: number; w3: number; total: number; need: number; skipped: number };
type Trip = { id: number; dispatched_on: string; driver: string; plate: string | null; destinos: string | null; dealers: string | null; w2: number; w3: number; total: number; delivered: number };
type Data = { site: Site; canDispatch: boolean; drivers: string[]; trips: Trip[]; error?: string };
type TripRow = { guia: string | null; district: string | null; department: string | null; dealer: string | null; invoice: string | null; w2: number; w3: number; total: number; delivered: number; delivered_on: string | null; via_lima: number; reception: { kind: string; note: string | null } | null };

const field = "h-10 w-full rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-on-surface";
const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");
const Label = ({ t, children }: { t: string; children: React.ReactNode }) => <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">{t}{children}</label>;

function TripDetail({ site, trip, onClose }: { site: Site; trip: Trip | null; onClose: () => void }) {
  const [rows, setRows] = useState<TripRow[] | null>(null);
  useEffect(() => {
    if (!trip) return;
    fetch(`/api/despacho?${new URLSearchParams({ site, trip: String(trip.id) })}`).then((r) => r.json()).then((j) => setRows(j.rows ?? []));
  }, [site, trip]);
  return (
    <Sheet open={!!trip} onClose={onClose} size="lg" icon={Truck} title={trip ? `Viaje de ${trip.driver}` : ""}
      sub={trip ? `${fmtDate(trip.dispatched_on)}${trip.plate ? ` · placa ${trip.plate}` : ""} · ${n(trip.total)} unidades · ${n(trip.delivered)} entregadas` : ""}>
      {!rows ? <p className="py-8 text-center text-sm text-sb-on-surface-variant">Cargando…</p> : (
        <div className="max-h-[60vh] overflow-auto rounded-xl border border-sb-outline-variant/40">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant">
                <th className="px-3 py-2 font-semibold">Destino</th><th className="px-2 py-2 font-semibold">Dealer</th><th className="px-2 py-2 font-semibold">N° factura</th>
                <th className="px-2 py-2 font-semibold">Guía R.</th><th className="px-2 py-2 text-right font-semibold">2W</th><th className="px-2 py-2 text-right font-semibold">3W</th>
                <th className="px-2 py-2 text-right font-semibold">Cantidad</th><th className="px-3 py-2 text-right font-semibold">Entrega</th>
              </tr>
            </thead>
            <tbody>
              {[...new Map(rows.map((r) => [r.district ?? "—", rows.filter((x) => (x.district ?? "—") === (r.district ?? "—"))])).entries()].map(([d, list], si) => [
                <tr key={`h-${d}`} className="border-b border-sb-outline-variant/30 bg-sb-surface-container-low/70">
                  <td colSpan={8} className="px-3 py-2">
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-sb-primary text-[10px] font-bold text-sb-on-primary">{si + 1}</span>
                      <span className="text-[11px] text-sb-on-surface-variant">{list.some((x) => x.via_lima) ? "Lima" : site === "PCL" ? "Pucallpa" : "Yurimaguas"} →</span>
                      <b>{d}</b><span className="text-[11px] text-sb-on-surface-variant">{list[0].department ?? ""} · {n(list.reduce((t, x) => t + x.delivered, 0))}/{n(list.reduce((t, x) => t + x.total, 0))} entregadas</span>
                    </span>
                  </td>
                </tr>,
                ...list.map((r) => (
                <tr key={`${r.guia}|${r.dealer}`} className="border-b border-sb-outline-variant/20 last:border-0">
                  <td className="px-3 py-2 pl-9 font-medium">{r.district ?? "—"}</td>
                  <td className="max-w-[12rem] truncate px-2 py-2" title={r.dealer ?? ""}>{r.dealer ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px]">{r.invoice ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px] font-semibold">{r.guia ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.w2 || ""}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.w3 || ""}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{n(r.total)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={cn("tabular-nums", r.delivered === r.total ? "font-semibold text-sb-primary" : "text-sb-on-surface-variant")}>{r.delivered === r.total ? fmtDate(r.delivered_on) : `${n(r.delivered)}/${n(r.total)}`}</span>
                    {r.reception && <span className={cn("block text-[10px]", r.reception.kind === "completo" ? "text-sb-primary" : "text-sb-late")} title={r.reception.note ?? ""}>{r.reception.kind === "completo" ? "Dealer: completo" : "Dealer: con observación"}</span>}
                  </td>
                </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      )}
    </Sheet>
  );
}

export default function DespachoPage() {
  const [me, setMe] = useState<{ role: string; stages: { site: Site; field: string }[] } | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const again = () => setReload((x) => x + 1);
    window.addEventListener(DATA_EVENT, again);
    return () => window.removeEventListener(DATA_EVENT, again);
  }, []);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [guias, setGuias] = useState<Guia[]>([]);
  const [driver, setDriver] = useState("");
  const [plate, setPlate] = useState("");
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<Trip | null>(null);

  useEffect(() => { fetch("/api/me").then((r) => r.json()).then(setMe); }, []);
  const sites = useMemo<Site[]>(() => {
    if (!me) return [];
    if (me.role !== "operator") return ["PCL", "YUR"];
    return (["PCL", "YUR"] as Site[]).filter((s) => me.stages.some((st) => st.site === s && st.field === "d_despacho"));
  }, [me]);
  const current = site ?? sites[0] ?? null;
  useEffect(() => {
    if (!current) return;
    let alive = true;
    fetch(`/api/despacho?site=${current}`).then((r) => r.json()).then((d: Data) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [current, reload]);

  // Guías que llegan desde «Stock en almacén»: se agregan solas al viaje
  const [preload, setPreload] = useState<string[] | null>(null);
  useEffect(() => {
    // Vale por un minuto (al entrar, la pantalla puede montarse más de una vez)
    let got: { site?: string; guias?: string[]; at?: number } | null = null;
    try { got = JSON.parse(sessionStorage.getItem("sb-despacho-preload") ?? "null"); } catch { got = null; }
    if (!got?.guias?.length || !got.at || Date.now() - got.at > 60_000) return;
    // Se lee una sola vez al abrir (no existe en el servidor, por eso va en un efecto)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (got.site === "PCL" || got.site === "YUR") setSite(got.site);
    setPreload(got.guias.map(String));
  }, []);
  useEffect(() => {
    if (!preload || !current) return;
    let alive = true;
    (async () => {
      const got: Guia[] = [], bad: string[] = [];
      for (const g of preload) {
        const r = await fetch(`/api/despacho?${new URLSearchParams({ site: current, guia: g })}`);
        const j = await r.json().catch(() => null);
        if (r.ok && j) got.push(j); else bad.push(g);
      }
      if (!alive) return;
      setGuias((x) => [...x, ...got.filter((g) => !x.some((y) => y.guia === g.guia))]);
      setPreload(null);
      if (got.length) toast.success(`${got.length} guía(s) agregadas desde el stock`);
      if (bad.length) toast.warning(`No se pudieron agregar: ${bad.join(", ")}`);
    })();
    return () => { alive = false; };
  }, [preload, current]);

  const tot = guias.reduce((t, g) => ({ w2: t.w2 + g.w2, w3: t.w3 + g.w3, total: t.total + g.total, need: t.need + g.need }), { w2: 0, w3: 0, total: 0, need: 0 });

  async function add() {
    const g = input.trim();
    if (!g || !current) return;
    if (guias.some((x) => x.guia.toUpperCase() === g.toUpperCase())) return toast.warning("Esa guía ya está en el viaje");
    setAdding(true);
    const r = await fetch(`/api/despacho?${new URLSearchParams({ site: current, guia: g })}`);
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setAdding(false);
    if (!r.ok) return toast.danger(j.error);
    setGuias((x) => [...x, j]); setInput("");
    if (j.skipped) toast.warning(`${j.skipped} unidades de esa guía ya no están en almacén y no se agregan`);
  }

  async function dispatch() {
    if (!current || !guias.length) return toast.danger("Agrega las guías que lleva el camión");
    if (!driver.trim()) return toast.danger("Indica el chofer");
    setSaving(true);
    const r = await fetch("/api/despacho", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dispatch", site: current, guias: guias.map((g) => g.guia), driver, plate, date, lateReason: tot.need ? reason : undefined }),
    });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setSaving(false);
    if (!r.ok) return toast.danger(j.error);
    toast.success(`Despachado con ${j.driver}`, { description: `${n(j.units)} unidades → Tránsito dealer`, timeout: 7000 });
    if (tot.need && !reason) toast.warning(`${tot.need} unidades quedaron sin motivo de demora`, { description: "Puedes justificarlas después desde PCL/YUR o Alertas", timeout: 8000 });
    try { sessionStorage.removeItem("sb-despacho-preload"); } catch { /* nada */ }
    setGuias([]); setReason(""); setPlate(""); setReload((x) => x + 1);
  }

  if (!me) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  if (!sites.length || !current) return <div className="p-6 text-sm text-sb-on-surface-variant">El despacho no es una etapa asignada a ti. Pídela a tu supervisor.</div>;
  const ro = !data?.canDispatch;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Despacho" sub="5. Arma el viaje del camión con sus guías (o márcalas en «Stock en almacén»), indica chofer, placa y fecha, y despacha. Abajo ves el resumen de cada viaje.">
        {sites.length > 1 && (
          <div className="flex rounded-full bg-sb-surface-container p-1">
            {sites.map((s) => (
              <button key={s} type="button" onClick={() => { setSite(s); setGuias([]); }}
                className={cn("rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200", current === s ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
                {SITE_INFO[s].title}
              </button>
            ))}
          </div>
        )}
      </PageTitle>

      <Card className="overflow-hidden">
        <div className="border-b border-sb-outline-variant/40 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4" /> 5. Despacho · arma el viaje del camión</h3>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_17rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
              <input className={field} placeholder="Guía de remisión (ej. 09-0T005-0157302)" value={input} onChange={(e) => setInput(e.target.value)} disabled={ro} />
              <Button type="submit" variant="primary" className="shrink-0 rounded-full" isDisabled={adding || !input.trim() || ro}><Plus className="h-4 w-4" /> {adding ? "Buscando…" : "Agregar"}</Button>
            </form>
            <div className="overflow-x-auto rounded-xl border border-sb-outline-variant/40">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead>
                  <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant">
                    <th className="px-3 py-2 font-semibold">Guía R.</th><th className="px-2 py-2 font-semibold">Distrito</th><th className="px-2 py-2 font-semibold">Dealer</th>
                    <th className="px-2 py-2 text-right font-semibold">2W</th><th className="px-2 py-2 text-right font-semibold">3W</th><th className="px-2 py-2 text-right font-semibold">Total</th><th />
                  </tr>
                </thead>
                <tbody>
                  {guias.map((g) => (
                    <tr key={g.guia} className="border-b border-sb-outline-variant/20">
                      <td className="px-3 py-2 font-mono font-semibold">{g.guia}{g.need ? <span className="ml-1.5 rounded-full bg-sb-late-soft px-1.5 font-sans text-[10px] text-sb-late">{g.need} tarde</span> : null}</td>
                      <td className="px-2 py-2">{g.district || "—"}</td>
                      <td className="max-w-[14rem] truncate px-2 py-2" title={g.dealer}>{g.dealer || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{g.w2 || ""}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{g.w3 || ""}</td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">{n(g.total)}</td>
                      <td className="px-2 py-2 text-right">
                        <button type="button" aria-label={`Quitar ${g.guia}`} onClick={() => setGuias((x) => x.filter((y) => y.guia !== g.guia))} className="rounded-full p-1 text-sb-on-surface-variant hover:bg-sb-surface-container"><X className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                  {!guias.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-sb-on-surface-variant">Busca una guía y pulsa «Agregar». Se van sumando las unidades del viaje.</td></tr>}
                </tbody>
                {guias.length > 0 && (
                  <tfoot><tr className="bg-sb-surface-container-low font-semibold">
                    <td className="px-3 py-2" colSpan={3}>{guias.length} guía(s)</td>
                    <td className="px-2 py-2 text-right tabular-nums">{tot.w2}</td><td className="px-2 py-2 text-right tabular-nums">{tot.w3}</td><td className="px-2 py-2 text-right tabular-nums">{tot.total}</td><td />
                  </tr></tfoot>
                )}
              </table>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-sb-outline-variant/40 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <div className="flex flex-col items-start gap-1 text-xs">
              <span className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant">Estado</span>
              <span className="rounded-full border border-sb-outline-variant px-3 py-1 font-semibold">En almacén</span>
              <ArrowDown className="ml-4 h-3.5 w-3.5 text-sb-on-surface-variant" />
              <span className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant">Estado siguiente</span>
              <span className="rounded-full bg-sb-primary px-3 py-1 font-semibold text-sb-on-primary">Tránsito dealer</span>
            </div>
            <Label t="Chofer">
              <input className={cn(field, "uppercase")} list="choferes" placeholder="Ej. VIDAL PARIONA" value={driver} onChange={(e) => setDriver(e.target.value)} disabled={ro} />
              <datalist id="choferes">{(data?.drivers ?? []).map((d) => <option key={d} value={d} />)}</datalist>
            </Label>
            <Label t="Placa"><input className={cn(field, "uppercase")} placeholder="Ej. ABC-123" value={plate} onChange={(e) => setPlate(e.target.value)} disabled={ro} /></Label>
            <div className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Fecha de despacho
              <DatePicker label="Fecha de despacho" value={date} onChange={setDate} disabled={ro} quick={pastQuick(null, today())} />
            </div>
            {tot.need > 0 && (
              <Label t={`Motivo de demora (${tot.need} fuera de tiempo · puedes dejarlo para después)`}>
                <select className={field} value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Elegir…</option>{DELAY_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
              </Label>
            )}
            <Button variant="primary" className="rounded-full" onPress={dispatch} isDisabled={saving || !guias.length || ro}>{saving ? "Despachando…" : "Despachar"}</Button>
            {guias.length > 0 && <p className="text-[11px] text-sb-on-surface-variant">{n(tot.total)} unidades pasan a Tránsito dealer.</p>}
            {ro && data && <p className="text-[11px] text-sb-on-surface-variant">Solo lectura: el despacho no es tu etapa.</p>}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-sb-outline-variant/40 px-4 py-3">
          <h3 className="text-sm font-semibold">Resumen de viajes</h3>
          <span className="text-[11px] text-sb-on-surface-variant">{data?.trips.length ?? 0} viaje(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant">
                <th className="px-4 py-2 font-semibold">Fecha</th><th className="px-2 py-2 font-semibold">Chofer</th><th className="px-2 py-2 font-semibold">Destino</th><th className="px-2 py-2 font-semibold">Dealer</th>
                <th className="px-2 py-2 text-right font-semibold">2W</th><th className="px-2 py-2 text-right font-semibold">3W</th><th className="px-2 py-2 text-right font-semibold">Total</th>
                <th className="px-2 py-2 text-right font-semibold">Entregadas</th><th className="px-4 py-2 text-center font-semibold">Viaje</th>
              </tr>
            </thead>
            <tbody>
              {(data?.trips ?? []).map((t) => (
                <tr key={t.id} className="border-b border-sb-outline-variant/20 last:border-0 hover:bg-sb-surface-container-low">
                  <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(t.dispatched_on)}</td>
                  <td className="px-2 py-2.5 font-semibold">{t.driver}{t.plate && <span className="block font-mono text-[10px] font-normal text-sb-on-surface-variant">{t.plate}</span>}</td>
                  <td className="max-w-[10rem] truncate px-2 py-2.5" title={t.destinos ?? ""}>{t.destinos ?? "—"}</td>
                  <td className="max-w-[14rem] truncate px-2 py-2.5" title={t.dealers ?? ""}>{t.dealers ?? "—"}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{t.w2 || ""}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{t.w3 || ""}</td>
                  <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{n(t.total)}</td>
                  <td className="px-2 py-2.5 text-right">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", t.delivered === t.total ? "bg-sb-primary-soft text-sb-primary" : "bg-sb-surface-container text-sb-on-surface-variant")}>{n(t.delivered)}/{n(t.total)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center"><Button size="sm" variant="secondary" className="rounded-full" onPress={() => setView(t)}><Eye className="h-3.5 w-3.5" /> Ver</Button></td>
                </tr>
              ))}
              {data && !data.trips.length && <tr><td colSpan={9} className="px-4 py-8 text-center text-sb-on-surface-variant">Aún no hay viajes despachados.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <TripDetail site={current} trip={view} onClose={() => setView(null)} />
    </div>
  );
}
