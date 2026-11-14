"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { Check, ChevronDown, ChevronsUpDown, Forklift, Inbox, Search, Warehouse, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Mix, n, plural } from "@/components/stage/StageKit";
import { Card, PageTitle } from "@/components/ui";
import { DATA_EVENT } from "@/components/UploadCenter";
import { SITE_INFO, fmtDate, type Site } from "@/lib/hsp";
import { daysBetween, parseISO, todayLima } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { Kind, KindText, W2, W3 } from "@/components/Kinds";

/**
 * Stock en almacén (entre el paso 4 y el 5): todo lo que ingresó al almacén y aún no se despacha, por guía.
 * Se buscan o marcan las guías y «Armar despacho» las lleva a la pantalla de Despacho.
 */

type Row = { guia: string | null; district: string | null; dealer: string | null; nave: string | null; container: string | null; w2: number; w3: number; total: number; since: string; need: number; models: string | null; est: string | null; billing: string | null; overdue: number };

/** Cuadro resumen por distrito: marca · distrito · guías · lead time · motos · motokares · total · desplegar (celular: marca · distrito · total · desplegar) */
const DCOLS = "grid-cols-[1.25rem_minmax(0,1fr)_auto_2rem] gap-x-3 lg:grid-cols-[1.25rem_minmax(0,1.6fr)_4rem_9rem_6rem_6rem_6.5rem_2rem]";
/** Columnas de cada guía: marca · guía/dealer · nave/modelos · lead time · en almacén · motos y motokares · total (celular: marca · guía · total) */
const COLS = "grid-cols-[1.25rem_minmax(0,1fr)_3.5rem] gap-x-3 lg:grid-cols-[1.25rem_minmax(0,1.3fr)_minmax(0,1fr)_10rem_5.75rem_8.5rem_3rem]";

/** Motos y motokares juntos: una pastilla por tipo (si hay de los dos, se ven las dos). */
function Kinds({ w2, w3 }: { w2: number; w3: number }) {
  return (
    <span className="flex flex-wrap gap-1">
      {(w2 > 0 || !w3) && <Kind v={w2} k="w2" />}
      {w3 > 0 && <Kind v={w3} k="w3" short />}
    </span>
  );
}

