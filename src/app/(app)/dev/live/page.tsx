"use client";
import { useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, BarChart3, Database, LogIn, MousePointerClick, PenLine, Server, Users } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { Bars, Feed, LiveDot, pageLabel, roleLabel, useFresh, useLive, type FeedRow } from "@/components/dev/DevKit";
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
  if (!d) return <div className="flex flex-col gap-3 lg:h-[calc(100dvh-5rem)]">{[0, 1, 2].map((i) => <div key={i} className={cn("animate-pulse rounded-3xl bg-sb-surface-container-low", i === 2 ? "min-h-64 flex-1" : i ? "h-60" : "h-24")} />)}</div>;
  const k = d.kpis;
  const label = METRICS.find((m) => m.key === metric)!.label;
  const total = d.hours.reduce((t, h) => t + h[metric], 0);
  const peak = d.hours.reduce((m, h) => (h[metric] > m[metric] ? h : m), d.hours[0]);
  const activePct = k.accounts ? Math.round((k.active_today / k.accounts) * 100) : 0;
  const tiles: { label: string; value: React.ReactNode; icon: typeof Activity; extra?: React.ReactNode; tone?: "live" | "late" }[] = [
    { label: "Conectados ahora", value: k.online, icon: Activity, tone: k.online ? "live" : undefined, extra: k.online ? "en este momento" : "nadie ahora" },
    { label: "Activos hoy", value: <>{k.active_today}<span className="text-sm font-normal text-sb-on-surface-variant"> / {k.accounts}</span></>, icon: Users,
      extra: <span className="mt-1.5 flex h-1 overflow-hidden rounded-full bg-sb-surface-container"><span className="bg-sb-primary" style={{ width: `${activePct}%` }} /></span> },
    { label: "Activos 7 días", value: k.active_7d, icon: Users, extra: "cuentas distintas" },
    { label: "Pantallas hoy", value: k.views_today.toLocaleString("es-PE"), icon: MousePointerClick, extra: `${k.events_today.toLocaleString("es-PE")} fechas registradas` },
    { label: "API hoy", value: k.api_today.toLocaleString("es-PE"), icon: Server, extra: `${k.imports_today} Excel subidos` },
    { label: "Ingresos hoy", value: k.logins_today, icon: k.fails_today ? AlertTriangle : LogIn, tone: k.fails_today ? "late" : undefined,
      extra: k.fails_today ? <span className="font-semibold text-sb-late">{k.fails_today} fallidos</span> : "sin fallos" },
    { label: "Base de datos", value: <>{k.db_mb}<span className="text-sm font-normal text-sb-on-surface-variant"> MB</span></>, icon: Database, extra: "tamaño total" },
  ];

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-5rem)]">
      {/* Encabezado compacto */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="mr-auto min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">En vivo</h1>
          <p className="text-[11px] text-sb-on-surface-variant">Lo que pasa ahora en la plataforma · datos reales · cada 5 segundos{withDev ? "" : " · sin contar a The Iceberg Labs"}</p>
        </div>
        <label className="flex items-center gap-2 rounded-full bg-sb-surface-container-low px-3 py-1 text-[11px] text-sb-on-surface-variant">
          <Checkbox checked={withDev} onChange={setWithDev} label="Incluir a The Iceberg Labs" /> Incluir The Iceberg Labs
        </label>
        <LiveDot at={at} />
      </div>

      {/* Indicadores en una franja */}
      <Card className="grid grid-cols-2 divide-sb-outline-variant/40 sm:grid-cols-4 xl:grid-cols-7 xl:divide-x">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0 px-4 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">
              {t.tone === "live"
                ? <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sb-primary opacity-60" /><span className="relative h-2 w-2 rounded-full bg-sb-primary" /></span>
                : <t.icon className={cn("h-3 w-3", t.tone === "late" && "text-sb-late")} />}
              <span className="truncate">{t.label}</span>
            </p>
            <p className="mt-1 text-2xl font-semibold leading-none tabular-nums">{t.value}</p>
            <div className="mt-1 truncate text-[10px] text-sb-on-surface-variant">{t.extra}</div>
          </div>
        ))}
      </Card>

      {/* Gráfico */}
      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sb-primary-soft text-sb-primary"><BarChart3 className="h-[18px] w-[18px]" /></span>
          <div className="mr-auto min-w-0">
            <h3 className="text-sm font-semibold">{label} · últimas 24 horas</h3>
            <p className="text-[11px] text-sb-on-surface-variant">
              <b className="text-sb-on-surface tabular-nums">{total.toLocaleString("es-PE")}</b> en total{peak && peak[metric] ? <> · hora pico <b className="text-sb-on-surface">{peak.h.slice(11, 16)}</b> con {peak[metric].toLocaleString("es-PE")}</> : null} · hora de Perú
            </p>
          </div>
          <div className="flex max-w-full overflow-x-auto rounded-full bg-sb-surface-container p-0.5">
            {METRICS.map((m) => (
              <button key={m.key} type="button" onClick={() => setMetric(m.key)} aria-pressed={metric === m.key}
                className={cn("sb-pill whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold", metric === m.key ? "bg-sb-surface text-sb-on-surface shadow-sm" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>{m.label}</button>
            ))}
          </div>
        </div>
        <Bars height={120}
          data={d.hours.map((h) => ({ label: h.h, value: h[metric], title: `${h.h.slice(11, 16)} a ${String((Number(h.h.slice(11, 13)) + 1) % 24).padStart(2, "0")}:00` }))}
          tick={(l, i) => (i % 3 === 0 || i === 23 ? l.slice(11, 16) : null)}
        />
      </Card>

      {/* Personas y actividad, cada una con su propio scroll */}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_1.5fr]">
        <Card className="flex min-h-[16rem] flex-col overflow-hidden lg:min-h-0">
          <div className="flex items-center gap-3 border-b border-sb-outline-variant/40 px-4 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sb-primary-soft text-sb-primary"><Users className="h-[18px] w-[18px]" /></span>
            <div className="mr-auto"><h3 className="text-sm font-semibold">Conectados ahora</h3><p className="text-[11px] text-sb-on-surface-variant">{d.online.length ? `${d.online.length} ${d.online.length === 1 ? "persona" : "personas"} en línea` : "Nadie en línea"}</p></div>
            <Link href="/dev/users" className="sb-pill rounded-full px-3 py-1 text-[11px] font-semibold text-sb-on-surface-variant hover:bg-sb-surface-container hover:text-sb-on-surface">Todos los usuarios</Link>
          </div>
          <div className="scroll-hidden min-h-0 flex-1 overflow-y-auto p-2">
            {d.online.length ? d.online.map((u) => (
              <Link key={u.id} href={`/dev/activity?user=${u.id}`} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-xs transition-colors hover:bg-sb-surface-container-low">
                <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sb-surface-container text-[10px] font-bold">
                  {u.name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sb-surface bg-sb-primary" />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-semibold">{u.name}</b>
                  <span className="block truncate text-[11px] text-sb-on-surface-variant">{roleLabel(u.role)}{u.company ? ` · ${u.company}` : ""} · en {pageLabel(u.path)}</span>
                </span>
                <span className="shrink-0 text-right text-[10px] leading-tight text-sb-on-surface-variant">{u.since ? <>desde {u.since}<br /></> : null}visto {u.last_seen}</span>
              </Link>
            )) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center text-xs text-sb-on-surface-variant">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-sb-surface-container"><Users className="h-5 w-5 opacity-60" /></span>
                Nadie conectado en este momento.<span className="text-[11px] opacity-70">Aparecen aquí apenas alguien abre el sistema.</span>
              </div>
            )}
          </div>
        </Card>
        <Card className="flex min-h-[20rem] flex-col overflow-hidden lg:min-h-0">
          <div className="flex items-center gap-3 border-b border-sb-outline-variant/40 px-4 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sb-primary-soft text-sb-primary"><PenLine className="h-[18px] w-[18px]" /></span>
            <div className="mr-auto"><h3 className="text-sm font-semibold">Últimas interacciones</h3><p className="text-[11px] text-sb-on-surface-variant">Lo último que hizo cada persona, al instante</p></div>
            <Link href="/dev/activity" className="sb-pill rounded-full px-3 py-1 text-[11px] font-semibold text-sb-on-surface-variant hover:bg-sb-surface-container hover:text-sb-on-surface">Ver todas</Link>
          </div>
          <div className="scroll-hidden min-h-0 flex-1 overflow-y-auto px-4 py-2">
            <Feed rows={d.recent} compact fresh={fresh} />
          </div>
        </Card>
      </div>
    </div>
  );
}
