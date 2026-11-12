"use client";
import { DATA_EVENT } from "@/components/UploadCenter";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SITES, SITE_INFO, STATUS_LABEL, fmtDate, type DateField, type Site, type Status } from "@/lib/hsp";
import { AREAS, ROLE_LABEL, areaOf, stageLabel, type Role } from "@/lib/workflow";

type LiveUser = {
  id: number; name: string; email: string; role: Role; online: boolean; last_seen: string | null; area: string | null; carrier: string | null;
  stages: { site: Site; field: DateField }[]; today: number; lastAction: string | null;
};
type LiveEvent = {
  id: number; at: string; field: string; old_value: string | null; new_value: string | null;
  site: Site; chassis: string; unit_id: number; status: Status; user_name: string | null; user_role: Role | null;
};
type Live = { now: string; pending: Record<string, number>; users: LiveUser[]; events: LiveEvent[] };

const time = (d: string | null) => (d ? d.slice(11, 16) : "—");
const val = (field: string, v: string | null) => (v ? (field.startsWith("d_") ? fmtDate(v) : v) : "vacío");

export default function LivePage() {
  const [data, setData] = useState<Live | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const lastId = useRef(0);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetch("/api/live").then((r) => (r.ok ? r.json() : null)).then((d: Live | null) => {
        if (!alive || !d) return;
        // Resalta los registros nuevos desde la última consulta
        const news = lastId.current ? d.events.filter((e) => e.id > lastId.current).map((e) => e.id) : [];
        lastId.current = Math.max(lastId.current, ...d.events.map((e) => e.id), 0);
        setFresh(new Set(news));
        setData(d);
      });
    tick();
    const t = setInterval(tick, 5000);
    window.addEventListener(DATA_EVENT, tick);
    return () => { alive = false; clearInterval(t); window.removeEventListener(DATA_EVENT, tick); };
  }, []);

  if (!data) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando seguimiento…</div>;

  // Encargados ordenados por área (en el orden del recorrido)
  const areaIdx = (u: LiveUser) => { const i = AREAS.findIndex((a) => a.id === u.area); return i < 0 ? 99 : i; };
  const operators = data.users.filter((u) => u.role === "operator").sort((a, b) => areaIdx(a) - areaIdx(b) || a.name.localeCompare(b.name));
  const owners = (site: Site, field: DateField) =>
    operators.filter((u) => u.stages.some((s) => s.site === site && s.field === field));

  const online = operators.filter((u) => u.online).length;
  const pendingAll = SITES.reduce((t, site) => t + SITE_INFO[site].dates.reduce((x, d) => x + (data.pending[`${site}|${d.key}`] ?? 0), 0), 0);
  const today = operators.reduce((t, u) => t + u.today, 0);
  const seen = (u: LiveUser) => (u.online ? "En línea" : u.last_seen ? `Visto ${u.last_seen.slice(0, 10) === data.now.slice(0, 10) ? time(u.last_seen) : fmtDate(u.last_seen.slice(0, 10))}` : "Nunca entró");
  const initials = (n: string) => n.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageTitle title="En vivo" sub="Quién está conectado, qué le falta a cada encargado y cada fecha que se registra. Se actualiza solo cada 5 segundos.">
        <span className="flex items-center gap-2 rounded-full bg-sb-surface-container-low px-3 py-1 text-[11px] text-sb-on-surface-variant">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sb-primary opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sb-primary" />
          </span>
          Actualizado {time(data.now)}:{data.now.slice(17, 19)}
        </span>
      </PageTitle>

      {/* Resumen */}
      <Card className="grid grid-cols-3 divide-x divide-sb-outline-variant/40">
        {([["En línea", <>{online}<span className="text-sm font-normal text-sb-on-surface-variant"> / {operators.length}</span></>, "encargados"], ["Pendientes", pendingAll.toLocaleString("es-PE"), "unidades por registrar"], ["Hoy", today.toLocaleString("es-PE"), "fechas registradas"]] as const).map(([l, v, d]) => (
          <div key={l} className="min-w-0 px-3 py-3 sm:px-4">
            <p className="truncate text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">{l}</p>
            <p className="mt-1 text-2xl font-semibold leading-none tabular-nums">{v}</p>
            <p className="mt-1 truncate text-[10px] text-sb-on-surface-variant">{d}</p>
          </div>
        ))}
      </Card>

      {/* Encargados */}
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {!operators.length && (
          <Card className="p-5 text-sm text-sb-on-surface-variant sm:col-span-2 xl:col-span-3">
            Aún no hay encargados. Créalos en <Link href="/admins" className="underline">Usuarios</Link> y asígnales sus etapas.
          </Card>
        )}
        {operators.map((u) => {
          const pend = u.stages.reduce((t, s) => t + (data.pending[`${s.site}|${s.field}`] ?? 0), 0);
          return (
            <Card key={u.id} className="flex min-w-0 flex-col gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sb-surface-container text-xs font-bold">
                  {initials(u.name)}
                  <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-sb-surface", u.online ? "bg-sb-primary" : "bg-sb-outline")} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">
                    {areaOf(u.area) && u.area !== "CUSTOM" ? areaOf(u.area)!.label : "Encargado"}{u.carrier ? ` · ${u.carrier}` : ""}
                  </p>
                  <p className="truncate text-sm font-semibold">{u.name}</p>
                  <p className={cn("truncate text-[11px]", u.online ? "font-medium text-sb-primary" : "text-sb-on-surface-variant")}>{seen(u)}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-sb-outline-variant/40 rounded-2xl bg-sb-surface-container-low py-2 text-center">
                {([[pend.toLocaleString("es-PE"), "pendientes", pend > 0], [u.today, "registró hoy", false], [time(u.lastAction), "última acción", false]] as const).map(([v, l, warn]) => (
                  <div key={l} className="min-w-0 px-1">
                    <p className={cn("text-lg font-semibold leading-tight tabular-nums", warn && "text-sb-late")}>{v}</p>
                    <p className="truncate text-[10px] text-sb-on-surface-variant">{l}</p>
                  </div>
                ))}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                {!u.stages.length && <span className="text-[11px] text-sb-on-surface-variant">Sin etapas asignadas</span>}
                {u.stages.map((s) => {
                  const n = data.pending[`${s.site}|${s.field}`] ?? 0;
                  return (
                    <Link key={`${s.site}${s.field}`} href={`/units/${s.site.toLowerCase()}?pending=${s.field}`}
                      className="flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-xs transition-colors hover:bg-sb-surface-container-low">
                      <span className="shrink-0 rounded-md bg-sb-surface-container px-1.5 py-0.5 text-[10px] font-semibold">{s.site}</span>
                      <span className="min-w-0 flex-1 truncate" title={stageLabel(s.site, s.field)}>{stageLabel(s.site, s.field)}</span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", n ? "bg-sb-late-soft text-sb-late" : "bg-sb-surface-container text-sb-on-surface-variant")}>{n.toLocaleString("es-PE")}</span>
                    </Link>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[1fr_1.3fr]">
        {/* Bandeja por etapa */}
        <div className="flex min-w-0 flex-col gap-4">
          {SITES.map((site) => (
            <Card key={site} className="min-w-0 overflow-hidden">
              <div className="border-b border-sb-outline-variant/40 px-4 py-3">
                <h3 className="text-sm font-semibold">{SITE_INFO[site].title}</h3>
                <p className="text-[11px] text-sb-on-surface-variant">Unidades esperando cada etapa y quién la registra</p>
              </div>
              <div className="flex flex-col p-1.5">
                {SITE_INFO[site].dates.map((d) => {
                  const who = owners(site, d.key);
                  const n = data.pending[`${site}|${d.key}`] ?? 0;
                  return (
                    <Link key={d.key} href={`/units/${site.toLowerCase()}?pending=${d.key}`} className="flex min-w-0 items-center gap-3 rounded-xl px-2.5 py-2 text-xs transition-colors hover:bg-sb-surface-container-low">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{d.step}</span>
                        <span className={cn("block truncate text-[10px]", who.length ? "text-sb-on-surface-variant" : n ? "font-semibold text-sb-late" : "text-sb-on-surface-variant")}>
                          {d.action} · {who.length ? who.map((u) => u.name).join(", ") : "sin encargado"}
                        </span>
                      </span>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums", n ? "bg-sb-surface-container-high" : "text-sb-on-surface-variant")}>{n.toLocaleString("es-PE")}</span>
                    </Link>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>

        {/* Actividad */}
        <Card className="min-w-0 overflow-hidden">
          <div className="border-b border-sb-outline-variant/40 px-4 py-3">
            <h3 className="text-sm font-semibold">Actividad reciente</h3>
            <p className="text-[11px] text-sb-on-surface-variant">Cada fecha que se registra o corrige, al instante</p>
          </div>
          {!data.events.length && <p className="px-4 py-10 text-center text-xs text-sb-on-surface-variant">Todavía no hay registros. Aquí aparecerá cada fecha que registren los encargados.</p>}
          <ul className="scroll-hidden max-h-[640px] overflow-y-auto p-1.5">
            {data.events.map((e) => (
              <li key={e.id} className={cn("flex min-w-0 items-start gap-3 rounded-xl px-2.5 py-2.5 text-xs transition-colors duration-1000", fresh.has(e.id) && "bg-sb-primary-soft")}>
                <span className="w-11 shrink-0 pt-0.5 font-mono text-[11px] text-sb-on-surface-variant" title={e.at}>{e.at.slice(0, 10) === data.now.slice(0, 10) ? time(e.at) : fmtDate(e.at.slice(0, 10)).slice(0, 5)}</span>
                <div className="min-w-0 flex-1">
                  <p className="break-words">
                    <b>{e.user_name ?? "Usuario eliminado"}</b>
                    {e.user_role && e.user_role !== "operator" && <span className="text-sb-on-surface-variant"> ({ROLE_LABEL[e.user_role]})</span>}
                    {" · "}{e.old_value ? "corrigió" : "registró"} <b>{stageLabel(e.site, e.field)}</b>
                    {e.old_value ? <> de {val(e.field, e.old_value)} a {val(e.field, e.new_value)}</> : <>: {val(e.field, e.new_value)}</>}
                  </p>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Link href={`/units/${e.site.toLowerCase()}?q=${e.chassis}`} className="font-mono text-[11px] text-sb-on-surface-variant hover:underline">{e.site} · {e.chassis}</Link>
                    <span className="rounded-full bg-sb-surface-container px-2 py-0.5 text-[10px] font-medium">{STATUS_LABEL[e.status]}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
