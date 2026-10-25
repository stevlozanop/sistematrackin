"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, FileQuestion } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { StatGrid } from "@/components/StatCard";
import { cn } from "@/lib/cn";
import { SITES, SITE_INFO, STATUS_LABEL, daysText, fmtDate, type DateField, type Site, type Status } from "@/lib/hsp";
import { AREAS, stageLabel } from "@/lib/workflow";

type Alerts = {
  total: number; noReason: number; alertDays: number;
  bySite: { site: Site; alert: string; n: number }[];
  byStage: { site: Site; next_step: DateField; alert: string; n: number }[];
  units: {
    id: number; site: Site; chassis: string; material: string | null; dealer: string | null; status: Status;
    next_step: DateField; est_date: string; days_left: number; alert: string; delay_reason: string | null; carrier: string | null;
  }[];
};

/** Área responsable de una etapa (quién debería registrarla). */
const areaFor = (site: Site, field: DateField) => AREAS.find((a) => a.site === site && a.fields.includes(field))?.label ?? "—";
const unitLink = (site: Site, p: Record<string, string>) => `/units/${site.toLowerCase()}?${new URLSearchParams(p)}`;

export default function AlertsPage() {
  const [data, setData] = useState<Alerts | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/alerts?list=1").then((r) => r.json()).then((d) => alive && setData(d));
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!data) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando alertas…</div>;

  const count = (alert: string, site?: Site) => data.bySite.filter((r) => r.alert === alert && (!site || r.site === site)).reduce((t, r) => t + Number(r.n), 0);
  const stages = SITES.flatMap((site) => SITE_INFO[site].dates.map((d) => {
    const n = (alert: string) => Number(data.byStage.find((r) => r.site === site && r.next_step === d.key && r.alert === alert)?.n ?? 0);
    return { site, field: d.key, overdue: n("VENCIDA"), soon: n("POR VENCER") };
  })).filter((r) => r.overdue || r.soon).sort((a, b) => b.overdue - a.overdue || b.soon - a.soon);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title="Alertas"
        sub={`Unidades sin entregar. Vencida = ya pasó su fecha estimada. Por vencer = faltan ${data.alertDays} días o menos (se cambia en Plazos y meta). Se actualiza cada 30 s.`}
      />

      <StatGrid
        className="grid-cols-1 sm:grid-cols-3"
        items={[
          { label: "Vencidas", value: count("VENCIDA").toLocaleString(), icon: AlertTriangle },
          { label: `Por vencer (≤ ${data.alertDays} días)`, value: count("POR VENCER").toLocaleString(), icon: Clock },
          { label: "Fuera de tiempo sin motivo", value: data.noReason.toLocaleString(), icon: FileQuestion },
        ]}
      />

      {data.noReason > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
          <span><b>{data.noReason}</b> unidades están fuera de tiempo y no tienen motivo de demora.</span>
          <span className="flex gap-2">
            {SITES.map((s) => <Link key={s} href={unitLink(s, { alert: "SIN_MOTIVO" })} className="sbf-chip">Ver en {s}</Link>)}
          </span>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        {/* Dónde están las demoras */}
        <Card className="overflow-hidden">
          <h3 className="border-b border-sb-outline-variant/40 px-4 py-3 text-sm font-semibold">¿En qué etapa están detenidas?</h3>
          {!stages.length && <p className="px-4 py-8 text-center text-xs text-sb-on-surface-variant/60">Sin alertas. Todo va a tiempo.</p>}
          <ul className="divide-y divide-sb-outline-variant/25">
            {stages.map((r) => (
              <li key={`${r.site}${r.field}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold">{r.site} · esperan {stageLabel(r.site, r.field)}</div>
                  <div className="text-[11px] text-muted">Responsable: {areaFor(r.site, r.field)}</div>
                </div>
                <div className="flex gap-1.5">
                  {r.overdue > 0 && <Link href={unitLink(r.site, { pending: r.field, alert: "VENCIDA" })} className="rounded-full bg-sb-late px-2.5 py-1 font-semibold text-white">{r.overdue} vencidas</Link>}
                  {r.soon > 0 && <Link href={unitLink(r.site, { pending: r.field, alert: "POR VENCER" })} className="rounded-full bg-sb-late-soft px-2.5 py-1 font-semibold">{r.soon} por vencer</Link>}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {/* Más urgentes */}
        <Card className="overflow-hidden">
          <h3 className="border-b border-sb-outline-variant/40 px-4 py-3 text-sm font-semibold">Las más urgentes</h3>
          <ul className="scroll-hidden max-h-[640px] divide-y divide-sb-outline-variant/25 overflow-y-auto">
            {data.units.map((u) => (
              <li key={u.id}>
                <Link href={unitLink(u.site, { q: u.chassis })} className="flex items-start gap-3 px-4 py-2.5 text-xs hover:bg-sb-surface-container-low">
                  <span className={cn("mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    u.alert === "VENCIDA" ? "bg-sb-late text-white" : "bg-sb-late-soft text-sb-on-surface")}>
                    {daysText(u.days_left)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono font-semibold">{u.chassis} <span className="font-sans font-normal text-muted">· {u.site}</span></div>
                    <div className="truncate text-[11px] text-muted">{u.dealer} · {STATUS_LABEL[u.status]} · espera {stageLabel(u.site, u.next_step)}</div>
                    <div className="text-[11px] text-muted">Estimada {fmtDate(u.est_date)}{u.delay_reason ? ` · Motivo: ${u.delay_reason}` : " · Sin motivo"}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
