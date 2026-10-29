"use client";
import { DATA_EVENT } from "@/components/UploadCenter";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Download, MessageCircle, PackageCheck, Search, Store, Truck } from "lucide-react";
import { Card, PageTitle, Pill } from "@/components/ui";
import { StatGrid } from "@/components/StatCard";
import { ServiceBadge, ServiceSplitBar } from "@/components/Service";
import { cn } from "@/lib/cn";
import { MONTHS, fmtDate, type Service, type Status } from "@/lib/hsp";

type Data = {
  client: string | null;
  totals: { total: number; open: number; delivered: number; onTimeDelivered: number; late: number; soon: number; avgDays: number | null; nextEta: string | null };
  byStatus: { site: "PCL" | "YUR"; status: Status; n: number; late: number }[];
  byMonth: { ym: string; total: number; delivered: number; open: number; on_time: number; late: number }[];
  byStore: { dealer: string; total: number; open: number; delivered: number; on_time: number; late_open: number }[];
  byModel: { material: string | null; category: string | null; open: number; total: number }[];
  recent: { site: string; chassis: string; guia: string | null; material: string | null; dealer: string | null; d_entrega: string; service: Service | null; real_days: number | null }[];
};

/** Las etapas en palabras que entiende el comprador final. */
const STAGES: { status: Status; label: string; where: string }[] = [
  { status: "IQT-PORT", label: "En fábrica", where: "Iquitos · armada y facturada" },
  { status: "EMBARQUE", label: "Embarcando", where: "Cargada en contenedor en Iquitos" },
  { status: "TRANSITO FLUVIAL", label: "Navegando por el río", where: "De Iquitos al puerto" },
  { status: "ARRIBO PUERTO", label: "Llegó al puerto", where: "Pucallpa o Yurimaguas" },
  { status: "EN ALMACÉN", label: "En almacén", where: "Listo para despacho" },
  { status: "TRANSITO DEALER", label: "En camino a tu tienda", where: "Despachado" },
  { status: "EN ALMACÉN LIMA", label: "En almacén Lima", where: "Ruta Lima (5.1)" },
  { status: "TRANSITO DEALER 2", label: "Saliendo de Lima", where: "Ruta Lima (5.2)" },
];

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null);
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1].slice(0, 3)} ${ym.slice(2, 4)}`;

/**
 * «Mi resumen»: el dashboard del cliente de Honda (SORSA, SERVIHONDA…) con sus pedidos.
 * Le sirve para ver cómo va todo y responderle a sus propios compradores.
 */
export default function ClientSummary() {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/portal/summary").then(async (r) => {
      const j = await r.json().catch(() => ({ error: "Error del servidor" }));
      if (!alive) return;
      if (!r.ok) setError(j.error); else { setD(j); setError(""); }
    });
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener(DATA_EVENT, load);
    return () => { alive = false; clearInterval(t); window.removeEventListener(DATA_EVENT, load); };
  }, []);

  if (error) return <Card className="mt-4 px-5 py-8 text-center text-sm text-sb-on-surface-variant">{error}</Card>;
  if (!d) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando tu resumen…</div>;

  const t = d.totals;
  const onTimePct = pct(t.onTimeDelivered, t.delivered);
  const stage = (s: Status) => d.byStatus.filter((r) => r.status === s).reduce((n, r) => n + r.n, 0);
  const stageLate = (s: Status) => d.byStatus.filter((r) => r.status === s).reduce((n, r) => n + r.late, 0);
  const stages = STAGES.filter((s) => !s.status.includes("LIMA") && s.status !== "TRANSITO DEALER 2" || stage(s.status) > 0);
  const maxStage = Math.max(1, ...stages.map((s) => stage(s.status)));
  const maxMonth = Math.max(1, ...d.byMonth.map((m) => m.total));

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title={`Resumen de ${d.client ?? "tus pedidos"}`} sub="Tus pedidos de Honda desde la fábrica de Iquitos hasta tus tiendas. Se actualiza solo cada minuto.">
        <a href="/api/report" className="sbf-chip flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> Descargar reporte</a>
      </PageTitle>

      <StatGrid
        className="grid-cols-2 lg:grid-cols-5"
        items={[
          { label: "En camino", value: t.open.toLocaleString(), icon: Truck, onClick: () => router.push("/portal") },
          { label: "Retrasadas", value: t.late.toLocaleString(), icon: AlertTriangle, onClick: () => router.push("/portal?tab=late") },
          { label: "Entregadas", value: t.delivered.toLocaleString(), icon: PackageCheck, onClick: () => router.push("/portal?tab=delivered") },
          { label: "Entregadas a tiempo", value: onTimePct === null ? "—" : `${onTimePct} %`, icon: CheckCircle2 },
          { label: "Tiempo promedio", value: t.avgDays === null ? "—" : `${t.avgDays} días`, icon: Clock },
        ]}
      />

      {/* Responder a un comprador: buscar su unidad */}
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <span className="flex items-center gap-2 text-sm font-semibold"><MessageCircle className="h-4 w-4 text-sb-primary" /> ¿Un comprador pregunta por su moto?</span>
        <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/portal?tab=all&q=${encodeURIComponent(q.trim())}`); }}>
          <label className="sbf-search flex-1">
            <Search className="h-4 w-4 opacity-40" />
            <input placeholder="Escribe el chasis, motor o guía…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar pedido" />
          </label>
          <button type="submit" className="sbf-chip active whitespace-nowrap">Buscar</button>
        </form>
        {t.nextEta && <span className="flex items-center gap-1.5 text-[12px] text-sb-on-surface-variant"><CalendarClock className="h-3.5 w-3.5" /> Próxima llegada: <b>{fmtDate(t.nextEta)}</b></span>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Dónde están ahora los pedidos en camino */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold">¿Dónde están tus {t.open.toLocaleString()} pedidos en camino?</h3>
          <p className="mb-3 text-[11px] text-sb-on-surface-variant">Cada etapa del recorrido, de la fábrica a tu tienda.</p>
          <div className="flex flex-col gap-2.5">
            {stages.map((s, i) => {
              const n = stage(s.status);
              return (
                <div key={s.status} className="flex items-start gap-3 text-xs">
                  <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold", n ? "bg-sb-primary text-sb-on-primary" : "bg-sb-surface-container-high text-sb-on-surface-variant")}>{i + 1}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0">
                        <b className="font-medium">{s.label}</b> <span className="text-[10px] text-sb-on-surface-variant">· {s.where}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <b>{n.toLocaleString()}</b>
                        {stageLate(s.status) > 0 && <span className="ml-1.5 text-[10px] text-sb-late">({stageLate(s.status)} retrasadas)</span>}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-sb-surface-container-high">
                      <motion.div className="h-full rounded-full bg-sb-primary" initial={{ width: 0 }} animate={{ width: `${(n / maxStage) * 100}%` }} transition={{ duration: 0.7, delay: 0.05 * i }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Pedidos por mes */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Tus pedidos por mes</h3>
          <p className="mb-3 text-[11px] text-sb-on-surface-variant">Por mes de facturación: cuántos pediste, cuántos faltan llegar y cuántos llegaron a tiempo.</p>
          <div className="flex flex-col gap-2.5">
            {d.byMonth.length ? d.byMonth.map((m) => (
              <div key={m.ym} className="grid grid-cols-[3.5rem_1fr_6rem] items-center gap-3 text-xs">
                <span className="font-medium capitalize">{monthName(m.ym)}</span>
                <div className="flex flex-col gap-1">
                  <div className="flex h-2 overflow-hidden rounded-full bg-sb-surface-container-high" style={{ width: `${Math.max(8, (m.total / maxMonth) * 100)}%` }}>
                    <div className="h-full bg-sb-primary" style={{ width: `${(m.delivered / m.total) * 100}%` }} title={`${m.delivered} entregados`} />
                  </div>
                  <ServiceSplitBar onTime={m.on_time} late={m.late} labels={false} className="opacity-80" />
                </div>
                <span className="text-right text-[11px]">
                  <b>{m.total.toLocaleString()}</b> pedidos
                  <span className={cn("block text-[10px]", m.open ? "text-sb-on-surface" : "text-sb-on-surface-variant")}>{m.open ? `${m.open} en camino` : "todo entregado"}</span>
                </span>
              </div>
            )) : <p className="text-xs text-sb-on-surface-variant">Sin pedidos en los últimos 12 meses.</p>}
          </div>
          <p className="mt-3 flex flex-wrap gap-3 text-[10px] text-sb-on-surface-variant">
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-sb-primary" /> entregados</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-sb-ontime" /> a tiempo</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-sb-late" /> fuera de tiempo</span>
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Por tienda */}
        <Card className="overflow-hidden">
          <div className="border-b border-sb-outline-variant/40 px-4 py-3"><h3 className="text-sm font-semibold">Por tienda</h3></div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant/60">
                <th className="px-4 py-2 font-semibold">Tienda</th>
                <th className="px-2 py-2 text-right font-semibold">En camino</th>
                <th className="px-2 py-2 text-right font-semibold">Entregadas</th>
                <th className="px-4 py-2 text-right font-semibold">A tiempo</th>
              </tr>
            </thead>
            <tbody>
              {d.byStore.map((s) => (
                <tr key={s.dealer} className="border-b border-sb-outline-variant/25 last:border-0">
                  <td className="px-4 py-2"><span className="flex items-center gap-1.5"><Store className="h-3.5 w-3.5 shrink-0 text-sb-on-surface-variant" />{s.dealer}</span></td>
                  <td className="px-2 py-2 text-right">{s.open.toLocaleString()}{s.late_open > 0 && <span className="block text-[10px] text-sb-late">{s.late_open} retrasadas</span>}</td>
                  <td className="px-2 py-2 text-right">{s.delivered.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">{pct(s.on_time, s.total) ?? "—"}{s.total ? " %" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="flex flex-col gap-4">
          {/* Modelos en camino */}
          <Card className="p-5">
            <h3 className="mb-2 text-sm font-semibold">Modelos que vienen en camino</h3>
            <div className="flex flex-wrap gap-1.5">
              {d.byModel.filter((m) => m.open > 0).map((m) => (
                <Pill key={m.material ?? "—"}>{m.material ?? "—"}{m.category ? ` · ${m.category}` : ""} · <b>{m.open}</b></Pill>
              ))}
              {!d.byModel.some((m) => m.open > 0) && <span className="text-xs text-sb-on-surface-variant">No tienes unidades en camino.</span>}
            </div>
          </Card>

          {/* Últimas entregas */}
          <Card className="p-5">
            <h3 className="mb-2 text-sm font-semibold">Últimas entregas</h3>
            {d.recent.length ? d.recent.map((u) => (
              <Link key={u.chassis} href={`/portal?tab=all&q=${encodeURIComponent(u.chassis)}`}
                className="flex items-center gap-2 border-b border-sb-outline-variant/20 py-1.5 text-xs last:border-0 hover:text-sb-primary">
                <span className="min-w-0 flex-1 truncate"><b className="font-mono font-medium">{u.chassis}</b> <span className="text-sb-on-surface-variant">· {u.material}{u.guia ? ` · Guía ${u.guia}` : ""} · {u.dealer}</span></span>
                <ServiceBadge s={u.service} size="xs" />
                <span className="shrink-0 text-[11px] text-sb-on-surface-variant">{fmtDate(u.d_entrega)}</span>
              </Link>
            )) : <p className="text-xs text-sb-on-surface-variant">Todavía no hay entregas.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
