"use client";
import { useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, Database, LogIn, MousePointerClick, PenLine, Server, Users } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { StatGrid } from "@/components/StatCard";
import { Bars, Chips, Feed, LiveDot, pageLabel, roleLabel, useFresh, useLive, type FeedRow } from "@/components/dev/DevKit";
import { Checkbox } from "@/components/ui";

type Live = {
  kpis: Record<string, number>;
  hours: { h: string; views: number; api: number; events: number; logins: number }[];
  online: { id: number; name: string; role: string; company: string | null; last_seen: string; path: string | null; since: string | null }[];
  recent: FeedRow[];
};

const METRICS = [
  { key: "api", label: "Llamadas a la API" },
  { key: "views", label: "Pantallas abiertas" },
  { key: "events", label: "Fechas registradas" },
  { key: "logins", label: "Ingresos" },
] as const;
type Metric = (typeof METRICS)[number]["key"];

/** Consola The Iceberg Labs · En vivo: lo que pasa ahora mismo en la plataforma, con datos reales. */
export default function DevLive() {
  const [withDev, setWithDev] = useState(false);
  const [metric, setMetric] = useState<Metric>("api");
  const { data: d, at } = useLive<Live>(`/api/dev/live${withDev ? "?dev=1" : ""}`, 5000);
  const fresh = useFresh(d?.recent);
  if (!d) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando la plataforma en vivo…</div>;
  const k = d.kpis;
  const label = METRICS.find((m) => m.key === metric)!.label;
  const total = d.hours.reduce((t, h) => t + h[metric], 0);

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="En vivo" sub={`Lo que pasa ahora en la plataforma, con datos reales de la base. Se actualiza cada 5 segundos${withDev ? "" : " · sin contar a The Iceberg Labs"}.`}>
        <label className="flex items-center gap-2 text-[11px] text-sb-on-surface-variant">
          <Checkbox checked={withDev} onChange={setWithDev} label="Incluir a The Iceberg Labs" /> Incluir The Iceberg Labs
        </label>
        <LiveDot at={at} />
      </PageTitle>

      <StatGrid
        className="grid-cols-2 md:grid-cols-4 xl:grid-cols-7"
        items={[
          { label: "Conectados ahora", value: k.online, icon: Activity },
          { label: "Activos hoy", value: `${k.active_today} de ${k.accounts}`, icon: Users },
          { label: "Activos 7 días", value: k.active_7d, icon: Users },
          { label: "Pantallas hoy", value: k.views_today.toLocaleString(), icon: MousePointerClick },
          { label: "API hoy", value: k.api_today.toLocaleString(), icon: Server },
          { label: "Ingresos hoy", value: <>{k.logins_today}{k.fails_today ? <span className="ml-1.5 text-sm font-semibold text-sb-late">· {k.fails_today} fallidos</span> : null}</>, icon: k.fails_today ? AlertTriangle : LogIn },
          { label: "Base de datos", value: `${k.db_mb} MB`, icon: Database },
        ]}
      />

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{label} · últimas 24 horas</h3>
            <p className="text-[11px] text-sb-on-surface-variant">{total.toLocaleString()} en total · hora por hora (hora de Perú) · fechas registradas hoy: {k.events_today.toLocaleString()} · Excel subidos hoy: {k.imports_today}</p>
          </div>
          <Chips value={metric} onChange={setMetric} options={METRICS.map((m) => ({ key: m.key, label: m.label }))} />
        </div>
        <Bars
          data={d.hours.map((h) => ({ label: h.h, value: h[metric], title: `${h.h.slice(11, 16)} a ${String((Number(h.h.slice(11, 13)) + 1) % 24).padStart(2, "0")}:00` }))}
          tick={(l, i) => (i % 3 === 0 || i === 23 ? l.slice(11, 16) : null)}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Conectados ahora · {d.online.length}</h3>
            <Link href="/dev/users" className="text-[11px] text-sb-on-surface-variant hover:underline">Todos los usuarios</Link>
          </div>
          {d.online.length ? d.online.map((u) => (
            <Link key={u.id} href={`/dev/activity?user=${u.id}`} className="flex items-center gap-2.5 border-b border-sb-outline-variant/20 py-2 text-xs last:border-0 hover:bg-sb-surface-container-low">
              <span className="relative flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sb-primary opacity-50" /><span className="relative h-2 w-2 rounded-full bg-sb-primary" /></span>
              <span className="min-w-0 flex-1">
                <b className="block truncate font-semibold">{u.name}</b>
                <span className="block truncate text-[11px] text-sb-on-surface-variant">{roleLabel(u.role)}{u.company ? ` · ${u.company}` : ""} · en {pageLabel(u.path)}</span>
              </span>
              <span className="shrink-0 text-right text-[10px] text-sb-on-surface-variant">{u.since ? `desde ${u.since}` : ""}<br />visto {u.last_seen}</span>
            </Link>
          )) : <p className="py-8 text-center text-xs text-sb-on-surface-variant">Nadie conectado en este momento.</p>}
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><PenLine className="h-3.5 w-3.5" /> Últimas interacciones</h3>
            <Link href="/dev/activity" className="text-[11px] text-sb-on-surface-variant hover:underline">Ver todas</Link>
          </div>
          <Feed rows={d.recent} compact fresh={fresh} />
        </Card>
      </div>
    </div>
  );
}
