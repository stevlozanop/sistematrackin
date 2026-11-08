"use client";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, MapPin, MessageSquareWarning, Search, Truck, X } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { DATA_EVENT } from "@/components/UploadCenter";
import { SITE_INFO, fmtDate, type Site } from "@/lib/hsp";
import { daysBetween, parseISO } from "@/lib/dates";
import { cn } from "@/lib/cn";

/**
 * Detalle de entregas: lo que salió del almacén y llegó (o va llegando) a cada dealer.
 * Origen (ciudad del almacén, o Lima en la ruta Lima) → distrito de destino → dealer → guía,
 * con chofer, placa, fechas, días en ruta y lo que confirmó el dealer.
 */

type Row = {
  trip: number | null; origin: string; department: string | null; district: string | null; dealer: string | null; guia: string | null;
  driver: string | null; plate: string | null; dispatched: string; delivered_on: string | null; w2: number; w3: number; total: number; delivered: number; via_lima: number;
  reception: { kind: string; note: string | null; received_on: string } | null;
};

const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");
const d10 = (s: string) => parseISO(String(s).slice(0, 10));

export default function EntregasPage() {
  const [me, setMe] = useState<{ role: string; stages: { site: Site; field: string }[] } | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [state, setState] = useState<"all" | "route" | "done">("all");
  const [district, setDistrict] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
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
    return (["PCL", "YUR"] as Site[]).filter((s) => me.stages.some((st) => st.site === s));
  }, [me]);
  const current = site ?? sites[0] ?? null;
  useEffect(() => {
    if (!current) return;
    let alive = true;
    fetch(`/api/entrega?${new URLSearchParams({ site: current, report: "1" })}`).then((r) => r.json()).then((j) => { if (alive) setRows(j.rows ?? []); });
    return () => { alive = false; };
  }, [current, reload]);

  const terms = q.trim().toLowerCase().split(/[\s,;]+/).filter(Boolean);
  const base = (rows ?? []).filter((r) =>
    (state === "all" || (state === "done" ? r.delivered === r.total : r.delivered < r.total)) &&
    (!terms.length || terms.some((t) => [r.guia, r.dealer, r.district, r.driver, r.plate, r.department].some((x) => (x ?? "").toLowerCase().includes(t)))));

  // Resumen por distrito de destino (con su origen)
  const byDistrict = useMemo(() => {
    const m = new Map<string, { key: string; district: string; department: string; origins: Set<string>; total: number; delivered: number; dealers: Set<string>; obs: number }>();
    for (const r of base) {
      const k = r.district ?? "—";
      const g = m.get(k) ?? { key: k, district: k, department: r.department ?? "", origins: new Set(), total: 0, delivered: 0, dealers: new Set(), obs: 0 };
      g.origins.add(r.origin); g.total += r.total; g.delivered += r.delivered; if (r.dealer) g.dealers.add(r.dealer);
      if (r.reception?.kind === "observacion") g.obs++;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [base]);
  const shown = district ? base.filter((r) => (r.district ?? "—") === district) : base;

  // Tabla: distrito → filas por guía
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of shown) { const k = r.district ?? "—"; m.set(k, [...(m.get(k) ?? []), r]); }
    return [...m.entries()];
  }, [shown]);
  const tot = shown.reduce((t, r) => ({ total: t.total + r.total, delivered: t.delivered + r.delivered }), { total: 0, delivered: 0 });
  const flip = (k: string) => setOpen((s) => { const y = new Set(s); if (y.has(k)) y.delete(k); else y.add(k); return y; });

  if (!me) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  if (!current) return <div className="p-6 text-sm text-sb-on-surface-variant">No tienes módulos asignados.</div>;
  const city = current === "PCL" ? "Pucallpa" : "Yurimaguas";

  return (
    <div className="flex flex-col gap-4 pb-4">
      <PageTitle title="Detalle de entregas" sub={`Lo que salió del almacén de ${city} (o de Lima) hacia cada distrito y dealer: quién lo llevó, cuándo llegó y qué confirmó el dealer.`}>
        {sites.length > 1 && (
          <div className="flex rounded-full bg-sb-surface-container p-1">
            {sites.map((s) => (
              <button key={s} type="button" onClick={() => { setSite(s); setRows(null); setDistrict(null); }}
                className={cn("rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200", current === s ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
                {SITE_INFO[s].title}
              </button>
            ))}
          </div>
        )}
      </PageTitle>

      {/* Distritos de destino: tocar uno filtra la tabla */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {byDistrict.map((g) => {
          const pct = g.total ? Math.round((g.delivered * 100) / g.total) : 0, on = district === g.key;
          return (
            <button key={g.key} type="button" onClick={() => setDistrict(on ? null : g.key)}
              className={cn("flex min-w-[11rem] shrink-0 flex-col gap-1.5 rounded-2xl border bg-sb-surface px-3 py-2.5 text-left transition-colors", on ? "border-sb-primary ring-2 ring-sb-primary/20" : "border-sb-outline-variant/50 hover:border-sb-primary/60")}>
              <span className="flex items-center gap-1 text-[10px] text-sb-on-surface-variant"><Truck className="h-3 w-3" />{[...g.origins].join(" / ")} →</span>
              <span className="flex items-center gap-1 text-sm font-semibold"><MapPin className="h-3.5 w-3.5 text-sb-primary" />{g.district}</span>
              <span className="text-[11px] text-sb-on-surface-variant">{g.dealers.size} dealer(s){g.obs ? <b className="text-sb-late"> · {g.obs} obs.</b> : null}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-sb-surface-container"><i className="block h-full rounded-full bg-sb-primary" style={{ width: `${pct}%` }} /></span>
              <span className="text-[11px]"><b>{n(g.delivered)}</b> de {n(g.total)} entregadas</span>
            </button>
          );
        })}
        {rows && !byDistrict.length && <p className="text-xs text-sb-on-surface-variant">Aún no hay despachos.</p>}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-sb-outline-variant/40 px-4 py-3">
          <h3 className="text-sm font-semibold">{district ? `Entregas en ${district}` : "Todas las entregas"} <span className="font-normal text-sb-on-surface-variant">· {n(tot.delivered)} de {n(tot.total)} unidades entregadas</span></h3>
          {district && <button type="button" onClick={() => setDistrict(null)} className="flex items-center gap-1 rounded-full bg-sb-surface-container px-2.5 py-1 text-[11px]"><X className="h-3 w-3" /> Quitar distrito</button>}
          <div className="flex rounded-full bg-sb-surface-container p-0.5">
            {([["all", "Todas"], ["route", "En ruta"], ["done", "Entregadas"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setState(k)} className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", state === k ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant")}>{l}</button>
            ))}
          </div>
          <label className="relative ml-auto w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sb-on-surface-variant" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar guía, dealer, chofer o placa" className="h-10 w-full rounded-xl border border-sb-outline-variant bg-sb-surface pl-9 pr-3 text-sm outline-none focus:border-sb-on-surface" />
          </label>
        </div>

        <div className="flex flex-col">
          {groups.map(([d, list]) => {
            const isOpen = !open.has(d); // abiertos por defecto
            const t = list.reduce((a, r) => ({ total: a.total + r.total, delivered: a.delivered + r.delivered }), { total: 0, delivered: 0 });
            return (
              <div key={d} className="border-b border-sb-outline-variant/30 last:border-0">
                <button type="button" onClick={() => flip(d)} className="flex w-full items-center gap-3 bg-sb-surface-container-low/60 px-4 py-2.5 text-left">
                  <MapPin className="h-4 w-4 text-sb-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-semibold">{d}</span>
                    <span className="ml-2 text-[11px] text-sb-on-surface-variant">{list[0].department ?? ""} · desde {[...new Set(list.map((r) => r.origin))].join(" / ")}</span>
                  </span>
                  <span className="text-[11px]"><b>{n(t.delivered)}</b>/{n(t.total)} entregadas</span>
                  <ChevronDown className={cn("h-4 w-4 text-sb-on-surface-variant transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-sb-outline-variant/30 text-[10px] uppercase tracking-wider text-sb-on-surface-variant">
                          <th className="px-4 py-2 font-semibold">Origen → destino</th><th className="px-2 py-2 font-semibold">Dealer</th><th className="px-2 py-2 font-semibold">Guía</th>
                          <th className="px-2 py-2 font-semibold">Chofer · placa</th><th className="px-2 py-2 text-right font-semibold">2W</th><th className="px-2 py-2 text-right font-semibold">3W</th>
                          <th className="px-2 py-2 text-right font-semibold">Total</th><th className="px-2 py-2 font-semibold">Despacho</th><th className="px-2 py-2 font-semibold">Entrega</th>
                          <th className="px-4 py-2 font-semibold">Dealer confirmó</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r, i) => {
                          const done = r.delivered === r.total;
                          const days = r.delivered_on ? daysBetween(d10(r.dispatched), d10(r.delivered_on)) : null;
                          return (
                            <tr key={`${r.trip}|${r.guia}|${r.dealer}|${i}`} className="border-b border-sb-outline-variant/15 last:border-0">
                              <td className="px-4 py-2.5 whitespace-nowrap"><span className="text-sb-on-surface-variant">{r.origin}</span> → <b>{r.district ?? "—"}</b>{r.via_lima ? <span className="ml-1 rounded-full bg-sb-surface-container px-1.5 text-[9px]">Ruta Lima</span> : null}</td>
                              <td className="max-w-[14rem] truncate px-2 py-2.5" title={r.dealer ?? ""}>{r.dealer ?? "—"}</td>
                              <td className="px-2 py-2.5 font-mono font-semibold">{r.guia ?? "—"}</td>
                              <td className="px-2 py-2.5">{r.driver ?? "—"}{r.plate && <span className="block font-mono text-[10px] text-sb-on-surface-variant">{r.plate}</span>}</td>
                              <td className="px-2 py-2.5 text-right tabular-nums">{r.w2 || ""}</td>
                              <td className="px-2 py-2.5 text-right tabular-nums">{r.w3 || ""}</td>
                              <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{n(r.total)}</td>
                              <td className="px-2 py-2.5 whitespace-nowrap">{fmtDate(r.dispatched)}</td>
                              <td className="px-2 py-2.5 whitespace-nowrap">
                                {done ? <span className="font-semibold text-sb-primary">{fmtDate(r.delivered_on)}</span>
                                  : r.delivered ? <span className="text-sb-on-surface">{r.delivered}/{r.total} entregadas</span>
                                  : <span className="rounded-full bg-sb-surface-container px-2 py-0.5 text-[10px] font-semibold">En ruta</span>}
                                {days !== null && <span className="block text-[10px] text-sb-on-surface-variant">{days <= 0 ? "el mismo día" : `${days} día${days === 1 ? "" : "s"} en ruta`}</span>}
                              </td>
                              <td className="px-4 py-2.5">
                                {r.reception ? (
                                  r.reception.kind === "completo"
                                    ? <span className="inline-flex items-center gap-1 text-sb-primary"><CheckCircle2 className="h-3.5 w-3.5" /> Completo · {fmtDate(r.reception.received_on)}</span>
                                    : <span className="inline-flex max-w-[14rem] items-start gap-1 text-sb-late" title={r.reception.note ?? ""}><MessageSquareWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="truncate">{r.reception.note}</span></span>
                                ) : <span className="text-sb-on-surface-variant">Sin confirmar</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {rows && !groups.length && <p className="px-4 py-10 text-center text-xs text-sb-on-surface-variant">No hay entregas con estos filtros.</p>}
          {!rows && <p className="px-4 py-10 text-center text-xs text-sb-on-surface-variant">Cargando…</p>}
        </div>
      </Card>
    </div>
  );
}
