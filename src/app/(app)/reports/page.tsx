"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { Download, FileText, Printer } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { ServiceSplitBar } from "@/components/Service";
import { cn } from "@/lib/cn";
import { MONTHS, STATUS_LABEL, fmtDate, type Status } from "@/lib/hsp";

type Summary = {
  title: string; filters: string[]; generatedAt: string; target: number;
  totals: { total: number; delivered: number; open: number; onTime: number; late: number; overdue: number; avgDays: string | number | null };
  byMonth: { ym: string; total: number; delivered: number; open: number; on_time: number; late: number }[];
  byStatus: { status: Status; n: number; overdue: number }[];
  byClient: { client: string | null; total: number; open: number; on_time: number }[];
  oldest: { site: string; chassis: string; guia: string | null; dealer: string | null; status: Status; billing_date: string; est_date: string | null; age: number; delay_reason: string | null }[];
};

const ORDER: Status[] = ["IQT-PORT", "TRANSITO FLUVIAL", "ARRIBO PUERTO", "EN ALMACÉN", "TRANSITO DEALER", "EN ALMACÉN LIMA", "TRANSITO DEALER 2"];
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null);
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthsAgo = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

const input = "h-9 rounded-xl border border-sb-outline-variant bg-sb-surface-container-low px-2 text-sm outline-none focus:border-sb-primary";

/**
 * Reportes: el resumen que Honda (o Leyva) le entrega a su supervisor.
 * Se filtra por período de facturación, módulo y cliente; se descarga en Excel o se imprime / guarda en PDF.
 */
