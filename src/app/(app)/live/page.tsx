"use client";
import { DATA_EVENT } from "@/components/UploadCenter";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Chip } from "@heroui/react";
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

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="En vivo" sub="Se actualiza solo cada 5 segundos: quién está conectado, qué le falta a cada encargado y cada fecha que se registra.">
        <span className="flex items-center gap-2 text-[11px] text-sb-on-surface-variant">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sb-primary opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sb-primary" />
          </span>
          Actualizado {time(data.now)}:{data.now.slice(17, 19)}
        </span>
      </PageTitle>

      {/* Encargados */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {!operators.length && (
          <Card className="p-5 text-sm text-sb-on-surface-variant sm:col-span-2 xl:col-span-3">
            Aún no hay encargados. Créalos en <Link href="/admins" className="underline">Usuarios</Link> y asígnales sus etapas.
          </Card>
        )}
        {operators.map((u) => {
          const pend = u.stages.reduce((t, s) => t + (data.pending[`${s.site}|${s.field}`] ?? 0), 0);
          return (
            <Card key={u.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-sb-on-surface-variant/60">
                    {areaOf(u.area) && u.area !== "CUSTOM" ? areaOf(u.area)!.label : "Encargado"}{u.carrier ? ` · ${u.carrier}` : ""}
                  </div>
                  <div className="truncate text-sm font-semibold">{u.name}</div>
                  <div className="truncate text-[11px] text-muted">{u.email}</div>
                </div>
                <span className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium", u.online ? "bg-sb-primary text-sb-on-primary" : "bg-sb-surface-container-high text-sb-on-surface-variant")}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", u.online ? "bg-sb-on-primary" : "bg-sb-on-surface-variant/50")} />
                  {u.online ? "En línea" : u.last_seen ? `Visto ${u.last_seen.slice(0, 10) === data.now.slice(0, 10) ? time(u.last_seen) : fmtDate(u.last_seen.slice(0, 10))}` : "Nunca entró"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-sb-surface-container-low p-2"><div className="text-lg font-bold">{pend.toLocaleString()}</div><div className="text-[10px] text-muted">pendientes</div></div>
                <div className="rounded-xl bg-sb-surface-container-low p-2"><div className="text-lg font-bold">{u.today}</div><div className="text-[10px] text-muted">registró hoy</div></div>
                <div className="rounded-xl bg-sb-surface-container-low p-2"><div className="text-lg font-bold">{time(u.lastAction)}</div><div className="text-[10px] text-muted">última acción</div></div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!u.stages.length && <span className="text-[11px] text-muted">Sin etapas asignadas</span>}
                {u.stages.map((s) => (
                  <Link key={`${s.site}${s.field}`} href={`/units/${s.site.toLowerCase()}?pending=${s.field}`} className="sbf-chip">
                    {s.site} · {stageLabel(s.site, s.field)} ({(data.pending[`${s.site}|${s.field}`] ?? 0).toLocaleString()})
                  </Link>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        {/* Bandeja por etapa */}
        <div className="flex flex-col gap-4">
          {SITES.map((site) => (
            <Card key={site} className="overflow-hidden">
              <h3 className="border-b border-sb-outline-variant/40 px-4 py-3 text-sm font-semibold">{SITE_INFO[site].title} · unidades esperando cada etapa</h3>
              <table className="w-full text-left text-xs">
                <tbody>
                  {SITE_INFO[site].dates.map((d) => {
                    const who = owners(site, d.key);
                    const n = data.pending[`${site}|${d.key}`] ?? 0;
                    return (
                      <tr key={d.key} className="border-b border-sb-outline-variant/25 last:border-0">
                        <td className="px-4 py-2 font-medium">{d.step}<span className="block text-[10px] font-normal text-muted">{d.action}</span></td>
                        <td className="px-2 py-2 text-right">
                          <Link href={`/units/${site.toLowerCase()}?pending=${d.key}`} className="font-semibold hover:underline">{n.toLocaleString()}</Link>
                        </td>
                        <td className="px-4 py-2 text-right">
                          {who.length
                            ? <span className="text-sb-on-surface-variant">{who.map((u) => u.name).join(", ")}</span>
                            : <span className={cn("rounded-full px-2 py-0.5 text-[10px]", n ? "bg-sb-primary text-sb-on-primary" : "text-muted")}>Sin encargado</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          ))}
        </div>

        {/* Actividad */}
        <Card className="overflow-hidden">
          <h3 className="border-b border-sb-outline-variant/40 px-4 py-3 text-sm font-semibold">Actividad reciente</h3>
          {!data.events.length && <p className="px-4 py-10 text-center text-xs text-sb-on-surface-variant/60">Todavía no hay registros. Aquí aparecerá cada fecha que registren los encargados.</p>}
          <ul className="scroll-hidden max-h-[640px] divide-y divide-sb-outline-variant/25 overflow-y-auto">
            {data.events.map((e) => (
              <li key={e.id} className={cn("flex items-start gap-3 px-4 py-2.5 text-xs transition-colors duration-1000", fresh.has(e.id) && "bg-sb-surface-container")}>
                <span className="w-11 shrink-0 pt-0.5 font-mono text-[11px] text-muted" title={e.at}>{e.at.slice(0, 10) === data.now.slice(0, 10) ? time(e.at) : fmtDate(e.at.slice(0, 10))}</span>
                <div className="min-w-0 flex-1">
                  <div>
                    <b>{e.user_name ?? "Usuario eliminado"}</b>
                    {e.user_role && e.user_role !== "operator" && <span className="text-muted"> ({ROLE_LABEL[e.user_role]})</span>}
                    {" · "}{e.old_value ? "corrigió" : "registró"} <b>{stageLabel(e.site, e.field)}</b>
                    {e.old_value ? <> de {val(e.field, e.old_value)} a {val(e.field, e.new_value)}</> : <>: {val(e.field, e.new_value)}</>}
                  </div>
                  <Link href={`/units/${e.site.toLowerCase()}?q=${e.chassis}`} className="font-mono text-[11px] text-muted hover:underline">{e.site} · {e.chassis}</Link>
                </div>
                <Chip size="sm" variant="soft" className="shrink-0 whitespace-nowrap">{STATUS_LABEL[e.status]}</Chip>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
