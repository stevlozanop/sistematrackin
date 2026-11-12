"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { Check, Forklift, Inbox, Search, Warehouse, X } from "lucide-react";
import { Mix, n, plural } from "@/components/stage/StageKit";
import { Card, PageTitle } from "@/components/ui";
import { DATA_EVENT } from "@/components/UploadCenter";
import { SITE_INFO, fmtDate, type Site } from "@/lib/hsp";
import { daysBetween, parseISO, todayLima } from "@/lib/dates";
import { cn } from "@/lib/cn";

/**
 * Stock en almacén (entre el paso 4 y el 5): todo lo que ingresó al almacén y aún no se despacha, por guía.
 * Se buscan o marcan las guías y «Armar despacho» las lleva a la pantalla de Despacho.
 */

type Row = { guia: string | null; district: string | null; dealer: string | null; nave: string | null; container: string | null; w2: number; w3: number; total: number; since: string; need: number; models: string | null; est: string | null; billing: string | null; overdue: number };

/** Columnas de cada guía: marca · guía/dealer · nave/modelos · lead time · en almacén · 2W/3W · total (celular: marca · guía · total) */
const COLS = "grid-cols-[1.25rem_minmax(0,1fr)_3.5rem] gap-x-3 lg:grid-cols-[1.25rem_minmax(0,1.5fr)_minmax(0,1fr)_10.5rem_6.5rem_7rem_3.5rem]";

export default function StockPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ role: string; stages: { site: Site; field: string }[] } | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [canDispatch, setCanDispatch] = useState(false);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "late" | "ok">("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
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

  if (!me) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  if (!sites.length || !current) return <div className="p-6 text-sm text-sb-on-surface-variant">El almacén no es una etapa asignada a ti.</div>;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <PageTitle title="Stock en almacén" sub="Todo lo que ingresó al almacén y aún no se despacha. Busca o marca las guías y arma el despacho.">
        {sites.length > 1 && (
          <div className="flex rounded-full bg-sb-surface-container p-1">
            {sites.map((s) => (
              <button key={s} type="button" onClick={() => { setSite(s); setSel(new Set()); setRows(null); }}
                className={cn("rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200", current === s ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
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
          <p className="mt-1 text-3xl font-semibold leading-none tabular-nums">{rows ? n(all.total) : "…"}<span className="ml-1.5 text-sm font-normal text-sb-on-surface-variant">motos</span></p>
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
            <h3 className="text-sm font-semibold">Guías en almacén</h3>
            <p className="text-[11px] text-sb-on-surface-variant">Marca las guías que salen y arma el despacho</p>
          </div>
          <div className="flex rounded-full bg-sb-surface-container p-0.5 sm:ml-2">
            {([["all", "Todas", rows?.length ?? 0], ["late", "Vencidas", lateCount], ["ok", "Al día", (rows?.length ?? 0) - lateCount]] as const).map(([k, l, c]) => (
              <button key={k} type="button" onClick={() => setOnly(k)} aria-pressed={only === k}
                className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors duration-200",
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
          {/* Encabezado de columnas (escritorio) */}
          {!!shown.length && (
            <div className={cn(COLS, "hidden px-3 pb-2 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant lg:grid")}>
              <button type="button" role="checkbox" aria-checked={allShown} aria-label="Marcar todas las que se ven"
                onClick={() => setSel((s) => { const y = new Set(s); for (const r of shown) { if (allShown) y.delete(key(r)); else y.add(key(r)); } return y; })}
                className={cn("grid h-5 w-5 place-items-center rounded-full border transition-colors", allShown ? "border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant bg-sb-surface")}>
                <Check className={cn("h-3 w-3", allShown ? "opacity-100" : "opacity-0")} strokeWidth={3} />
              </button>
              <span>Guía · dealer</span><span>Nave · modelos</span><span>Lead time</span><span>En almacén</span><span>2W · 3W</span><span className="text-right">Total</span>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {!rows && [0, 1, 2, 3].map((i) => <div key={i} className="h-[62px] animate-pulse rounded-xl bg-sb-surface-container-low" />)}
            {rows && !shown.length && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-sb-outline-variant/60 px-4 py-12 text-center text-xs text-sb-on-surface-variant">
                <Inbox className="h-5 w-5 opacity-50" />{rows.length ? "Ninguna guía coincide con la búsqueda." : "No hay unidades en almacén."}
              </div>
            )}
            {shown.map((r) => {
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
                    <span className="block truncate text-[11px] text-sb-on-surface-variant" title={r.dealer ?? ""}>{r.district ?? "—"} · {r.dealer ?? "—"}</span>
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
                  <span className="hidden lg:block"><Mix w2={r.w2} w3={r.w3} /></span>
                  <span className="col-start-3 row-span-2 row-start-1 text-right lg:col-start-auto lg:row-span-1 lg:row-start-auto">
                    <span className="block text-sm font-semibold tabular-nums">{n(r.total)}</span>
                    <span className="block text-[10px] text-sb-on-surface-variant">motos</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Barra para armar el despacho con lo marcado */}
      {chosen.length > 0 && (
        <div className="sticky bottom-24 z-40 flex items-center gap-2 sm:gap-3 rounded-2xl border border-sb-outline-variant/60 bg-sb-surface/90 p-3 pl-4 shadow-2xl backdrop-blur-xl md:bottom-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold"><span className="text-lg tabular-nums">{n(pick.total)}</span> motos <span className="font-normal text-sb-on-surface-variant">en {chosen.length === 1 ? "1 guía" : `${chosen.length} guías`}</span></p>
            <p className="truncate text-[11px] text-sb-on-surface-variant">{canDispatch ? <>2W {n(pick.w2)} · 3W {n(pick.w3)} · {[...new Set(chosen.map((r) => r.district).filter(Boolean))].join(", ")}</> : "El despacho no es tu etapa: pásale estas guías a quien despacha."}</p>
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
