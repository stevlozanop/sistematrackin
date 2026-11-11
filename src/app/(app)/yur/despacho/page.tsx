"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, toast } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, ChevronDown, Map as MapIcon, MapPin, Pencil, Plus, Route, Truck, Warehouse } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { DatePicker, pastQuick } from "@/components/modal/DatePicker";
import { DATA_EVENT } from "@/components/UploadCenter";
import { DELAY_REASONS, fmtDate, unitsText } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { cn } from "@/lib/cn";
import { ORIGIN, oneLine, onTheWay, orderStops, planEtas, townOf, kmFromOrigin } from "@/lib/yur-road";
import { roadRoute } from "@/lib/yur";
import { CargoFigure, SizePicker, sizeFor, type TruckSize } from "@/components/figures/cargo/CargoFigure";
import { SoftSelect } from "@/components/SoftSelect";

/**
 * YUR · Despacho por ruta (Yurimaguas → carretera). Lo que está en ENAPU se ve por ruta de carretera y destino;
 * se arma el camión (guías, chofer, placa) y se despacha → «Tránsito dealer». En la ruta Oriente 1 (Yurimaguas)
 * la entrega es local: se puede registrar el despacho y la entrega a la vez.
 * El planificador puede cambiar la ruta de una guía (con motivo), ordenar las paradas del camión
 * y sumar lo que queda en el camino.
 */


type G = { route: string; district: string | null; dealer: string | null; guia: string | null; w2: number; w3: number; total: number; since: string | null; est: string | null; need: number; overdue: number; nave: string | null; note?: string | null };
type R = { route: string; label: string; places: string; days: number; local?: boolean; guias: G[] };
type Data = { canDispatch: boolean; canDeliver: boolean; drivers: string[]; inPort: number; routes: R[] };
type Trip = { id: number; dispatched_on: string; driver: string; plate: string | null; destinos: string | null; total: number; delivered: number; w2: number; w3: number };

