"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, toast } from "@heroui/react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCheck, ChevronRight, Inbox, Plus, Route, Truck, UserRound } from "lucide-react";
import { GuiaRow, Head, Mix, PickList, QuickChips, Register, TotalRow, field, n, plural } from "@/components/stage/StageKit";
import { Card, PageTitle } from "@/components/ui";
import { Sheet } from "@/components/modal/Sheet";
import { SuggestInput } from "@/components/SuggestInput";
import { DATA_EVENT } from "@/components/UploadCenter";
import { SITE_INFO, fmtDate, type Site } from "@/lib/hsp";
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

const EASE = [0.22, 1, 0.36, 1] as const;

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
    // Solo Pucallpa: Yurimaguas tiene sus propias pantallas (sin contenedores, con despacho por ruta)
    if (me.role !== "operator") return ["PCL"];
    return (["PCL"] as Site[]).filter((s) => me.stages.some((st) => st.site === s && st.field === "d_despacho"));
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

  async function add(pick?: string) {
    const g = (pick ?? input).trim();
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

      {/* 5. Armar el viaje */}
      <Card className="overflow-hidden">
        <Head icon={Truck} title="5. Despacho · arma el viaje del camión"
          sub={guias.length ? `${plural(guias.length, ["guía", "guías"])} · ${n(tot.total)} motos en el camión${driver.trim() ? ` de ${driver.trim().toUpperCase()}` : ""}` : "Busca las guías que lleva el camión o márcalas en «Stock en almacén»"} />
        <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
              <SuggestInput inputClassName={field} mono placeholder="Buscar guía…" value={input} onChange={setInput} disabled={ro} ariaLabel="Guía de remisión"
                onPick={(v) => { setInput(v); add(v); }} onEnter={() => add()}
                source={(q) => `/api/suggest?${new URLSearchParams({ kind: "guia", site: current, step: "d_despacho", q })}`} />
              <Button type="submit" variant="primary" className="shrink-0 rounded-full" isDisabled={adding || !input.trim() || ro} aria-label="Agregar guía">
                <Plus className="h-4 w-4" /><span className="hidden sm:inline">{adding ? "Buscando…" : "Agregar"}</span>
              </Button>
            </form>
            <PickList title={guias.length ? "Guías en el camión" : "Camión vacío"} loading={!!preload}
              empty={guias.length ? null : <span>Busca una guía y pulsa «Agregar», o márcalas en <Link href="/stock" className="font-semibold text-sb-primary hover:underline">Stock en almacén</Link>.</span>}>
              <AnimatePresence initial={false}>
                {guias.map((g) => (
                  <motion.div key={g.guia} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 16, transition: { duration: 0.15 } }} transition={{ duration: 0.3, ease: EASE }}>
                    <GuiaRow guia={g.guia} district={g.district} dealer={g.dealer} w2={g.w2} w3={g.w3} total={g.total} late={g.need} onRemove={() => setGuias((x) => x.filter((y) => y.guia !== g.guia))} />
                  </motion.div>
                ))}
              </AnimatePresence>
              {guias.length > 1 && <TotalRow label="Total del viaje" count={guias.length} w2={tot.w2} w3={tot.w3} total={tot.total} />}
            </PickList>
          </div>
          <Register from="En almacén" to="Tránsito dealer" label="Despacho" noun={["guía", "guías"]} title="En el camión" hint="Agrega guías al viaje" action="Despachar"
            date={date} setDate={setDate} min="" need={tot.need} reason={reason} setReason={setReason} count={guias.length} units={tot.total}
            busy={saving} disabled={!guias.length} readOnly={ro} readOnlyText="Solo lectura: el despacho no es tu etapa." onSave={dispatch}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Chofer
                <input className={cn(field, "uppercase")} list="choferes" placeholder="Ej. VIDAL PARIONA" value={driver} onChange={(e) => setDriver(e.target.value)} disabled={ro} />
                <datalist id="choferes">{(data?.drivers ?? []).map((d) => <option key={d} value={d} />)}</datalist>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Placa
                <input className={cn(field, "font-mono uppercase")} placeholder="Ej. ABC-123" value={plate} onChange={(e) => setPlate(e.target.value)} disabled={ro} />
              </label>
            </div>
            {!ro && <QuickChips items={data?.drivers ?? []} value={driver} onPick={setDriver} icon={UserRound} />}
          </Register>
        </div>
      </Card>

      {/* Viajes despachados */}
      <Card className="overflow-hidden">
        <Head icon={Route} title="Viajes despachados"
          sub={data ? (data.trips.length ? `${plural(data.trips.length, ["viaje", "viajes"])} · ${n(data.trips.reduce((t, x) => t + Number(x.total), 0))} motos · ${n(data.trips.reduce((t, x) => t + Number(x.delivered), 0))} entregadas` : "Aún no hay viajes") : "Cargando…"} />
        <div className="flex flex-col gap-0.5 p-2 sm:p-3">
          {!data && [0, 1].map((i) => <div key={i} className="h-[64px] animate-pulse rounded-xl bg-sb-surface-container-low" />)}
          {data && !data.trips.length && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-sb-outline-variant/60 px-4 py-10 text-center text-xs text-sb-on-surface-variant">
              <Inbox className="h-5 w-5 opacity-50" />Aún no hay viajes despachados.
            </div>
          )}
          {(data?.trips ?? []).map((t) => {
            const done = Number(t.delivered) >= Number(t.total) && Number(t.total) > 0;
            const pct = Number(t.total) ? (Number(t.delivered) / Number(t.total)) * 100 : 0;
            return (
              <button key={t.id} type="button" onClick={() => setView(t)}
                className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl px-3 py-3 text-left transition-colors hover:bg-sb-surface-container-low lg:grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1.3fr)_7rem_8rem_3.5rem_1.25rem]">
                <span className={cn("grid h-9 w-9 place-items-center rounded-xl", done ? "bg-sb-primary-soft text-sb-primary" : "bg-sb-surface-container text-sb-on-surface-variant")}>
                  {done ? <CheckCheck className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{t.driver}{t.plate && <span className="ml-1.5 rounded-md bg-sb-surface-container px-1.5 py-0.5 font-mono text-[10px] font-normal text-sb-on-surface-variant">{t.plate}</span>}</span>
                  <span className="block truncate text-[11px] text-sb-on-surface-variant">{fmtDate(t.dispatched_on)} · {t.destinos ?? "—"}</span>
                </span>
                <span className="hidden min-w-0 lg:block">
                  <span className="block truncate text-[11px] text-sb-on-surface-variant" title={t.dealers ?? ""}>{t.dealers ?? "—"}</span>
                </span>
                <span className="hidden lg:block"><Mix w2={t.w2} w3={t.w3} /></span>
                <span className="col-start-2 lg:col-start-auto">
                  <span className="flex h-1.5 overflow-hidden rounded-full bg-sb-surface-container"><span className="bg-sb-primary transition-[width] duration-500" style={{ width: `${pct}%` }} /></span>
                  <span className={cn("mt-1 block text-[10px] tabular-nums", done ? "font-semibold text-sb-primary" : "text-sb-on-surface-variant")}>
                    {done ? "Todo entregado" : `${n(t.delivered)} de ${n(t.total)} entregadas`}
                  </span>
                </span>
                <span className="col-start-3 row-span-2 row-start-1 text-right lg:col-start-auto lg:row-span-1 lg:row-start-auto">
                  <span className="block text-sm font-semibold tabular-nums">{n(t.total)}</span>
                  <span className="block text-[10px] text-sb-on-surface-variant">motos</span>
                </span>
                <ChevronRight className="hidden h-4 w-4 text-sb-on-surface-variant lg:block" />
              </button>
            );
          })}
        </div>
      </Card>
      <TripDetail site={current} trip={view} onClose={() => setView(null)} />
    </div>
  );
}
