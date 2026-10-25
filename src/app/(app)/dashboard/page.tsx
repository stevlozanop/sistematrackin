"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ListBox, Select } from "@heroui/react";
import { CheckCircle2, Clock, Gauge, Ship, Target, Truck } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { StatGrid } from "@/components/StatCard";
import { ProcessRoute } from "@/components/ProcessRoute";
import { cn } from "@/lib/cn";
import { MONTHS, SITE_INFO, STATUS_LABEL, type Site, type Status } from "@/lib/hsp";

type Cell = { m: number; status: Status; service: "A TIEMPO" | "FUERA DE TIEMPO" | null; n: number };
type Data = {
  year: number; years: number[]; centers: string[]; cl: string[]; target: number;
  pcl: Cell[]; yur: Cell[]; reasons: { site: Site; reason: string | null; n: number }[];
};

const pct = (a: number, n: number) => (n ? Math.round((a / n) * 100) : null);
/** HSP = promedio de PCL y YUR sin redondear antes (como AVERAGE() en el Excel). */
const hspOf = (p: [number, number], y: [number, number]) => {
  const r = [p, y].filter(([, n]) => n).map(([a, n]) => (a / n) * 100);
  return r.length ? Math.round(r.reduce((t, v) => t + v, 0) / r.length) : null;
};
const fmtPct = (v: number | null) => (v === null ? "—" : `${v}%`);

/** Link al módulo con los filtros ya aplicados. */
const drill = (site: Site, year: number, p: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams({ year: String(year) });
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== "") q.set(k, String(v));
  return `/units/${site.toLowerCase()}?${q}`;
};

