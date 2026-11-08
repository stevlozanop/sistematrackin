"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Card } from "@/components/ui";
import { TableLabels } from "@/components/TableLabels";
import { cn } from "@/lib/cn";
import { MONTHS, STATUS_LABEL, fmtDate, type Status } from "@/lib/hsp";

type Month = { ym: string; total: number; delivered: number; open: number; late: number; pcl: number; yur: number; state: "closed" | "overdue" | "current" };
type Old = { id: number; site: "PCL" | "YUR"; chassis: string; dealer: string | null; status: Status; billing_date: string; age: number };
type Data = { current: string; months: Month[]; oldest: Old[] };

const STATE = {
  closed: { label: "Cerrado", icon: CheckCircle2, cls: "bg-sb-ontime-soft text-sb-ontime" },
  overdue: { label: "Debe cerrarse", icon: AlertTriangle, cls: "bg-sb-late-soft text-sb-late" },
  current: { label: "En curso", icon: Clock, cls: "bg-sb-surface-container-high text-sb-on-surface-variant" },
} as const;

const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
/** Unidades sin entregar de ese mes en un módulo (lista de PCL o YUR filtrada). */
const link = (site: "pcl" | "yur", ym: string) => `/units/${site}?year=${ym.slice(0, 4)}&month=${Number(ym.slice(5, 7))}`;

/**
 * Cierre de mes (FIFO): primero se cierra lo más antiguo. En octubre, septiembre ya debe estar cerrado.
 * Muestra cada mes de facturación con unidades pendientes (y los últimos meses), y las unidades más antiguas sin entregar.
 */
export function MonthClosing() {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    fetch("/api/closing").then((r) => (r.ok ? r.json() : null)).then((x) => x && setD(x)).catch(() => {});
  }, []);
  if (!d) return null;
  const overdue = d.months.filter((m) => m.state === "overdue");

  return (
    <Card className="sb-anim-item-in overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-sb-outline-variant/40 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Cierre de mes · FIFO</h3>
          <p className="text-[11px] text-sb-on-surface-variant">
            Primero se entrega lo más antiguo. Cada mes anterior a {monthName(d.current).toLowerCase()} ya debería estar cerrado (todo entregado).
          </p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", overdue.length ? STATE.overdue.cls : STATE.closed.cls)}>
          {overdue.length ? `${overdue.length} ${overdue.length === 1 ? "mes pendiente de cerrar" : "meses pendientes de cerrar"}` : "Meses anteriores cerrados"}
        </span>
      </div>

      {/* min-w-0: la tabla no ensancha la tarjeta más allá de la pantalla (en celular cada mes es una tarjeta) */}
      <div className="grid min-w-0 gap-0 xl:grid-cols-[3fr_2fr]">
        <TableLabels className="min-w-0">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant/60">
                <th className="px-4 py-2 font-semibold">Mes de facturación</th>
                <th className="px-2 py-2 text-right font-semibold">Facturadas</th>
                <th className="px-2 py-2 text-right font-semibold">Entregadas</th>
                <th className="px-2 py-2 text-right font-semibold">Sin entregar</th>
                <th className="px-4 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {d.months.map((m) => {
                const st = STATE[m.state];
                return (
                  <tr key={m.ym} className="border-b border-sb-outline-variant/25 last:border-0">
                    <td className="px-4 py-2 font-medium">{monthName(m.ym)}</td>
                    <td className="px-2 py-2 text-right">{m.total.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right">{m.delivered.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right">
                      {m.open ? (
                        <span className="inline-flex gap-2">
                          {m.pcl > 0 && <Link className="underline underline-offset-2" href={link("pcl", m.ym)}>PCL {m.pcl.toLocaleString()}</Link>}
                          {m.yur > 0 && <Link className="underline underline-offset-2" href={link("yur", m.ym)}>YUR {m.yur.toLocaleString()}</Link>}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold", st.cls)}>
                        <st.icon className="h-3 w-3" /> {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableLabels>

        <div className="min-w-0 border-t border-sb-outline-variant/40 px-4 py-3 xl:border-l xl:border-t-0">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-sb-on-surface-variant/60">Las más antiguas sin entregar</p>
          {d.oldest.length ? d.oldest.map((u) => (
            <Link key={u.id} href={`/units/${u.site.toLowerCase()}?q=${encodeURIComponent(u.chassis)}`}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-sb-outline-variant/20 py-2 text-xs last:border-0 hover:text-sb-primary sm:flex-nowrap sm:py-1.5">
              <span className="min-w-0 basis-full truncate sm:flex-1 sm:basis-auto">
                <b className="font-mono font-medium">{u.chassis}</b>{" "}
                <span className="text-sb-on-surface-variant">· {u.site} · {STATUS_LABEL[u.status]}<span className="hidden sm:inline">{u.dealer ? ` · ${u.dealer}` : ""}</span></span>
              </span>
              {u.dealer && <span className="min-w-0 flex-1 truncate text-[11px] text-sb-on-surface-variant sm:hidden">{u.dealer}</span>}
              <span className="shrink-0 text-[11px] font-semibold text-sb-late sm:font-normal sm:text-sb-on-surface-variant">{fmtDate(u.billing_date)} · {u.age} días</span>
            </Link>
          )) : <p className="text-xs text-sb-on-surface-variant">Todo entregado.</p>}
        </div>
      </div>
    </Card>
  );
}
