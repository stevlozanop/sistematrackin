"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { AlertTriangle, Building2, CalendarClock, ChevronRight, Eye, LogIn, PenLine, Store, Truck, UserCheck, UserX, Users } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { StatGrid } from "@/components/StatCard";
import { LiveDot, pageLabel, roleLabel, useLive } from "@/components/dev/DevKit";
import { PlatformFigure, type PlatformLive } from "@/components/figures/platform/PlatformFigure";
import { cn } from "@/lib/cn";

type Company = { id: number; name: string; kind: "transport" | "client"; parent_id: number | null; accounts: number; active_7d: number; online: number; views_7d: number; last_seen: string | null };
type Overview = {
  live: PlatformLive & { minutes: number; api_30d: number; views_today: number; logins_30d: number; fails_30d: number };
  counts: Record<string, number>;
  roles: { role: string; n: number; online: number }[];
  companies: Company[];
  heat: { dow: number; h: number; n: number }[];
  screens: { path: string; n: number; people: number }[];
  people: { id: number; name: string; role: string; company: string | null; views: number; events: number; online: number }[];
};

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const ROLE_ORDER = ["admin", "operator", "viewer", "dealer"];

/** Número que sube o baja con suavidad hasta el valor real */
function Count({ value, digits = 0, suffix = "" }: { value: number; digits?: number; suffix?: string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${v.toLocaleString("es-PE", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`);
  useEffect(() => { const c = animate(mv, value, { duration: 0.9, ease: [0.32, 0.72, 0, 1] }); return () => c.stop(); }, [mv, value]);
  return <motion.span>{text}</motion.span>;
}

/** Barra horizontal que crece al aparecer */
function Meter({ value, max, delay = 0, tone = "bg-sb-primary" }: { value: number; max: number; delay?: number; tone?: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-sb-surface-container-high">
      <motion.div className={cn("h-full rounded-full", tone)} initial={{ width: 0 }} animate={{ width: `${max ? Math.max(value ? 2 : 0, (value / max) * 100) : 0}%` }} transition={{ duration: 0.8, delay, ease: [0.32, 0.72, 0, 1] }} />
    </div>
  );
}

/** Mapa de calor: pantallas abiertas por día y hora (un solo tono, de claro a oscuro). */
function Heat({ cells }: { cells: Overview["heat"] }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const grid = new Map(cells.map((c) => [`${c.dow}-${c.h}`, c.n]));
  const max = Math.max(1, ...cells.map((c) => c.n));
  const total = cells.reduce((t, c) => t + c.n, 0);
  const peak = cells.reduce<Overview["heat"][number] | null>((b, c) => (!b || c.n > b.n ? c : b), null);
  const at = hover ? grid.get(`${hover.d}-${hover.h}`) ?? 0 : null;
  return (
    <div>
      <p className="mb-3 h-4 text-[11px] text-sb-on-surface-variant">
        {hover ? <><b className="text-sb-on-surface">{at!.toLocaleString()}</b> pantallas · {DAYS[hover.d - 1]} de {String(hover.h).padStart(2, "0")}:00 a {String((hover.h + 1) % 24).padStart(2, "0")}:00</>
          : peak && total ? <>{total.toLocaleString()} pantallas en 4 semanas · hora pico: <b className="text-sb-on-surface">{DAYS[peak.dow - 1]} {String(peak.h).padStart(2, "0")}:00</b></> : "Todavía sin visitas registradas."}
      </p>
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: "28px repeat(24, minmax(0, 1fr))" }} onMouseLeave={() => setHover(null)}>
        {DAYS.map((day, di) => (
          <div key={day} className="contents">
            <span className="self-center text-[10px] text-sb-on-surface-variant">{day}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const n = grid.get(`${di + 1}-${h}`) ?? 0;
              return (
                <motion.div key={h} onMouseEnter={() => setHover({ d: di + 1, h })}
                  initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: (di * 24 + h) * 0.002, duration: 0.3 }}
                  className={cn("aspect-square rounded-[3px] ring-sb-on-surface transition-shadow", hover?.d === di + 1 && hover.h === h && "ring-1")}
                  style={{ background: n ? `color-mix(in oklab, var(--sb-primary) ${Math.round(18 + (n / max) * 82)}%, var(--sb-surface-container))` : "var(--sb-surface-container)" }} />
              );
            })}
          </div>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center text-[9px] text-sb-on-surface-variant">{h % 6 === 0 ? String(h).padStart(2, "0") : ""}</span>)}
      </div>
    </div>
  );
}

/** Consola The Iceberg Labs · Dashboard general: toda la plataforma en una pantalla, con datos reales y en vivo. */
export default function DevDashboard() {
  const { data: d, at } = useLive<Overview>("/api/dev/overview", 5000);
  if (!d) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando la plataforma…</div>;
  const c = d.counts, L = d.live;
  const roots = d.companies.filter((x) => !x.parent_id);
  const kids = (id: number) => d.companies.filter((x) => x.parent_id === id);
  const maxCo = Math.max(1, ...d.companies.map((x) => x.views_7d));
  const maxScreen = Math.max(1, ...d.screens.map((s) => s.n));
  const roleMax = Math.max(1, ...d.roles.map((r) => r.n));

  const CompanyRow = ({ co, i, child = false }: { co: Company; i: number; child?: boolean }) => (
    <Link href={`/dev/users?q=${encodeURIComponent(co.name)}`} className={cn("group block border-b border-sb-outline-variant/20 py-2.5 last:border-0", child && "pl-6")}>
      <div className="mb-1.5 flex items-center gap-2 text-xs">
        <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md", co.kind === "transport" ? "bg-sb-primary text-sb-on-primary" : "bg-sb-surface-container-high")}>
          {co.kind === "transport" ? <Truck className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium group-hover:underline">{co.name}</span>
        {co.online > 0 && <span className="flex items-center gap-1 text-[10px] text-sb-primary"><span className="h-1.5 w-1.5 rounded-full bg-sb-primary" />{co.online} en línea</span>}
        <span className="shrink-0 text-[11px] text-sb-on-surface-variant">{co.active_7d}/{co.accounts} activas · {co.views_7d.toLocaleString()} pantallas</span>
        <ChevronRight className="h-3 w-3 text-sb-on-surface-variant/50 transition-transform group-hover:translate-x-0.5" />
      </div>
      <Meter value={co.views_7d} max={maxCo} delay={0.05 * i} />
    </Link>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Dashboard general" sub="Toda la plataforma en una pantalla: datos reales de la base, en tiempo real. Sin contar a The Iceberg Labs.">
        <LiveDot at={at} />
      </PageTitle>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <PlatformFigure data={{ ...L, accounts: c.accounts }} />
        </motion.div>
        <Card className="flex flex-col justify-between gap-4 p-5">
          <div>
            <h3 className="text-sm font-semibold">Pulso ahora</h3>
            <p className="text-[11px] text-sb-on-surface-variant">Lo mismo que muestra la figura, en números.</p>
          </div>
          {[
            { label: "Personas conectadas", value: <Count value={L.online} />, sub: `de ${c.accounts} cuentas · ${c.active_7d} activas en 7 días`, href: "/dev/users", m: [L.online, Math.max(1, c.accounts)] },
            { label: "Llamadas a la API por minuto", value: <Count value={L.api_per_min} digits={1} />, sub: `${L.api_hour.toLocaleString()} en esta hora · ${L.api_30d.toLocaleString()} en 30 días`, href: "/dev/live", m: null },
            { label: "Conexiones a la base", value: <Count value={L.conns} />, sub: `de ${L.max_conns} permitidas`, href: "/dev/usage", m: [L.conns, Math.max(1, L.max_conns)] },
            { label: "Espacio de la base", value: <Count value={L.db_mb} digits={1} suffix=" MB" />, sub: `de ${L.limit_mb} MB del plan`, href: "/dev/usage", m: [L.db_mb, L.limit_mb] },
            { label: "Aciertos de caché", value: L.cache_hit === null ? "—" : <Count value={L.cache_hit} digits={1} suffix="%" />, sub: "lecturas servidas desde memoria", href: "/dev/usage", m: null },
          ].map((r, i) => (
            <Link key={r.label} href={r.href} className="group">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-sb-on-surface-variant group-hover:text-sb-on-surface">{r.label}</span>
                <b className="text-lg font-bold tracking-tight">{r.value}</b>
              </div>
              <p className="mb-1 text-[10px] text-sb-on-surface-variant/80">{r.sub}</p>
              {r.m && <Meter value={r.m[0]} max={r.m[1]} delay={0.1 + i * 0.06} />}
            </Link>
          ))}
        </Card>
      </div>

      <StatGrid
        className="grid-cols-2 md:grid-cols-4"
        items={[
          { label: "Empresas · consorcios", value: `${c.transport} · ${c.consortia}`, icon: Building2 },
          { label: "Cuentas activas 7 días", value: `${c.active_7d} de ${c.accounts}`, icon: UserCheck },
          { label: "Nunca ingresaron", value: c.never, icon: UserX },
          { label: "Ingresos 30 días", value: <>{L.logins_30d}{L.fails_30d ? <span className="ml-1.5 text-sm font-semibold text-sb-late">· {L.fails_30d} fallidos</span> : null}</>, icon: L.fails_30d ? AlertTriangle : LogIn },
          { label: "Unidades (PCL · YUR)", value: `${c.units.toLocaleString()} (${c.pcl.toLocaleString()} · ${c.yur.toLocaleString()})`, icon: Truck },
          { label: "Dealers con cuenta", value: `${c.dealers_with_account} de ${c.dealers}`, icon: Store },
          { label: "Fechas registradas", value: <>{c.events.toLocaleString()} <span className="text-sm font-semibold text-sb-on-surface-variant">· {c.events_today} hoy</span></>, icon: PenLine },
          { label: "Pantallas abiertas hoy", value: L.views_today.toLocaleString(), icon: Eye },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Empresas y consorcios · uso de 7 días</h3>
            <Link href="/companies" className="text-[11px] text-sb-on-surface-variant hover:underline">Administrar</Link>
          </div>
          {roots.length ? roots.map((r, i) => (
            <div key={r.id}>
              <CompanyRow co={r} i={i} />
              {kids(r.id).map((k2, j) => <CompanyRow key={k2.id} co={k2} i={i + j + 1} child />)}
            </div>
          )) : <p className="py-6 text-center text-xs text-sb-on-surface-variant">Todavía no hay empresas registradas.</p>}
        </Card>
        <Card className="p-5">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-3.5 w-3.5" /> Cuándo usan el sistema</h3>
          <Heat cells={d.heat} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Pantallas más usadas · 7 días</h3>
          {d.screens.length ? d.screens.map((s, i) => (
            <div key={s.path} className="mb-2.5">
              <div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate">{pageLabel(s.path)}</span><span className="shrink-0 text-sb-on-surface-variant"><b className="text-sb-on-surface">{s.n.toLocaleString()}</b> · {s.people} {s.people === 1 ? "persona" : "personas"}</span></div>
              <Meter value={s.n} max={maxScreen} delay={0.05 * i} />
            </div>
          )) : <p className="py-6 text-center text-xs text-sb-on-surface-variant">Sin visitas en los últimos 7 días.</p>}
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Personas más activas · 7 días</h3>
          {d.people.length ? d.people.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
              <Link href={`/dev/activity?user=${p.id}`} className="flex items-center gap-2.5 border-b border-sb-outline-variant/20 py-2 text-xs last:border-0 hover:bg-sb-surface-container-low">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sb-surface-container-high text-[10px] font-bold">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <b className="flex items-center gap-1.5 truncate font-semibold">{p.name}{p.online ? <span className="h-1.5 w-1.5 rounded-full bg-sb-primary" /> : null}</b>
                  <span className="block truncate text-[11px] text-sb-on-surface-variant">{roleLabel(p.role)}{p.company ? ` · ${p.company}` : ""}</span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-sb-on-surface-variant"><b className="text-sb-on-surface">{p.views.toLocaleString()}</b> pantallas<br />{p.events.toLocaleString()} fechas</span>
              </Link>
            </motion.div>
          )) : <p className="py-6 text-center text-xs text-sb-on-surface-variant">Sin actividad todavía.</p>}
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users className="h-3.5 w-3.5" /> Cuentas por tipo</h3>
          {[...d.roles].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)).map((r, i) => (
            <div key={r.role} className="mb-2.5">
              <div className="mb-1 flex justify-between text-xs"><span>{roleLabel(r.role)}</span><span className="text-sb-on-surface-variant"><b className="text-sb-on-surface">{r.n}</b>{r.online ? ` · ${r.online} en línea` : ""}</span></div>
              <Meter value={r.n} max={roleMax} delay={0.05 * i} />
            </div>
          ))}
          <p className="mt-3 text-[11px] text-sb-on-surface-variant">{c.imports.toLocaleString()} Excel subidos en total · {L.api_30d.toLocaleString()} llamadas a la API en 30 días.</p>
        </Card>
      </div>
    </div>
  );
}
