"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, toast } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, ChevronDown, MapPin, Route, Truck, Warehouse } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { DatePicker, pastQuick } from "@/components/modal/DatePicker";
import { DATA_EVENT } from "@/components/UploadCenter";
import { DELAY_REASONS, fmtDate, unitsText } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { cn } from "@/lib/cn";

/**
 * YUR · Despacho por ruta (Yurimaguas → carretera). Lo que está en ENAPU se ve por ruta de carretera y destino;
 * se arma el camión (guías, chofer, placa) y se despacha → «Tránsito dealer». En la ruta Oriente 1 (Yurimaguas)
 * la entrega es local: se puede registrar el despacho y la entrega a la vez.
 */

type G = { route: string; district: string | null; dealer: string | null; guia: string | null; w2: number; w3: number; total: number; since: string | null; est: string | null; need: number; overdue: number; nave: string | null };
type R = { route: string; label: string; places: string; days: number; local?: boolean; guias: G[] };
type Data = { canDispatch: boolean; canDeliver: boolean; drivers: string[]; inPort: number; routes: R[] };
type Trip = { id: number; dispatched_on: string; driver: string; plate: string | null; destinos: string | null; total: number; delivered: number; w2: number; w3: number };

const field = "h-10 w-full rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-on-surface";
const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");
/** Lo que lleva normalmente un camión en esta ruta (historial): unas 36 unidades, hasta 84 */
const TRUCK = 36, TRUCK_MAX = 84;