export default function ReportsPage() {
  const [from, setFrom] = useState(monthsAgo(2));
  const [to, setTo] = useState(thisMonth());
  const [site, setSite] = useState("");
  const [client, setClient] = useState("");
  const [clients, setClients] = useState<string[]>([]);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/dealers").then((r) => (r.ok ? r.json() : [])).then((d: { client: string | null }[]) =>
      setClients([...new Set(d.map((x) => x.client).filter((c): c is string => !!c))].sort())).catch(() => {});
  }, []);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (site) p.set("site", site);
    if (client) p.set("client", client);
    return p.toString();
  }, [from, to, site, client]);

  // El resumen se actualiza al cambiar los filtros
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/report/summary?${params}`).then((r) => r.json()).then((d) => { if (alive) { setData(d); setLoading(false); } });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [params]);

  const t = data?.totals;
  const onTimePct = t ? pct(t.onTime, t.onTime + t.late) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <PageTitle title="Reportes" sub="Elige el período, el módulo y el cliente. Descárgalo en Excel o imprímelo / guárdalo en PDF para entregárselo a tu supervisor." />
      </div>

      {/* Filtros */}
      <Card className="flex flex-wrap items-end gap-3 p-4 print:hidden">
        <label className="flex flex-col gap-1 text-xs"><span className="font-medium">Desde (facturación)</span>
          <input type="month" className={input} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs"><span className="font-medium">Hasta</span>
          <input type="month" className={input} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs"><span className="font-medium">Módulo</span>
          <select className={input} value={site} onChange={(e) => setSite(e.target.value)}>
            <option value="">PCL y YUR</option>
            <option value="PCL">PCL · Pucallpa</option>
            <option value="YUR">YUR · Yurimaguas</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs"><span className="font-medium">Cliente</span>
          <select className={cn(input, "w-56")} value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clients.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <a href={`/api/report?${params}`} className="sbf-chip flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> Descargar Excel</a>
          <Button variant="primary" className="rounded-full" onPress={() => window.print()} isDisabled={!data}>
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </Button>
        </div>
      </Card>

      {/* Reporte (lo que se imprime) */}
      {!data ? <div className="p-6 text-sm text-sb-on-surface-variant">Cargando reporte…</div> : (
        <div className={cn("flex flex-col gap-4 transition-opacity print:gap-3", loading && "opacity-60")}>
          <Card className="p-5 print:border-0 print:p-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-sb-on-surface-variant"><FileText className="h-3.5 w-3.5" /> Reporte de estados · System Trackin</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">{data.title}</h2>
                <p className="text-[12px] text-sb-on-surface-variant">{data.filters.length ? data.filters.join(" · ") : "Todo el período"}</p>
              </div>
              <p className="text-right text-[11px] text-sb-on-surface-variant">Generado el {new Date(data.generatedAt).toLocaleString("es-PE")}</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-sb-outline-variant/30 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Unidades", t!.total.toLocaleString()],
                ["Entregadas", t!.delivered.toLocaleString()],
                ["Sin entregar", t!.open.toLocaleString()],
                ["Vencidas sin entregar", t!.overdue.toLocaleString()],
                [`A tiempo · meta ${data.target}%`, onTimePct === null ? "—" : `${onTimePct}%`],
                ["Días promedio de entrega", t!.avgDays === null ? "—" : String(t!.avgDays)],
              ].map(([k, v]) => (
                <div key={k} className="bg-sb-surface px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant/70">{k}</p>
                  <p className={cn("text-lg font-bold", k.startsWith("A tiempo") && onTimePct !== null && (onTimePct >= data.target ? "text-sb-ontime" : "text-sb-late"))}>{v}</p>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
            <Card className="p-5 print:break-inside-avoid">
              <h3 className="mb-3 text-sm font-semibold">Nivel de servicio por mes de facturación</h3>
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant/60">
                  <th className="py-1.5 font-semibold">Mes</th><th className="py-1.5 text-right font-semibold">Unidades</th>
                  <th className="py-1.5 text-right font-semibold">Sin entregar</th><th className="w-[40%] py-1.5 pl-3 font-semibold">A tiempo</th>
                </tr></thead>
                <tbody>
                  {data.byMonth.map((m) => (
                    <tr key={m.ym} className="border-b border-sb-outline-variant/20 last:border-0">
                      <td className="py-1.5">{monthName(m.ym)}</td>
                      <td className="py-1.5 text-right">{m.total.toLocaleString()}</td>
                      <td className="py-1.5 text-right">{m.open ? m.open.toLocaleString() : "—"}</td>
                      <td className="py-1.5 pl-3"><ServiceSplitBar onTime={m.on_time} late={m.late} /></td>
                    </tr>
                  ))}
                  {!data.byMonth.length && <tr><td colSpan={4} className="py-4 text-center text-sb-on-surface-variant">Sin unidades en este período.</td></tr>}
                </tbody>
              </table>
            </Card>

            <Card className="p-5 print:break-inside-avoid">
              <h3 className="mb-3 text-sm font-semibold">¿Dónde están las {t!.open.toLocaleString()} unidades sin entregar?</h3>
              {ORDER.filter((s) => data.byStatus.some((r) => r.status === s)).map((s) => {
                const r = data.byStatus.find((x) => x.status === s)!;
                return (
                  <div key={s} className="flex items-center justify-between border-b border-sb-outline-variant/20 py-1.5 text-xs last:border-0">
                    <span>{STATUS_LABEL[s]}</span>
                    <span><b>{r.n.toLocaleString()}</b>{r.overdue > 0 && <span className="ml-1.5 text-sb-late">({r.overdue} vencidas)</span>}</span>
                  </div>
                );
              })}
              {!data.byStatus.length && <p className="text-xs text-sb-on-surface-variant">Todo entregado.</p>}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
            <Card className="p-5 print:break-inside-avoid">
              <h3 className="mb-3 text-sm font-semibold">Por cliente</h3>
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant/60">
                  <th className="py-1.5 font-semibold">Cliente</th><th className="py-1.5 text-right font-semibold">Unidades</th>
                  <th className="py-1.5 text-right font-semibold">Sin entregar</th><th className="py-1.5 text-right font-semibold">% a tiempo</th>
                </tr></thead>
                <tbody>
                  {data.byClient.map((c) => (
                    <tr key={c.client ?? "—"} className="border-b border-sb-outline-variant/20 last:border-0">
                      <td className="py-1.5">{c.client ?? "(sin cliente)"}</td>
                      <td className="py-1.5 text-right">{c.total.toLocaleString()}</td>
                      <td className="py-1.5 text-right">{c.open ? c.open.toLocaleString() : "—"}</td>
                      <td className="py-1.5 text-right">{pct(c.on_time, c.total) ?? "—"}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="p-5 print:break-inside-avoid">
              <h3 className="mb-3 text-sm font-semibold">Las más antiguas sin entregar (FIFO)</h3>
              {data.oldest.map((u) => (
                <div key={u.chassis} className="border-b border-sb-outline-variant/20 py-1.5 text-xs last:border-0">
                  <div className="flex justify-between gap-2"><b className="font-mono font-medium">{u.chassis}</b><span className="text-sb-on-surface-variant">{fmtDate(u.billing_date)} · {u.age} días</span></div>
                  <div className="text-[11px] text-sb-on-surface-variant">{u.site} · {STATUS_LABEL[u.status]} · {u.dealer}{u.guia ? ` · Guía ${u.guia}` : ""}{u.delay_reason ? ` · ${u.delay_reason}` : ""}</div>
                </div>
              ))}
              {!data.oldest.length && <p className="text-xs text-sb-on-surface-variant">Todo entregado.</p>}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