const field = "h-10 w-full rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-on-surface";
const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");
/** Lo que lleva normalmente un camión en esta ruta (historial): unas 36 unidades, hasta 84 */
const TRUCK_MAX = 84;

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
  // Orden de paradas que eligió el planificador (lo que no esté, va en el orden de la carretera)
  const [order, setOrder] = useState<string[]>([]);
  // Cambio de ruta de una guía
  const [edit, setEdit] = useState<{ guia: string; route: string; note: string } | null>(null);
  // Tamaño del camión: sale solo según lo que lleva, o lo elige el planificador
  const [sizePick, setSizePick] = useState<TruckSize | null>(null);
  // Al despachar, el camión se va (se dibuja un momento con la carga que llevaba)
  const [gone, setGone] = useState<{ units: number; size: TruckSize } | null>(null);

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
  const truck = sizePick ?? sizeFor(tot.total);
  // Paradas del camión, en orden, con su llegada estimada
  const districts = [...new Set(chosen.map((g) => g.district ?? "").filter(Boolean))];
  const stops = [...order.filter((d) => districts.includes(d)), ...orderStops(districts.filter((d) => !order.includes(d)))];
  const line = oneLine(districts);
  const farthest = districts.reduce<string | null>((m, d) => { const t = townOf(d), f = townOf(m); return t && (!f || kmFromOrigin(t.id) > kmFromOrigin(f.id)) ? d : m; }, null);
  // Lo que queda en el camino y todavía no sube (mientras haya espacio)
  const onWay = farthest && townOf(farthest)?.id !== ORIGIN
    ? all.filter((g) => g.guia && !pick.has(g.guia) && townOf(g.district)?.id !== ORIGIN && onTheWay(g.district, farthest)) : [];
  const etas = planEtas(date, stops.map((d) => ({ district: d, route: chosen.find((g) => g.district === d)?.route || null })));
  const move = (d: string, by: number) => setOrder(() => {
    const y = [...stops]; const i = y.indexOf(d), j = i + by;
    if (i < 0 || j < 0 || j >= y.length) return y;
    [y[i], y[j]] = [y[j], y[i]]; return y;
  });

  async function saveRoute() {
    if (!edit) return;
    const r = await fetch("/api/yur", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "route", ...edit }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    if (!r.ok) return toast.danger(j.error);
    toast.success(`Guía ${edit.guia} → ${data?.routes.find((x) => x.route === edit.route)?.label ?? edit.route}`);
    setEdit(null); setReload((x) => x + 1);
  }

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
      body: JSON.stringify({ action: "dispatch", site: "YUR", guias, driver, plate, date, stops, lateReason: tot.need ? reason : undefined }) });
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
    setGone({ units: tot.total, size: truck });
    setTimeout(() => setGone(null), 1700);
    setPick(new Set()); setOrder([]); setSizePick(null); setReason(""); setPlate(""); setReload((x) => x + 1);
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
      <div className="grid items-start gap-3 lg:grid-cols-2">
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
                    const normal = roadRoute(g.district);
                    const editing = edit && edit.guia === g.guia;
                    return (
                      <div key={`${g.guia}-${g.dealer}`} className={cn("border-t border-sb-outline-variant/15", on && "bg-sb-primary-soft")}>
                        <div className="flex items-center gap-1 pr-2">
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-2.5 text-xs">
                            <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--sb-primary)]" checked={on} disabled={!data.canDispatch || !g.guia} onChange={() => g.guia && toggle(g.guia)} />
                            <span className="min-w-0 flex-1">
                              <span className={cn("block font-mono font-semibold", g.overdue ? "text-sb-late" : "text-sb-ontime")}>{g.guia ?? "(sin guía)"}</span>
                              <span className="block truncate text-[11px] text-sb-on-surface-variant">{g.district} · {g.dealer}</span>
                              <span className="block text-[10px] text-sb-on-surface-variant">En ENAPU desde {fmtDate(g.since) || "—"} · estimada {fmtDate(g.est) || "—"}</span>
                              {r.route && normal && normal !== r.route && (
                                <span className="mt-0.5 inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">Ruta cambiada{g.note ? `: ${g.note}` : ""}</span>
                              )}
                            </span>
                            <span className="shrink-0 text-right tabular-nums"><b>{g.total}</b><span className="block text-[10px] text-sb-on-surface-variant">{unitsText(g.w2, g.w3)}</span></span>
                          </label>
                          {data.canDispatch && g.guia && (
                            <button type="button" title="Cambiar ruta" aria-label={`Cambiar la ruta de ${g.guia}`}
                              onClick={() => setEdit(editing ? null : { guia: g.guia!, route: r.route || normal || "", note: g.note ?? "" })}
                              className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-sb-on-surface-variant hover:bg-sb-surface-container", editing && "bg-sb-surface-container text-sb-on-surface")}>
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        {editing && (
                          <div className="flex flex-col gap-2 border-t border-sb-outline-variant/20 bg-sb-surface-container-low px-4 py-3 text-xs">
                            <span className="font-semibold">Cambiar la ruta de {g.guia}</span>
                            <span className="text-[11px] text-sb-on-surface-variant">Por su distrito ({g.district ?? "—"}) le toca {data.routes.find((x) => x.route === normal)?.label ?? "ninguna ruta conocida"}.</span>
                            <div className="flex flex-wrap gap-1.5">
                              {data.routes.filter((x) => x.route).map((x) => (
                                <button key={x.route} type="button" onClick={() => setEdit({ ...edit, route: x.route })}
                                  className={cn("rounded-full border px-3 py-1 text-[11px] font-semibold", edit.route === x.route ? "border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant")}>
                                  {x.label}{x.route === normal ? " · la suya" : ""}
                                </button>
                              ))}
                            </div>
                            {edit.route !== normal && (
                              <input className={field} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="¿Por qué? (ej. va en el camión de Tarapoto, hay espacio)" />
                            )}
                            <div className="flex gap-2">
                              <Button size="sm" variant="primary" className="rounded-full" onPress={saveRoute} isDisabled={!edit.route || (edit.route !== normal && !edit.note.trim())}>Guardar ruta</Button>
                              <Button size="sm" variant="ghost" className="rounded-full" onPress={() => setEdit(null)}>Cancelar</Button>
                            </div>
                          </div>
                        )}
                      </div>
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
            {/* El camión en 3D: se llena con las guías marcadas */}
            <div className="flex flex-col gap-2 rounded-[18px] bg-sb-surface-container-low p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs"><b className="text-sm">{gone ? gone.size.name : truck.name}</b><span className="text-sb-on-surface-variant"> · hasta {(gone ? gone.size : truck).cap} motos</span></span>
                <div className="w-full sm:w-56"><SizePicker value={truck} onChange={setSizePick} units={tot.total} /></div>
              </div>
              <CargoFigure kind="truck" units={gone ? gone.units : tot.total} size={gone ? gone.size : truck} leaving={!!gone} />
              {chosen.length > 0 ? (
                <div className="text-xs">
                  <p className="font-semibold">{chosen.length} guía(s) · {n(tot.total)} unid. · {unitsText(tot.w2, tot.w3)}</p>
                  <p className="text-sb-on-surface-variant">{routesChosen.map((x) => data.routes.find((r) => r.route === x)?.label ?? "Sin ruta").join(" + ")} · {[...new Set(chosen.map((g) => g.district))].join(", ")}</p>
                  {tot.total > truck.cap && tot.total <= TRUCK_MAX && <p className="mt-1 text-[11px] font-semibold text-sb-late">No entra en un {truck.name.toLowerCase()}: elige un tamaño más grande.</p>}
                </div>
              ) : <p className="text-center text-xs text-sb-on-surface-variant">{gone ? "¡Camión despachado!" : "Marca arriba las guías que suben al camión."}</p>}
            </div>
            {chosen.length > 0 && (
              <>
                {/* Paradas en orden, con su llegada estimada */}
                <div className="rounded-xl border border-sb-outline-variant/40">
                  <p className="flex items-center gap-1.5 border-b border-sb-outline-variant/30 px-3 py-2 text-[11px] font-semibold"><MapPin className="h-3.5 w-3.5" /> Paradas del camión ({stops.length}) · en este orden</p>
                  {stops.map((d, i) => {
                    const list = chosen.filter((g) => g.district === d);
                    const u = list.reduce((t, g) => t + g.total, 0);
                    const eta = etas[i];
                    return (
                      <div key={d} className="flex items-center gap-2 border-b border-sb-outline-variant/15 px-3 py-2 text-xs last:border-0">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sb-primary text-[11px] font-bold text-sb-on-primary">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <b>{townOf(d)?.name ?? d}</b>
                          <span className="block truncate text-[10px] text-sb-on-surface-variant">{list.length} guía(s) · {n(u)} unid. · llega aprox. {fmtDate(eta)}</span>
                        </span>
                        <button type="button" aria-label={`Subir ${d}`} disabled={i === 0} onClick={() => move(d, -1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-sb-surface-container disabled:opacity-25"><ArrowUp className="h-4 w-4" /></button>
                        <button type="button" aria-label={`Bajar ${d}`} disabled={i === stops.length - 1} onClick={() => move(d, 1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-sb-surface-container disabled:opacity-25"><ArrowDown className="h-4 w-4" /></button>
                      </div>
                    );
                  })}
                </div>
                {!line.ok && <p className="flex items-center gap-1.5 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{line.off.join(", ")} no queda en el camino a {line.far}: el camión tendrá que desviarse y volver.</p>}
                {line.ok && routesChosen.length > 1 && <p className="rounded-xl bg-sb-ontime-soft/50 px-3 py-2 text-[11px]">Junta {routesChosen.length} rutas, pero todo queda en el mismo camino. Bien.</p>}
                {/* Lo que queda en el camino */}
                {onWay.length > 0 && tot.total < TRUCK_MAX && (
                  <div className="rounded-xl bg-sb-primary-soft/50 px-3 py-2 text-xs">
                    <p className="font-semibold">Puedes sumar · queda en el camino{farthest ? ` a ${townOf(farthest)?.name ?? farthest}` : ""}</p>
                    <div className="mt-1.5 flex flex-col gap-1">
                      {onWay.slice(0, 6).map((g) => (
                        <button key={`${g.guia}-${g.dealer}`} type="button" onClick={() => g.guia && toggle(g.guia)}
                          className="flex items-center gap-2 rounded-lg bg-sb-surface px-2.5 py-1.5 text-left hover:ring-1 hover:ring-sb-primary">
                          <Plus className="h-4 w-4 shrink-0 text-sb-primary" />
                          <span className="min-w-0 flex-1 truncate"><b>{townOf(g.district)?.name ?? g.district}</b> · {g.dealer}</span>
                          <span className="shrink-0 tabular-nums">{g.total} unid.</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
                <SoftSelect className={field} value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Elegir…</option>{DELAY_REASONS.map((x) => <option key={x}>{x}</option>)}</SoftSelect>
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
        <div className="flex items-center gap-2 border-b border-sb-outline-variant/40 px-4 py-3">
          <h3 className="flex flex-1 items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4" /> Camiones recientes</h3>
          <Link href="/yur/viajes" className="inline-flex items-center gap-1.5 rounded-full bg-sb-primary px-3 py-1.5 text-[12px] font-semibold text-sb-on-primary"><MapIcon className="h-3.5 w-3.5" /> Ver en el mapa</Link>
        </div>
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