export default function YurDespachoPage() {
  const [data, setData] = useState<Data | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [reload, setReload] = useState(0);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [openR, setOpenR] = useState<Set<string>>(new Set());
  const [driver, setDriver] = useState("");
  const [plate, setPlate] = useState("");
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [local, setLocal] = useState(true);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const [formSeen, setFormSeen] = useState(false);

  const load = useCallback(() => {
    fetch("/api/yur?view=ruta").then((r) => r.json()).then(setData).catch(() => {});
    fetch("/api/despacho?site=YUR").then((r) => r.json()).then((j) => setTrips(j.trips ?? [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load, reload]);
  useEffect(() => {
    const again = () => setReload((x) => x + 1);
    window.addEventListener(DATA_EVENT, again);
    return () => window.removeEventListener(DATA_EVENT, again);
  }, []);
  useEffect(() => {
    const el = formRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setFormSeen(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  });

  const all = useMemo(() => (data?.routes ?? []).flatMap((r) => r.guias.map((g) => ({ ...g, r }))), [data]);
  const chosen = all.filter((g) => g.guia && pick.has(g.guia));
  const tot = chosen.reduce((t, g) => ({ w2: t.w2 + g.w2, w3: t.w3 + g.w3, total: t.total + g.total, need: t.need + g.need }), { w2: 0, w3: 0, total: 0, need: 0 });
  const routesChosen = [...new Set(chosen.map((g) => g.r.route))];
  const allLocal = chosen.length > 0 && chosen.every((g) => g.r.local);
  const minDate = chosen.reduce((m, g) => (g.since && g.since > m ? g.since : m), "");

  const toggle = (g: string) => setPick((s) => { const y = new Set(s); if (y.has(g)) y.delete(g); else y.add(g); return y; });
  const toggleRoute = (r: R) => setPick((s) => {
    const ids = r.guias.map((g) => g.guia).filter(Boolean) as string[];
    const allOn = ids.every((g) => s.has(g));
    const y = new Set(s); ids.forEach((g) => (allOn ? y.delete(g) : y.add(g))); return y;
  });

  async function dispatch() {
    if (!chosen.length) return toast.danger("Marca las guías que suben al camión");
    if (!driver.trim()) return toast.danger("Indica el chofer");
    setSaving(true);
    const guias = chosen.map((g) => g.guia!);
    const r = await fetch("/api/despacho", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dispatch", site: "YUR", guias, driver, plate, date, lateReason: tot.need ? reason : undefined }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    if (!r.ok) { setSaving(false); return toast.danger(j.error); }
    let delivered = false;
    if (allLocal && local && data?.canDeliver) {
      const e = await fetch("/api/entrega", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deliver", site: "YUR", guias, date, lateReason: tot.need ? reason : undefined }) });
      delivered = e.ok;
      if (!e.ok) toast.warning("Se despachó, pero no se pudo registrar la entrega local", { description: (await e.json().catch(() => null))?.error });
    }
    setSaving(false);
    toast.success(delivered ? `Entregado en Yurimaguas: ${n(j.units)} unidades` : `Camión despachado: ${n(j.units)} unidades`,
      { description: delivered ? "Despacho y entrega local registrados" : `Chofer ${j.driver} · → Tránsito dealer`, timeout: 7000 });
    if (j.late && !reason) toast.warning(`${j.late} unidades quedaron sin motivo de demora`, { timeout: 7000 });
    setPick(new Set()); setReason(""); setPlate(""); setReload((x) => x + 1);
  }

  if (!data) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  const stock = all.reduce((t, g) => t + g.total, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="YUR · Despacho por ruta" sub="Lo que está en ENAPU (Yurimaguas), por ruta de carretera. Marca las guías que suben al camión, pon el chofer y despacha. En Oriente 1 (Yurimaguas) la entrega es local." />

      <div className="grid grid-cols-3 gap-2">
        {[["En ENAPU", n(stock), Warehouse], ["Llegando al puerto", n(data.inPort), MapPin], ["Rutas con carga", String(data.routes.filter((r) => r.guias.length).length), Route]].map(([l, v, I]) => {
          const Icon = I as typeof Warehouse;
          return (
            <Card key={l as string} className="flex flex-col gap-0.5 p-3">
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-sb-on-surface-variant"><Icon className="h-3 w-3" />{l as string}</p>
              <p className="text-xl font-bold tabular-nums">{v as string}</p>
            </Card>
          );
        })}
      </div>

      {/* Rutas de carretera */}
      <div className="grid gap-3 lg:grid-cols-2">
        {data.routes.map((r) => {
          const units = r.guias.reduce((t, g) => t + g.total, 0);
          const late = r.guias.reduce((t, g) => t + g.overdue, 0);
          const isOpen = openR.has(r.route) || (r.guias.length > 0 && r.guias.length <= 3);
          const ids = r.guias.map((g) => g.guia).filter(Boolean) as string[];
          const allOn = ids.length > 0 && ids.every((g) => pick.has(g));
          return (
            <Card key={r.route || "none"} className={cn("overflow-hidden", !r.guias.length && "opacity-60")}>
              <button type="button" onClick={() => setOpenR((s) => { const y = new Set(s); if (y.has(r.route)) y.delete(r.route); else y.add(r.route); return y; })}
                aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", r.guias.length ? "bg-sb-primary text-sb-on-primary" : "bg-sb-surface-container text-sb-on-surface-variant")}><Truck className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{r.label}{r.local && <span className="ml-1.5 rounded-full bg-sb-primary-soft px-2 py-0.5 text-[10px] font-semibold text-sb-primary">Local</span>}</span>
                  <span className="block truncate text-[11px] text-sb-on-surface-variant">{r.places} · {r.local ? "entrega el mismo día" : `${r.days} días de camión`}</span>
                </span>
                <span className="shrink-0 text-right">
                  <b className="block text-lg leading-none tabular-nums">{n(units)}</b>
                  <span className="block text-[10px] text-sb-on-surface-variant">{r.guias.length} guía(s)</span>
                  {late > 0 && <span className="block text-[10px] font-semibold text-sb-late">{late} vencidas</span>}
                </span>
                {r.guias.length > 0 && <ChevronDown className={cn("h-4 w-4 shrink-0 text-sb-on-surface-variant transition-transform", isOpen && "rotate-180")} />}
              </button>
              {isOpen && r.guias.length > 0 && (
                <div className="border-t border-sb-outline-variant/30">
                  {data.canDispatch && (
                    <button type="button" onClick={() => toggleRoute(r)} className="w-full px-4 py-2 text-left text-[12px] font-semibold text-sb-primary hover:bg-sb-surface-container-low">
                      {allOn ? "Desmarcar toda la ruta" : `Marcar toda la ruta (${n(units)} unid.)`}
                    </button>
                  )}
                  {r.guias.map((g) => {
                    const on = !!g.guia && pick.has(g.guia);
                    return (
                      <label key={`${g.guia}-${g.dealer}`} className={cn("flex cursor-pointer items-center gap-3 border-t border-sb-outline-variant/15 px-4 py-2.5 text-xs", on && "bg-sb-primary-soft")}>
                        <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--sb-primary)]" checked={on} disabled={!data.canDispatch || !g.guia} onChange={() => g.guia && toggle(g.guia)} />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block font-mono font-semibold", g.overdue ? "text-sb-late" : "text-sb-ontime")}>{g.guia ?? "(sin guía)"}</span>
                          <span className="block truncate text-[11px] text-sb-on-surface-variant">{g.district} · {g.dealer}</span>
                          <span className="block text-[10px] text-sb-on-surface-variant">En ENAPU desde {fmtDate(g.since) || "—"} · estimada {fmtDate(g.est) || "—"}</span>
                        </span>
                        <span className="shrink-0 text-right tabular-nums"><b>{g.total}</b><span className="block text-[10px] text-sb-on-surface-variant">{unitsText(g.w2, g.w3)}</span></span>
                      </label>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Armar el camión */}
      <Card className="scroll-mt-4 overflow-hidden">
        <div ref={formRef} id="camion" className="border-b border-sb-outline-variant/40 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4" /> Armar el camión</h3>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_18rem]">
          <div className="flex min-w-0 flex-col gap-2">
            {!chosen.length ? <p className="rounded-xl border border-dashed border-sb-outline-variant px-3 py-6 text-center text-xs text-sb-on-surface-variant">Marca arriba las guías que suben al camión.</p> : (
              <>
                <div className="rounded-xl bg-sb-surface-container-low px-3 py-2 text-xs">
                  <p className="font-semibold">{chosen.length} guía(s) · {n(tot.total)} unid. · {unitsText(tot.w2, tot.w3)}</p>
                  <p className="text-sb-on-surface-variant">{routesChosen.map((x) => data.routes.find((r) => r.route === x)?.label ?? "Sin ruta").join(" + ")} · {[...new Set(chosen.map((g) => g.district))].join(", ")}</p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sb-surface-container-high">
                    <div className={cn("h-full rounded-full", tot.total > TRUCK_MAX ? "bg-sb-late" : "bg-sb-primary")} style={{ width: `${Math.min(100, (tot.total / TRUCK_MAX) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-sb-on-surface-variant">Un camión lleva normalmente unas {TRUCK} unidades (hasta {TRUCK_MAX}).</p>
                </div>
                {routesChosen.length > 1 && <p className="flex items-center gap-1.5 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />Este camión lleva guías de {routesChosen.length} rutas distintas.</p>}
                {tot.total > TRUCK_MAX && <p className="flex items-center gap-1.5 rounded-xl bg-sb-late-soft/60 px-3 py-2 text-[11px] text-sb-late"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />Son más unidades de las que suele llevar un camión.</p>}
              </>
            )}
          </div>
          <div className="flex flex-col gap-3 border-t border-sb-outline-variant/40 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant">Cambia de estado</span>
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-sb-outline-variant px-3 py-1 font-semibold">En almacén</span>
                <ArrowRight className="h-3.5 w-3.5 text-sb-on-surface-variant" />
                <span className="rounded-full bg-sb-primary px-3 py-1 font-semibold text-sb-on-primary">{allLocal && local && data.canDeliver ? "Entregado" : "Tránsito dealer"}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Chofer
                <input className={cn(field, "uppercase")} list="yur-drivers" value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="Nombre" disabled={!data.canDispatch} />
                <datalist id="yur-drivers">{data.drivers.map((d) => <option key={d} value={d} />)}</datalist>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Placa
                <input className={cn(field, "uppercase")} value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Opcional" disabled={!data.canDispatch} />
              </label>
            </div>
            <div className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Fecha de despacho
              <DatePicker label="Fecha de despacho" value={date} min={minDate || null} onChange={setDate} disabled={!data.canDispatch} quick={pastQuick(minDate || null, today())} />
            </div>
            {allLocal && data.canDeliver && (
              <label className="flex items-start gap-2 rounded-xl bg-sb-primary-soft px-3 py-2 text-[12px]">
                <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--sb-primary)]" checked={local} onChange={(e) => setLocal(e.target.checked)} />
                <span><b>Entrega local en Yurimaguas:</b> registrar también la entrega con la misma fecha.</span>
              </label>
            )}
            {tot.need > 0 && (
              <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Motivo de demora ({tot.need} fuera de tiempo · puedes dejarlo para después)
                <select className={field} value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Elegir…</option>{DELAY_REASONS.map((x) => <option key={x}>{x}</option>)}</select>
              </label>
            )}
            <Button variant="primary" className="w-full rounded-full lg:w-auto" onPress={dispatch} isDisabled={saving || !chosen.length || !driver.trim() || !data.canDispatch}>
              {saving ? "Registrando…" : allLocal && local && data.canDeliver ? "Despachar y entregar" : "Despachar camión"}
            </Button>
            {!data.canDispatch && <p className="text-[11px] text-sb-on-surface-variant">Solo lectura: el despacho no es tu etapa.</p>}
          </div>
        </div>
      </Card>

      {/* Camiones recientes */}
      <Card className="overflow-hidden">
        <h3 className="flex items-center gap-2 border-b border-sb-outline-variant/40 px-4 py-3 text-sm font-semibold"><Truck className="h-4 w-4" /> Camiones recientes</h3>
        {trips.slice(0, 12).map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-2 border-b border-sb-outline-variant/15 px-4 py-2.5 text-xs last:border-0">
            <span className="min-w-0 flex-1">
              <b>{t.driver}</b>{t.plate ? <span className="font-mono text-sb-on-surface-variant"> · {t.plate}</span> : null}
              <span className="block truncate text-[11px] text-sb-on-surface-variant">{fmtDate(t.dispatched_on)} · {t.destinos ?? "—"}</span>
            </span>
            <span className="text-right tabular-nums"><b>{n(t.total)}</b><span className="block text-[10px] text-sb-on-surface-variant">{unitsText(t.w2, t.w3)}</span></span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", t.delivered >= t.total ? "bg-sb-ontime-soft text-sb-ontime" : "bg-sb-surface-container-high")}>
              {t.delivered >= t.total ? "Entregado" : t.delivered ? `${t.delivered} de ${t.total} entregadas` : "En camino"}
            </span>
          </div>
        ))}
        {!trips.length && <p className="px-4 py-6 text-center text-xs text-sb-on-surface-variant">Todavía no hay camiones despachados.</p>}
      </Card>

      <AnimatePresence>
        {chosen.length > 0 && !formSeen && (
          <motion.button type="button" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            onClick={() => document.getElementById("camion")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="fixed inset-x-3 z-40 flex items-center gap-3 rounded-2xl bg-sb-on-surface px-4 py-3 text-left text-sb-surface shadow-2xl md:inset-x-auto md:right-6 md:w-96"
            style={{ bottom: "calc(6.25rem + env(safe-area-inset-bottom))" }}>
            <Truck className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1 text-[13px] leading-tight"><b>Camión en armado</b>
              <span className="block truncate text-[11px] opacity-75">{chosen.length} guía(s) · {n(tot.total)} unid. · {unitsText(tot.w2, tot.w3)}</span></span>
            <span className="shrink-0 rounded-full bg-sb-primary px-3 py-1.5 text-[12px] font-semibold text-sb-on-primary">Despachar</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
