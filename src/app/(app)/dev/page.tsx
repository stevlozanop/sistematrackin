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

/** Mapa de calor: pantallas abiertas por día y hora (un solo tono, de claro a oscuro). Se toca o se pasa el mouse
 *  para ver el detalle. En PC, la cuadrícula completa con el total de cada día; en el celular, se elige el día y se ven
 *  sus 24 horas en barras grandes, con las franjas del día (madrugada, mañana, tarde y noche). */
const hh = (h: number) => String(h).padStart(2, "0");
const BANDS = [["Madrugada", 0], ["Mañana", 6], ["Tarde", 12], ["Noche", 18]] as const;
function Heat({ cells }: { cells: Overview["heat"] }) {
  const grid = new Map(cells.map((c) => [`${c.dow}-${c.h}`, c.n]));
  const get = (d: number, h: number) => grid.get(`${d}-${h}`) ?? 0;
  const max = Math.max(1, ...cells.map((c) => c.n));
  const total = cells.reduce((t, c) => t + c.n, 0);
  const peak = cells.reduce<Overview["heat"][number] | null>((b, c) => (!b || c.n > b.n ? c : b), null);
  const dayTotal = DAYS.map((_, i) => Array.from({ length: 24 }, (_, h) => get(i + 1, h)).reduce((a, b) => a + b, 0));
  const dayMax = Math.max(1, ...dayTotal);
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const [pin, setPin] = useState<{ d: number; h: number } | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const cur = hover ?? pin;
  const dSel = day ?? cur?.d ?? peak?.dow ?? 1;
  const tone = (n: number) => n ? `color-mix(in oklab, var(--sb-primary) ${Math.round(18 + (n / max) * 82)}%, var(--sb-surface-container))` : "var(--sb-surface-container)";
  const pick = (d: number, h: number) => setPin(pin?.d === d && pin.h === h ? null : { d, h });
  const hourMax = Math.max(1, ...Array.from({ length: 24 }, (_, h) => get(dSel, h)));
  const curDay = cur && cur.d === dSel ? cur : null;

  return (
    <div>
      <p className="mb-3 min-h-4 text-[11px] text-sb-on-surface-variant">
        {cur ? <><b className="text-sb-on-surface">{get(cur.d, cur.h).toLocaleString()}</b> pantallas · {DAYS[cur.d - 1]} de {hh(cur.h)}:00 a {hh((cur.h + 1) % 24)}:00</>
          : peak && total ? <>{total.toLocaleString()} pantallas en 4 semanas · hora pico: <b className="text-sb-on-surface">{DAYS[peak.dow - 1]} {hh(peak.h)}:00</b></> : "Todavía sin visitas registradas."}
      </p>

      {/* PC y tablet: cuadrícula completa; se toca una celda para fijarla y a la derecha va el total de cada día */}
      <div className="hidden sm:block">
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: "28px repeat(24, minmax(0, 1fr)) 44px" }} onMouseLeave={() => setHover(null)}>
          {DAYS.map((d, di) => (
            <div key={d} className="contents">
              <span className="self-center text-[10px] text-sb-on-surface-variant">{d}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const on = cur?.d === di + 1 && cur.h === h;
                return (
                  <motion.button key={h} type="button" aria-label={`${d} ${hh(h)}:00 · ${get(di + 1, h)} pantallas`}
                    onMouseEnter={() => setHover({ d: di + 1, h })} onClick={() => pick(di + 1, h)}
                    initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: on ? 1.18 : 1 }} transition={{ delay: hover ? 0 : (di * 24 + h) * 0.002, duration: 0.25 }}
                    className={cn("aspect-square cursor-pointer rounded-[3px] ring-sb-on-surface", on && "z-[1] ring-2", pin?.d === di + 1 && pin.h === h && "ring-2")}
                    style={{ background: tone(get(di + 1, h)) }} />
                );
              })}
              <span className="flex items-center gap-1 pl-1 text-[10px] tabular-nums text-sb-on-surface-variant">
                <i className="h-1 rounded-full bg-sb-primary" style={{ width: `${Math.max(2, (dayTotal[di] / dayMax) * 18)}px` }} />{dayTotal[di]}
              </span>
            </div>
          ))}
          <span />
          {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center text-[9px] text-sb-on-surface-variant">{h % 6 === 0 ? hh(h) : ""}</span>)}
          <span />
        </div>
      </div>

      {/* Celular: se elige el día y se ven sus 24 horas en barras que se pueden tocar */}
      <div className="sm:hidden">
        <div className="grid grid-cols-7 gap-1 pb-2">
          {DAYS.map((d, di) => {
            const on = dSel === di + 1;
            return (
              <button key={d} type="button" aria-pressed={on} onClick={() => { setDay(di + 1); setPin(null); }}
                className={cn("sb-pill flex min-w-0 flex-col items-center rounded-xl border px-0.5 py-1.5 transition-colors min-[400px]:rounded-2xl",
                  on ? "border-sb-primary bg-sb-primary-soft text-sb-on-surface" : "border-sb-outline-variant/60 text-sb-on-surface-variant")}>
                <span className="text-[11px] font-semibold">{d}</span>
                <b className="text-[13px] tabular-nums text-sb-on-surface min-[400px]:text-sm">{dayTotal[di]}</b>
                <i className="mt-0.5 h-1 w-4/5 max-w-6 overflow-hidden rounded-full bg-sb-surface-container-high">
                  <i className="block h-full rounded-full bg-sb-primary" style={{ width: `${(dayTotal[di] / dayMax) * 100}%` }} />
                </i>
              </button>
            );
          })}
        </div>
        <div className="flex h-28 items-end gap-[2px] rounded-2xl bg-sb-surface-container-low px-2 pt-2">
          {Array.from({ length: 24 }, (_, h) => {
            const n = get(dSel, h), on = curDay?.h === h;
            return (
              <button key={h} type="button" aria-label={`${hh(h)}:00 · ${n} pantallas`} onClick={() => pick(dSel, h)}
                className={cn("flex h-full min-w-0 flex-1 items-end rounded-md", on && "bg-sb-surface-container-high")}>
                <motion.span className={cn("block w-full rounded-t-[4px]", on && "outline-2 outline-offset-1 outline-sb-on-surface")}
                  initial={{ height: 0 }} animate={{ height: `${n ? Math.max(8, (n / hourMax) * 100) : 4}%` }} transition={{ duration: 0.45, delay: h * 0.012, ease: [0.32, 0.72, 0, 1] }}
                  style={{ background: tone(n) }} />
              </button>
            );
          })}
        </div>
        <div className="flex px-2 pt-1 text-[9px] text-sb-on-surface-variant">
          {Array.from({ length: 24 }, (_, h) => <span key={h} className="flex-1 text-center">{h % 6 === 0 ? hh(h) : ""}</span>)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5 min-[360px]:grid-cols-4">
          {BANDS.map(([label, from]) => {
            const n = Array.from({ length: 6 }, (_, k) => get(dSel, from + k)).reduce((a, b) => a + b, 0);
            const best = dayTotal[dSel - 1] ? Math.max(...BANDS.map(([, f]) => Array.from({ length: 6 }, (_, k) => get(dSel, f + k)).reduce((a, b) => a + b, 0))) === n && n > 0 : false;
            return (
              <div key={label} className={cn("rounded-xl px-2 py-1.5 text-center", best ? "bg-sb-primary-soft" : "bg-sb-surface-container-low")}>
                <b className="block text-sm tabular-nums">{n}</b>
                <span className="block text-[10px] leading-tight text-sb-on-surface-variant">{label}<br />{hh(from)}–{hh(from + 6)}</span>
              </div>
            );
          })}
        </div>
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
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md", co.kind === "transport" ? "bg-sb-primary text-sb-on-primary" : "bg-sb-surface-container-high")}>
          {co.kind === "transport" ? <Truck className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium group-hover:underline">{co.name}</span>
        {co.online > 0 && <span className="flex items-center gap-1 text-[10px] text-sb-primary"><span className="h-1.5 w-1.5 rounded-full bg-sb-primary" />{co.online} en línea</span>}
        <span className="order-last basis-full pl-8 text-[11px] text-sb-on-surface-variant sm:order-none sm:basis-auto sm:shrink-0 sm:pl-0">{co.active_7d}/{co.accounts} activas · {co.views_7d.toLocaleString()} pantallas</span>
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

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr] [&>*]:min-w-0">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <PlatformFigure data={{ ...L, accounts: c.accounts }} />
        </motion.div>
        <Card className="flex flex-col justify-between gap-4 p-4 sm:p-5">
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

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          <div className="mb-2 flex items-start justify-between gap-2">
            <h3 className="min-w-0 text-sm font-semibold">Empresas y consorcios · uso de 7 días</h3>
            <Link href="/companies" className="shrink-0 pt-0.5 text-[11px] text-sb-on-surface-variant hover:underline">Administrar</Link>
          </div>
          {roots.length ? roots.map((r, i) => (
            <div key={r.id}>
              <CompanyRow co={r} i={i} />
              {kids(r.id).map((k2, j) => <CompanyRow key={k2.id} co={k2} i={i + j + 1} child />)}
            </div>
          )) : <p className="py-6 text-center text-xs text-sb-on-surface-variant">Todavía no hay empresas registradas.</p>}
        </Card>
        <Card className="p-4 sm:p-5">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-3.5 w-3.5" /> Cuándo usan el sistema</h3>
          <Heat cells={d.heat} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold">Pantallas más usadas · 7 días</h3>
          {d.screens.length ? d.screens.map((s, i) => (
            <div key={s.path} className="mb-2.5">
              <div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate">{pageLabel(s.path)}</span><span className="shrink-0 text-sb-on-surface-variant"><b className="text-sb-on-surface">{s.n.toLocaleString()}</b> · {s.people} {s.people === 1 ? "persona" : "personas"}</span></div>
              <Meter value={s.n} max={maxScreen} delay={0.05 * i} />
            </div>
          )) : <p className="py-6 text-center text-xs text-sb-on-surface-variant">Sin visitas en los últimos 7 días.</p>}
        </Card>
        <Card className="p-4 sm:p-5">
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
        <Card className="p-4 sm:p-5">
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
