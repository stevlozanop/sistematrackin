"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { Forklift, Search, Warehouse, X } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { DATA_EVENT } from "@/components/UploadCenter";
import { SITE_INFO, fmtDate, unitsText, type Site } from "@/lib/hsp";
import { daysBetween, parseISO, todayLima } from "@/lib/dates";
import { cn } from "@/lib/cn";

/**
 * Stock en almacén (entre el paso 4 y el 5): todo lo que ingresó al almacén y aún no se despacha, por guía.
 * Se buscan o marcan las guías y «Armar despacho» las lleva a la pantalla de Despacho.
 */

type Row = { guia: string | null; district: string | null; dealer: string | null; nave: string | null; container: string | null; w2: number; w3: number; total: number; since: string; need: number; models: string | null; est: string | null; billing: string | null; overdue: number };

const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");

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
    if (me.role !== "operator") return ["PCL", "YUR"];
    return (["PCL", "YUR"] as Site[]).filter((s) => me.stages.some((st) => st.site === s && (st.field === "d_almacen" || st.field === "d_despacho")));
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Unidades en almacén", n(all.total)], ["2W · 3W", `${n(all.w2)} · ${n(all.w3)}`], ["Guías", n(rows?.length ?? 0)]].map(([l, v]) => (
          <Card key={l} className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant">{l}</p>
            <p className="text-2xl font-bold tabular-nums">{rows ? v : "…"}</p>
          </Card>
        ))}
        <Card className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant">Lead time</p>
          <p className="text-2xl font-bold tabular-nums"><span className="text-sb-late">{rows ? n(lateCount) : "…"}</span><span className="text-base font-medium text-sb-on-surface-variant"> · </span><span className="text-sb-ontime">{rows ? n((rows?.length ?? 0) - lateCount) : "…"}</span></p>
          <p className="text-[10px] text-sb-on-surface-variant"><span className="text-sb-late">vencidas</span> · <span className="text-sb-ontime">al día</span></p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-sb-outline-variant/40 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Warehouse className="h-4 w-4" /> Unidades en almacén por guía</h3>
          <div className="flex rounded-full bg-sb-surface-container p-0.5">
            {([["all", "Todas"], ["late", "Vencidas"], ["ok", "Al día"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setOnly(k)}
                className={cn("rounded-full px-3 py-1 text-[11px] font-semibold transition-colors", only === k ? (k === "late" ? "bg-sb-late text-white" : k === "ok" ? "bg-sb-ontime text-white" : "bg-sb-surface text-sb-on-surface shadow-sm") : "text-sb-on-surface-variant")}>{l}</button>
            ))}
          </div>
          <label className="relative ml-auto w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sb-on-surface-variant" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar guía, dealer, distrito o nave (varias con coma)"
              className="h-10 w-full rounded-xl border border-sb-outline-variant bg-sb-surface pl-9 pr-8 text-sm outline-none focus:border-sb-on-surface" />
            {q && <button type="button" aria-label="Limpiar" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-sb-on-surface-variant"><X className="h-3.5 w-3.5" /></button>}
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-xs">
            <thead>
              <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant">
                <th className="w-10 px-4 py-2">
                  <input type="checkbox" aria-label="Marcar todas las que se ven" className="h-4 w-4 accent-[var(--sb-primary)]" checked={allShown} disabled={!shown.length}
                    onChange={() => setSel((s) => { const y = new Set(s); for (const r of shown) { if (allShown) y.delete(key(r)); else y.add(key(r)); } return y; })} />
                </th>
                <th className="px-2 py-2 font-semibold">Guía R.</th><th className="px-2 py-2 font-semibold">Distrito</th><th className="px-2 py-2 font-semibold">Dealer</th>
                <th className="px-2 py-2 font-semibold">Modelos</th><th className="px-2 py-2 font-semibold">Nave · contenedor</th>
                <th className="px-2 py-2 text-right font-semibold">2W</th><th className="px-2 py-2 text-right font-semibold">3W</th><th className="px-2 py-2 text-right font-semibold">Total</th>
                <th className="px-2 py-2 font-semibold">Lead time</th>
                <th className="px-4 py-2 text-right font-semibold">En almacén</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const on = sel.has(key(r)), days = r.since ? daysBetween(parseISO(String(r.since).slice(0, 10)), today) : 0;
                return (
                  <tr key={`${key(r)}|${r.dealer}`} onClick={() => flip(key(r))} className={cn("cursor-pointer border-b border-sb-outline-variant/20 transition-colors last:border-0", on ? "bg-sb-primary-soft" : "hover:bg-sb-surface-container-low")}>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Marcar ${r.guia}`} className="h-4 w-4 accent-[var(--sb-primary)]" checked={on} onChange={() => flip(key(r))} />
                    </td>
                    <td className={cn("px-2 py-2.5 font-mono font-semibold", late(r) ? "text-sb-late" : "text-sb-ontime")}>{r.guia ?? "—"}</td>
                    <td className="px-2 py-2.5">{r.district ?? "—"}</td>
                    <td className="max-w-[14rem] truncate px-2 py-2.5" title={r.dealer ?? ""}>{r.dealer ?? "—"}</td>
                    <td className="max-w-[10rem] truncate px-2 py-2.5 text-sb-on-surface-variant" title={r.models ?? ""}>{r.models ?? "—"}</td>
                    <td className="px-2 py-2.5 text-sb-on-surface-variant">{r.nave ?? "—"}{r.container ? <span className="block font-mono text-[10px]">{r.container}</span> : null}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{r.w2 || ""}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{r.w3 || ""}</td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{n(r.total)}</td>
                    <td className="whitespace-nowrap px-2 py-2.5">
                      {r.est ? (() => {
                        const left = -dd(r.est, today), lead = r.billing ? dd(r.billing, parseISO(String(r.est).slice(0, 10))) : null;
                        return (
                          <span className={late(r) ? "text-sb-late" : "text-sb-ontime"}>
                            <b className="block">{late(r) ? `Vencida hace ${-left} día${left === -1 ? "" : "s"}` : left === 0 ? "Vence hoy" : `Quedan ${left} día${left === 1 ? "" : "s"}`}</b>
                            <span className="text-[10px] opacity-80">vence {fmtDate(r.est)}{lead !== null ? ` · ${lead} días de plazo` : ""}</span>
                          </span>
                        );
                      })() : <span className="text-sb-on-surface-variant">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <span className="block">{fmtDate(r.since)}</span>
                      <span className={cn("text-[10px]", days >= 7 ? "font-semibold text-sb-late" : "text-sb-on-surface-variant")}>{days <= 0 ? "hoy" : `${days} día${days === 1 ? "" : "s"}`}</span>
                    </td>
                  </tr>
                );
              })}
              {rows && !shown.length && <tr><td colSpan={11} className="px-4 py-10 text-center text-sb-on-surface-variant">{rows.length ? "Ninguna guía coincide con la búsqueda." : "No hay unidades en almacén."}</td></tr>}
              {!rows && <tr><td colSpan={11} className="px-4 py-10 text-center text-sb-on-surface-variant">Cargando…</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Barra para armar el despacho con lo marcado */}
      {chosen.length > 0 && (
        <div className="sticky bottom-24 z-40 flex flex-wrap items-center gap-3 rounded-2xl border border-sb-outline-variant bg-sb-surface p-3 shadow-2xl md:bottom-3">
          <div className="min-w-[10rem] flex-1">
            <p className="text-sm font-semibold">{chosen.length} guía(s) · {unitsText(pick.w2, pick.w3)}</p>
            <p className="text-[11px] text-sb-on-surface-variant">2W {n(pick.w2)} · 3W {n(pick.w3)} · {[...new Set(chosen.map((r) => r.district).filter(Boolean))].join(", ")}</p>
          </div>
          <Button variant="secondary" className="rounded-full" onPress={() => setSel(new Set())}><X className="h-4 w-4" /> Quitar</Button>
          <Button variant="primary" className="rounded-full" isDisabled={!canDispatch}
            onPress={() => {
              // Despacho las toma al abrir y las agrega al viaje
              try { sessionStorage.setItem("sb-despacho-preload", JSON.stringify({ site: current, guias: chosen.map(key), at: Date.now() })); } catch { /* sin almacenamiento: se escriben a mano */ }
              router.push("/despacho");
            }}>
            <Forklift className="h-4 w-4" /> Armar despacho
          </Button>
          {!canDispatch && <p className="w-full text-[11px] text-sb-on-surface-variant">El despacho no es tu etapa: pásale estas guías a quien despacha.</p>}
        </div>
      )}
    </div>
  );
}