/** Réplica de la tabla dinámica del Excel: mes × estado, con filas A TIEMPO / FUERA DE TIEMPO. */
function StatusPivot({ site, cells, months, year }: { site: Site; cells: Cell[]; months: number[]; year: number }) {
  const statuses = SITE_INFO[site].statuses;
  const get = (m: number | null, st: Status | null, sv: string | null) =>
    cells.filter((c) => (m === null || c.m === m) && (st === null || c.status === st) && (sv === null || c.service === sv)).reduce((s, c) => s + c.n, 0);
  const rows = months.filter((m) => get(m, null, null));
  const num = (v: number, href: string) => (v ? <Link href={href} className="hover:underline">{v.toLocaleString()}</Link> : "");

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead>
          <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant/60">
            <th className="px-3 py-2.5 font-semibold">Mes fact.</th>
            {statuses.map((s) => <th key={s} className="px-3 py-2.5 text-right font-semibold">{STATUS_LABEL[s]}</th>)}
            <th className="px-3 py-2.5 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {!rows.length && <tr><td colSpan={statuses.length + 2} className="px-3 py-8 text-center text-sb-on-surface-variant/60">Sin unidades para estos filtros.</td></tr>}
          {rows.map((m) => (
            <Fragment key={m}>
              <tr className="border-t border-sb-outline-variant/40 bg-sb-surface-container-low font-semibold">
                <td className="px-3 py-2">{MONTHS[m - 1]}</td>
                {statuses.map((s) => <td key={s} className="px-3 py-2 text-right">{num(get(m, s, null), drill(site, year, { month: m, status: s }))}</td>)}
                <td className="px-3 py-2 text-right">{num(get(m, null, null), drill(site, year, { month: m }))}</td>
              </tr>
              {(["A TIEMPO", "FUERA DE TIEMPO"] as const).map((sv) => (
                <tr key={sv} className="text-sb-on-surface/80">
                  <td className="py-1.5 pl-6 pr-3 text-[11px]">{sv === "A TIEMPO" ? "A tiempo" : "Fuera de tiempo"}</td>
                  {statuses.map((s) => <td key={s} className="px-3 py-1.5 text-right">{num(get(m, s, sv), drill(site, year, { month: m, status: s, service: sv }))}</td>)}
                  <td className="px-3 py-1.5 text-right">{num(get(m, null, sv), drill(site, year, { month: m, service: sv }))}</td>
                </tr>
              ))}
            </Fragment>
          ))}
          {rows.length > 0 && (
            <tr className="border-t-2 border-sb-outline-variant/60 font-bold">
              <td className="px-3 py-2">Total</td>
              {statuses.map((s) => <td key={s} className="px-3 py-2 text-right">{(rows.reduce((t, m) => t + get(m, s, null), 0) || "").toLocaleString()}</td>)}
              <td className="px-3 py-2 text-right">{rows.reduce((t, m) => t + get(m, null, null), 0).toLocaleString()}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<Data | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [cl, setCl] = useState<string[] | null>(null); // null = por defecto (todos menos 3114, como la TABLA)
  const [months, setMonths] = useState<number[] | null>(null);

  useEffect(() => {
    const p = new URLSearchParams();
    if (year) p.set("year", String(year));
    if (cl) p.set("cl", cl.join(","));
    else p.set("cl", "default");
    let alive = true;
    // Sin CL elegido, el servidor usa el filtro de la TABLA del Excel: PCL sin CL 3114
    fetch(`/api/dashboard?${p}`).then((r) => r.json()).then((d: Data) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [year, cl]);

  const monthStats = useMemo(() => {
    if (!data) return [];
    return MONTHS.map((_, i) => {
      const m = i + 1;
      const s = (cells: Cell[]) => {
        const all = cells.filter((c) => c.m === m);
        const n = all.reduce((t, c) => t + c.n, 0);
        const a = all.filter((c) => c.service === "A TIEMPO").reduce((t, c) => t + c.n, 0);
        return { n, a, p: pct(a, n) };
      };
      const p = s(data.pcl), y = s(data.yur);
      const hsp = hspOf([p.a, p.n], [y.a, y.n]);
      return { m, p, y, hsp };
    }).filter((r) => r.p.n || r.y.n);
  }, [data]);

  const activeMonths = useMemo(() => monthStats.map((r) => r.m), [monthStats]);
  const shownMonths = months ?? activeMonths.slice(-2);

  if (!data) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando dashboard…</div>;

  const tot = (cells: Cell[], f?: (c: Cell) => boolean) => cells.filter((c) => !f || f(c)).reduce((t, c) => t + c.n, 0);
  const all = [...data.pcl, ...data.yur];
  const pclPct = pct(tot(data.pcl, (c) => c.service === "A TIEMPO"), tot(data.pcl));
  const yurPct = pct(tot(data.yur, (c) => c.service === "A TIEMPO"), tot(data.yur));
  const hspPct = hspOf(
    [tot(data.pcl, (c) => c.service === "A TIEMPO"), tot(data.pcl)],
    [tot(data.yur, (c) => c.service === "A TIEMPO"), tot(data.yur)],
  );

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Dashboard · Nivel de servicio HSP" sub="Igual que la hoja TABLA del HSP-OFICIAL. A tiempo = entregado (o aún en camino) hasta la fecha estimada.">
        <Select aria-label="Año" className="w-32" variant="secondary" value={String(data.year)} onChange={(v) => { setYear(Number(v)); setMonths(null); }}>
          <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
          <Select.Popover>
            <ListBox>
              {data.years.map((y) => <ListBox.Item key={y} id={String(y)} textValue={String(y)}>{y}<ListBox.ItemIndicator /></ListBox.Item>)}
            </ListBox>
          </Select.Popover>
        </Select>
      </PageTitle>

      <StatGrid
        className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
        items={[
          { label: `Unidades ${data.year}`, value: tot(all).toLocaleString(), icon: Ship },
          { label: "Entregadas", value: tot(all, (c) => c.status === "ENTREGADO").toLocaleString(), icon: CheckCircle2 },
          { label: "En proceso", value: tot(all, (c) => c.status !== "ENTREGADO").toLocaleString(), icon: Truck },
          { label: "PCL a tiempo", value: fmtPct(pclPct), icon: Clock },
          { label: "YUR a tiempo", value: fmtPct(yurPct), icon: Clock },
          { label: `HSP a tiempo · meta ${data.target}%`, value: fmtPct(hspPct), icon: hspPct !== null && hspPct >= data.target ? Target : Gauge },
        ]}
      />

      <Card className="sb-anim-item-in p-0">
        <details open className="group">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">
            Recorrido de una unidad <span className="text-[11px] font-normal text-sb-on-surface-variant">(clic para ocultar / mostrar)</span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-sb-outline-variant/40 px-4 py-3">
            <ProcessRoute site="PCL" showBefore />
            <ProcessRoute site="YUR" />
          </div>
        </details>
      </Card>

      <Card className="sb-anim-item-in overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sb-outline-variant/40 px-4 py-3">
          <h3 className="text-sm font-semibold">Nivel de servicio por mes de facturación</h3>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-sb-on-surface-variant">
            CL de PCL:
            {data.centers.map((c) => (
              <button key={c} className={`sbf-chip ${(cl ?? data.cl).includes(c) ? "active" : ""}`} onClick={() => setCl(toggle(cl ?? data.cl, c).sort())}>{c}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant/60">
                <th className="px-3 py-2.5 font-semibold">Mes</th>
                <th className="px-3 py-2.5 text-right font-semibold">PCL a tiempo</th>
                <th className="px-3 py-2.5 text-right font-semibold">PCL fuera</th>
                <th className="px-3 py-2.5 text-right font-semibold">YUR a tiempo</th>
                <th className="px-3 py-2.5 text-right font-semibold">YUR fuera</th>
                <th className="px-3 py-2.5 text-right font-semibold">HSP a tiempo</th>
                <th className="px-3 py-2.5 text-right font-semibold">HSP fuera</th>
                <th className="px-3 py-2.5 text-right font-semibold">Meta</th>
              </tr>
            </thead>
            <tbody>
              {monthStats.map(({ m, p, y, hsp }) => {
                const ok = hsp !== null && hsp >= data.target;
                return (
                  <tr key={m} className="border-b border-sb-outline-variant/25 last:border-0 hover:bg-sb-surface-container-low">
                    <td className="px-3 py-2 font-medium">{MONTHS[m - 1]}</td>
                    <td className="px-3 py-2 text-right">{p.n ? <Link className="hover:underline" href={drill("PCL", data.year, { month: m, service: "A TIEMPO" })}>{fmtPct(p.p)}</Link> : "—"}</td>
                    <td className="px-3 py-2 text-right text-sb-on-surface-variant">{p.n ? <Link className="hover:underline" href={drill("PCL", data.year, { month: m, service: "FUERA DE TIEMPO" })}>{fmtPct(100 - (p.p ?? 0))}</Link> : "—"}</td>
                    <td className="px-3 py-2 text-right">{y.n ? <Link className="hover:underline" href={drill("YUR", data.year, { month: m, service: "A TIEMPO" })}>{fmtPct(y.p)}</Link> : "—"}</td>
                    <td className="px-3 py-2 text-right text-sb-on-surface-variant">{y.n ? <Link className="hover:underline" href={drill("YUR", data.year, { month: m, service: "FUERA DE TIEMPO" })}>{fmtPct(100 - (y.p ?? 0))}</Link> : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={cn("inline-flex min-w-12 justify-end rounded-full px-2 py-0.5 font-semibold", ok ? "bg-sb-on-surface text-sb-surface" : "")}>{fmtPct(hsp)}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-sb-on-surface-variant">{hsp === null ? "—" : fmtPct(100 - hsp)}</td>
                    <td className="px-3 py-2 text-right text-sb-on-surface-variant">{data.target}%</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-sb-outline-variant/60 font-bold">
                <td className="px-3 py-2">Total general</td>
                <td className="px-3 py-2 text-right">{fmtPct(pclPct)}</td>
                <td className="px-3 py-2 text-right">{pclPct === null ? "—" : fmtPct(100 - pclPct)}</td>
                <td className="px-3 py-2 text-right">{fmtPct(yurPct)}</td>
                <td className="px-3 py-2 text-right">{yurPct === null ? "—" : fmtPct(100 - yurPct)}</td>
                <td className="px-3 py-2 text-right">{fmtPct(hspPct)}</td>
                <td className="px-3 py-2 text-right">{hspPct === null ? "—" : fmtPct(100 - hspPct)}</td>
                <td className="px-3 py-2 text-right">{data.target}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="border-t border-sb-outline-variant/40 px-4 py-2 text-[11px] text-sb-on-surface-variant/70">
          HSP = promedio de PCL y YUR. Resaltado = cumple la meta. Haz clic en un % para ver esas unidades.
        </p>
      </Card>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-sb-on-surface-variant">
        Meses en las tablas de estado:
        {activeMonths.map((m) => (
          <button key={m} className={`sbf-chip ${shownMonths.includes(m) ? "active" : ""}`} onClick={() => setMonths(toggle(shownMonths, m).sort((a, b) => a - b))}>
            {MONTHS[m - 1]}
          </button>
        ))}
        <button className="sbf-chip" onClick={() => setMonths(activeMonths)}>Todos</button>
      </div>

      <div className="grid gap-4 2xl:grid-cols-2">
        {(["PCL", "YUR"] as const).map((site) => (
          <Card key={site} className="sb-anim-table-in overflow-hidden">
            <div className="flex items-center justify-between border-b border-sb-outline-variant/40 px-4 py-3">
              <h3 className="text-sm font-semibold">{SITE_INFO[site].title} · unidades por estado</h3>
              <Link href={`/units/${site.toLowerCase()}`} className="text-[11px] underline underline-offset-2">Ver módulo</Link>
            </div>
            <StatusPivot site={site} year={data.year} cells={site === "PCL" ? data.pcl : data.yur} months={shownMonths} />
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(["PCL", "YUR"] as const).map((site) => {
          const list = data.reasons.filter((r) => r.site === site);
          const max = Math.max(1, ...list.map((r) => r.n));
          const sum = list.reduce((t, r) => t + r.n, 0);
          return (
            <Card key={site} className="sb-anim-item-in p-5">
              <h3 className="mb-1 text-sm font-semibold">{site} · motivos de demora</h3>
              <p className="mb-4 text-[11px] text-sb-on-surface-variant/70">Unidades fuera de tiempo en {data.year}: {sum.toLocaleString()}</p>
              {!list.length && <p className="text-xs text-sb-on-surface-variant/60">Sin unidades fuera de tiempo.</p>}
              <div className="flex flex-col gap-2.5">
                {list.map((r) => (
                  <Link key={r.reason ?? "none"} href={drill(site, data.year, { service: "FUERA DE TIEMPO", reason: r.reason ?? "__none" })} className="group block">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="group-hover:underline">{r.reason ?? "Sin motivo"}</span>
                      <span className="text-sb-on-surface-variant">{r.n.toLocaleString()} · {pct(r.n, sum)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-sb-surface-container-highest">
                      <div className="h-full rounded-full bg-sb-on-surface" style={{ width: `${(r.n / max) * 100}%` }} />
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