export default function StockPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ role: string; stages: { site: Site; field: string }[] } | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [canDispatch, setCanDispatch] = useState(false);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "late" | "ok">("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set()); // distritos con sus guías desplegadas
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const again = () => setReload((x) => x + 1);
    window.addEventListener(DATA_EVENT, again);
    return () => window.removeEventListener(DATA_EVENT, again);
  }, []);

  useEffect(() => { fetch("/api/me").then((r) => r.json()).then(setMe); }, []);
  const sites = useMemo<Site[]>(() => {
    if (!me) return [];
    // Solo Pucallpa: Yurimaguas tiene sus propias pantallas (sin contenedores, con despacho por ruta)
    if (me.role !== "operator") return ["PCL"];
    return (["PCL"] as Site[]).filter((s) => me.stages.some((st) => st.site === s && (st.field === "d_almacen" || st.field === "d_despacho")));
  }, [me]);
  const current = site ?? sites[0] ?? null;
  useEffect(() => {
    if (!current) return;
    let alive = true;
    fetch(`/api/despacho?${new URLSearchParams({ site: current, stock: "1" })}`).then((r) => r.json()).then((j) => { if (alive) { setRows(j.rows ?? []); setCanDispatch(!!j.canDispatch); } });
    return () => { alive = false; };
  }, [current, reload]);

  const needle = q.trim().toLowerCase();
  // Varias guías separadas por coma o espacio
  const terms = needle.split(/[\s,;]+/).filter(Boolean);
  const late = (r: Row) => r.overdue > 0;
  const shown = (rows ?? []).filter((r) => (only === "all" || (only === "late") === late(r)) && (!terms.length || terms.some((t) => [r.guia, r.dealer, r.district, r.nave, r.container, r.models].some((x) => (x ?? "").toLowerCase().includes(t)))));
  const lateCount = (rows ?? []).filter(late).length;
  /** Días entre dos fechas YYYY-MM-DD (b − a) */
  const dd = (a: string, b: Date) => daysBetween(parseISO(String(a).slice(0, 10)), b);
  const key = (r: Row) => r.guia ?? "";
  const chosen = (rows ?? []).filter((r) => sel.has(key(r)));
  const sum = (list: Row[]) => list.reduce((t, r) => ({ w2: t.w2 + r.w2, w3: t.w3 + r.w3, total: t.total + r.total }), { w2: 0, w3: 0, total: 0 });
  const all = sum(rows ?? []), pick = sum(chosen);
  const today = todayLima();
  const flip = (k: string) => setSel((s) => { const y = new Set(s); if (y.has(k)) y.delete(k); else y.add(k); return y; });
  const allShown = shown.length > 0 && shown.every((r) => sel.has(key(r)));
  // Agrupadas por distrito (alfabético); dentro, primero las vencidas
  const groups = [...shown.reduce((m, r) => { const d = r.district ?? "Sin distrito"; m.set(d, [...(m.get(d) ?? []), r]); return m; }, new Map<string, Row[]>())]
    .sort(([a], [b]) => a.localeCompare(b, "es"))
    .map(([district, list]) => ({ district, list: list.sort((a, b) => b.overdue - a.overdue || String(a.guia).localeCompare(String(b.guia))), ...sum(list) }));
  const allOpen = groups.length > 0 && groups.every((g) => open.has(g.district));
  const shownSum = sum(shown);
  const flipMany = (list: Row[]) => setSel((s) => { const y = new Set(s); const every = list.every((r) => y.has(key(r))); for (const r of list) { if (every) y.delete(key(r)); else y.add(key(r)); } return y; });

  if (!me) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  if (!sites.length || !current) return <div className="p-6 text-sm text-sb-on-surface-variant">El almacén no es una etapa asignada a ti.</div>;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <PageTitle title="Stock en almacén" sub="Todo lo que ingresó al almacén y aún no se despacha. Busca o marca las guías y arma el despacho.">
        {sites.length > 1 && (
          <div className="flex rounded-full bg-sb-surface-container p-1">
            {sites.map((s) => (
              <button key={s} type="button" onClick={() => { setSite(s); setSel(new Set()); setRows(null); }}
                className={cn("sb-pill rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200", current === s ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
                {SITE_INFO[s].title}
              </button>
            ))}
          </div>
        )}
      </PageTitle>

      {/* Resumen */}
      <Card className="grid grid-cols-2 divide-sb-outline-variant/40 sm:grid-cols-4 sm:divide-x">
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">En almacén</p>
          <p className="mt-1 text-3xl font-semibold leading-none tabular-nums">{rows ? n(all.total) : "…"}<span className="ml-1.5 text-sm font-normal text-sb-on-surface-variant">unidades</span></p>
          <div className="mt-3 max-w-[11rem] [&>span]:flex"><Mix w2={all.w2} w3={all.w3} /></div>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">Guías</p>
          <p className="mt-1 text-3xl font-semibold leading-none tabular-nums">{rows ? n(rows.length) : "…"}</p>
          <p className="mt-2 text-[11px] text-sb-on-surface-variant">{rows ? `${plural(new Set(rows.map((r) => r.dealer)).size, ["dealer", "dealers"])} · ${plural(new Set(rows.map((r) => r.district)).size, ["distrito", "distritos"])}` : ""}</p>
        </div>
        <div className="col-span-2 border-t border-sb-outline-variant/40 p-4 sm:col-span-2 sm:border-t-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">Lead time</p>
          <div className="mt-1 flex items-end gap-5">
            <p className="text-3xl font-semibold leading-none tabular-nums text-sb-late">{rows ? n(lateCount) : "…"}<span className="ml-1.5 text-sm font-normal">vencidas</span></p>
            <p className="text-3xl font-semibold leading-none tabular-nums text-sb-ontime">{rows ? n((rows?.length ?? 0) - lateCount) : "…"}<span className="ml-1.5 text-sm font-normal">al día</span></p>
          </div>
          <span className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-sb-surface-container">
            <span className="bg-sb-late transition-[width] duration-500" style={{ width: `${rows?.length ? (lateCount / rows.length) * 100 : 0}%` }} />
            <span className="bg-sb-ontime transition-[width] duration-500" style={{ width: `${rows?.length ? ((rows.length - lateCount) / rows.length) * 100 : 0}%` }} />
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-sb-outline-variant/40 px-4 py-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sb-primary-soft text-sb-primary"><Warehouse className="h-[18px] w-[18px]" /></span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Stock por distrito</h3>
            <p className="text-[11px] text-sb-on-surface-variant">Toca un distrito para ver sus guías · márcalo para armar el despacho</p>
          </div>
          <div className="flex rounded-full bg-sb-surface-container p-0.5 sm:ml-2">
            {([["all", "Todas", rows?.length ?? 0], ["late", "Vencidas", lateCount], ["ok", "Al día", (rows?.length ?? 0) - lateCount]] as const).map(([k, l, c]) => (
              <button key={k} type="button" onClick={() => setOnly(k)} aria-pressed={only === k}
                className={cn("sb-pill flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold",
                  only === k ? "bg-sb-surface text-sb-on-surface shadow-sm" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
                {k !== "all" && <span className={cn("h-1.5 w-1.5 rounded-full", k === "late" ? "bg-sb-late" : "bg-sb-ontime")} />}
                {l}<span className="tabular-nums opacity-60">{n(c)}</span>
              </button>
            ))}
          </div>
          <label className="relative w-full sm:ml-auto sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sb-on-surface-variant" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Guía, dealer, distrito o nave (varias con coma)"
              className="h-10 w-full rounded-full border border-sb-outline-variant bg-sb-surface pl-9 pr-8 text-sm outline-none transition-colors focus:border-sb-on-surface" />
            {q && <button type="button" aria-label="Limpiar" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-sb-on-surface-variant hover:bg-sb-surface-container"><X className="h-3.5 w-3.5" /></button>}
          </label>
        </div>

        <div className="p-2 sm:p-3">
          {/* Cuadro resumen: un renglón por distrito (sus guías se despliegan al tocarlo) */}
          {!!shown.length && (
            <div className={cn(DCOLS, "hidden px-3 pb-2 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant lg:grid")}>
              <button type="button" role="checkbox" aria-checked={allShown} aria-label="Marcar todas las que se ven"
                onClick={() => flipMany(shown)}
                className={cn("grid h-5 w-5 place-items-center rounded-full border transition-colors", allShown ? "border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant bg-sb-surface")}>
                <Check className={cn("h-3 w-3", allShown ? "opacity-100" : "opacity-0")} strokeWidth={3} />
              </button>
              <span>Distrito</span><span className="text-right">Guías</span><span>Lead time</span>
              <span className="text-right" style={{ color: W2 }}>Motos</span><span className="text-right" style={{ color: W3 }}>Motokares</span><span className="text-right">Total</span>
              <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.district)))}
                className="justify-self-end rounded-full p-1 text-sb-on-surface-variant hover:bg-sb-surface-container hover:text-sb-on-surface" aria-label={allOpen ? "Plegar todos" : "Desplegar todos"} title={allOpen ? "Plegar todos" : "Desplegar todos"}>
                <ChevronsUpDown className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex flex-col">
            {!rows && [0, 1, 2, 3].map((i) => <div key={i} className="mb-0.5 h-[52px] animate-pulse rounded-xl bg-sb-surface-container-low" />)}
            {rows && !shown.length && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-sb-outline-variant/60 px-4 py-12 text-center text-xs text-sb-on-surface-variant">
                <Inbox className="h-5 w-5 opacity-50" />{rows.length ? "Ninguna guía coincide con la búsqueda." : "No hay unidades en almacén."}
              </div>
            )}
            {groups.map((g) => {
              const every = g.list.every((r) => sel.has(key(r))), some = g.list.some((r) => sel.has(key(r)));
              const lateN = g.list.filter(late).length;
              const isOpen = open.has(g.district) || terms.length > 0;
              const toggle = () => setOpen((o) => { const y = new Set(o); if (y.has(g.district)) y.delete(g.district); else y.add(g.district); return y; });
              return (
                <div key={g.district} className="border-t border-sb-outline-variant/40 first:border-t-0">
                  <div className={cn(DCOLS, "grid items-center rounded-xl px-3 py-2.5 transition-colors duration-200", every ? "bg-sb-primary-soft" : "hover:bg-sb-surface-container-low")}>
                    <button type="button" role="checkbox" aria-checked={every} aria-label={`Marcar las guías de ${g.district}`} onClick={() => flipMany(g.list)}
                      className={cn("grid h-5 w-5 place-items-center rounded-full border transition-all duration-200", every ? "border-sb-primary bg-sb-primary text-sb-on-primary" : some ? "border-sb-primary bg-sb-surface" : "border-sb-outline-variant bg-sb-surface")}>
                      <Check className={cn("h-3 w-3 transition-opacity", every ? "opacity-100" : "opacity-0")} strokeWidth={3} />
                    </button>
                    {/* Tocar el distrito despliega sus guías */}
                    <button type="button" onClick={toggle} aria-expanded={isOpen} className="min-w-0 text-left">
                      <span className="block truncate text-sm font-semibold uppercase tracking-tight">{g.district}</span>
                      <span className="mt-1 flex h-1 max-w-[12rem] overflow-hidden rounded-full bg-sb-surface-container">
                        <span style={{ width: `${(g.w2 / (g.total || 1)) * 100}%`, background: W2 }} />
                        <span style={{ width: `${(g.w3 / (g.total || 1)) * 100}%`, background: W3 }} />
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-sb-on-surface-variant lg:hidden">
                        {plural(g.list.length, ["guía", "guías"])} · <KindText w2={g.w2} w3={g.w3} />{lateN ? <span className="text-sb-late"> · {lateN} vencida{lateN === 1 ? "" : "s"}</span> : null}
                      </span>
                    </button>
                    <span className="hidden text-right text-sm tabular-nums lg:block">{n(g.list.length)}</span>
                    <span className="hidden lg:block">
                      {lateN
                        ? <span className="inline-flex rounded-full bg-sb-late-soft px-2 py-0.5 text-[11px] font-semibold text-sb-late">{lateN} vencida{lateN === 1 ? "" : "s"}</span>
                        : <span className="inline-flex rounded-full bg-sb-ontime-soft px-2 py-0.5 text-[11px] font-semibold text-sb-ontime">Al día</span>}
                    </span>
                    <span className="hidden text-right text-sm font-semibold tabular-nums lg:block" style={{ color: g.w2 ? W2 : undefined, opacity: g.w2 ? 1 : 0.35 }}>{n(g.w2)}</span>
                    <span className="hidden text-right text-sm font-semibold tabular-nums lg:block" style={{ color: g.w3 ? W3 : undefined, opacity: g.w3 ? 1 : 0.35 }}>{n(g.w3)}</span>
                    <span className="text-right">
                      <span className="text-base font-semibold tabular-nums">{n(g.total)}</span>
                      <span className="ml-1 text-[10px] text-sb-on-surface-variant">unid.</span>
                    </span>
                    <button type="button" onClick={toggle} aria-expanded={isOpen} aria-label={isOpen ? `Ocultar guías de ${g.district}` : `Ver guías de ${g.district}`}
                      className="sb-pill-icon justify-self-end rounded-full p-1.5 text-sb-on-surface-variant hover:bg-sb-surface-container hover:text-sb-on-surface">
                      <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", isOpen && "rotate-180")} />
                    </button>
                  </div>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                        <div className="mb-2 ml-3 flex flex-col gap-0.5 border-l-2 border-sb-outline-variant/50 pl-2 lg:ml-[1.1rem] lg:pl-3">
                          <div className={cn(COLS, "hidden px-3 pt-1 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant/80 lg:grid")}>
                            <span /><span>Guía · dealer</span><span>Nave · modelos</span><span>Lead time</span><span>En almacén</span><span>Motos y motokares</span><span className="text-right">Total</span>
                          </div>
                  {g.list.map((r) => {
                    const on = sel.has(key(r)), days = r.since ? daysBetween(parseISO(String(r.since).slice(0, 10)), today) : 0;
                    const left = r.est ? -dd(r.est, today) : null, lead = r.est && r.billing ? dd(r.billing, parseISO(String(r.est).slice(0, 10))) : null;
                    const tone = late(r) ? "late" : "ontime";
                    return (
                      <button key={`${key(r)}|${r.dealer}`} type="button" role="checkbox" aria-checked={on} aria-label={`Marcar ${r.guia}`} onClick={() => flip(key(r))}
                        className={cn(COLS, "grid items-center gap-y-1 rounded-xl px-3 py-3 text-left transition-colors duration-200", on ? "bg-sb-primary-soft" : "hover:bg-sb-surface-container-low")}>
                        <span className={cn("grid h-5 w-5 place-items-center rounded-full border transition-all duration-200", on ? "scale-105 border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant bg-sb-surface")}>
                          <Check className={cn("h-3 w-3 transition-opacity", on ? "opacity-100" : "opacity-0")} strokeWidth={3} />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 font-mono text-sm font-semibold tracking-tight">
                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone === "late" ? "bg-sb-late" : "bg-sb-ontime")} />{r.guia ?? "—"}
                          </span>
                          <span className="block truncate text-[11px] text-sb-on-surface-variant" title={r.dealer ?? ""}>{r.dealer ?? "—"}</span>
                        </span>
                        <span className="hidden min-w-0 text-[11px] text-sb-on-surface-variant lg:block">
                          <span className="block truncate text-xs text-sb-on-surface">{r.nave ?? "—"}{r.container ? <span className="ml-1.5 font-mono text-[10px] text-sb-on-surface-variant">{r.container}</span> : null}</span>
                          <span className="block truncate" title={r.models ?? ""}>{r.models ?? "—"}</span>
                        </span>
                        <span className="col-start-2 min-w-0 lg:col-start-auto">
                          {left !== null ? (
                            <>
                              <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", tone === "late" ? "bg-sb-late-soft text-sb-late" : "bg-sb-ontime-soft text-sb-ontime")}>
                                {late(r) ? `Vencida hace ${-left} día${left === -1 ? "" : "s"}` : left === 0 ? "Vence hoy" : `Quedan ${left} día${left === 1 ? "" : "s"}`}
                              </span>
                              <span className="mt-0.5 block truncate text-[10px] text-sb-on-surface-variant">vence {fmtDate(r.est)}{lead !== null ? ` · ${lead} días de plazo` : ""}</span>
                            </>
                          ) : <span className="text-[11px] text-sb-on-surface-variant">Sin plazo</span>}
                        </span>
                        <span className="hidden text-[11px] lg:block">
                          <span className="block text-xs">{fmtDate(r.since)}</span>
                          <span className={cn("text-[10px]", days >= 7 ? "font-semibold text-sb-late" : "text-sb-on-surface-variant")}>{days <= 0 ? "ingresó hoy" : `hace ${days} día${days === 1 ? "" : "s"}`}</span>
                        </span>
                        <span className="hidden lg:block"><Kinds w2={r.w2} w3={r.w3} /></span>
                        <span className="col-start-3 row-span-2 row-start-1 text-right lg:col-start-auto lg:row-span-1 lg:row-start-auto">
                          <span className="block text-sm font-semibold tabular-nums">{n(r.total)}</span>
                          <span className="block text-[10px] text-sb-on-surface-variant">unid.</span>
                        </span>
                      </button>
                    );
                  })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
            {/* Total de todos los distritos que se ven */}
            {groups.length > 1 && (
              <div className={cn(DCOLS, "grid items-center border-t-2 border-sb-outline-variant/60 px-3 pt-3 text-sm font-semibold tabular-nums")}>
                <span />
                <span className="min-w-0">Total <span className="text-[11px] font-normal text-sb-on-surface-variant">· {plural(groups.length, ["distrito", "distritos"])}</span>
                  <span className="mt-0.5 block text-[11px] font-normal lg:hidden"><KindText w2={shownSum.w2} w3={shownSum.w3} /></span>
                </span>
                <span className="hidden text-right lg:block">{n(shown.length)}</span><span className="hidden lg:block" />
                <span className="hidden text-right lg:block" style={{ color: W2 }}>{n(shownSum.w2)}</span>
                <span className="hidden text-right lg:block" style={{ color: W3 }}>{n(shownSum.w3)}</span>
                <span className="text-right text-base">{n(shownSum.total)}<span className="ml-1 text-[10px] font-normal text-sb-on-surface-variant">unid.</span></span>
                <span />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Barra para armar el despacho con lo marcado */}
      {chosen.length > 0 && (
        <div className="sticky bottom-24 z-40 flex items-center gap-2 sm:gap-3 rounded-2xl border border-sb-outline-variant/60 bg-sb-surface/90 p-3 pl-4 shadow-2xl backdrop-blur-xl md:bottom-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold"><span className="text-lg tabular-nums">{n(pick.total)}</span> unidades <span className="font-normal text-sb-on-surface-variant">en {chosen.length === 1 ? "1 guía" : `${chosen.length} guías`}</span></p>
            <p className="truncate text-[11px] text-sb-on-surface-variant">{canDispatch ? <><KindText w2={pick.w2} w3={pick.w3} /> · {[...new Set(chosen.map((r) => r.district).filter(Boolean))].join(", ")}</> : "El despacho no es tu etapa: pásale estas guías a quien despacha."}</p>
          </div>
          <Button variant="secondary" className="shrink-0 rounded-full" aria-label="Quitar lo marcado" onPress={() => setSel(new Set())}><X className="h-4 w-4" /><span className="hidden sm:inline">Quitar</span></Button>
          <Button variant="primary" className="shrink-0 rounded-full" isDisabled={!canDispatch}
            onPress={() => {
              // Despacho las toma al abrir y las agrega al viaje
              try { sessionStorage.setItem("sb-despacho-preload", JSON.stringify({ site: current, guias: chosen.map(key), at: Date.now() })); } catch { /* sin almacenamiento: se escriben a mano */ }
              router.push("/despacho");
            }}>
            <Forklift className="h-4 w-4" /><span className="hidden min-[400px]:inline">Armar despacho</span><span className="min-[400px]:hidden">Despachar</span>
          </Button>
        </div>
      )}
    </div>
  );
}
