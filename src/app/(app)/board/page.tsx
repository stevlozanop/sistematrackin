"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ListBox, Modal, Select } from "@heroui/react";
import { ChevronRight, Upload } from "lucide-react";
import { ImportPanel, readExcel, saveExcel, type Preview } from "@/components/ImportPanel";
import { toast } from "@heroui/react";
import { Card, PageTitle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { MONTHS, SITE_INFO, STATUS_LABEL, STATUS_SHORT, type Site, type Status } from "@/lib/hsp";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { AnimatedNumber, SERVICE_STYLE, ServiceBadge, ServiceSplitBar } from "@/components/Service";

/**
 * Tablero de Honda: lo que pidió ver de cada ruta (Pucallpa y Yurimaguas) por mes de facturación.
 * 1. Avance de entregas · 2. Nivel de servicio y días de demora · 3. Motivos de demora · 4. Tránsito por estado.
 * Al hacer clic en un mes o una celda: detalle por distrito y dealer con 2W (motos) y 3W (motokares).
 */

type MonthRow = { site: Site; m: number; total: number; delivered: number; on_time: number; measured: number; delay: number | null };
type Data = {
  year: number; years: number[]; target: number; months: MonthRow[];
  reasons: { site: Site; m: number; reason: string; n: number }[];
  transit: { site: Site; m: number; service: "A TIEMPO" | "FUERA DE TIEMPO" | null; status: Status; n: number }[];
};
type Detail = {
  districts: { district: string; w2: number; w3: number; total: number; dealers: { dealer: string; w2: number; w3: number; total: number }[] }[];
  totals: { w2: number; w3: number; total: number };
};
type Ask = { title: string; site: Site; m?: number; service?: string; status?: string; delivered?: "0" | "1" };

const ROUTES: Site[] = ["YUR", "PCL"];
const ROUTE_NAME: Record<Site, string> = { PCL: "Pucallpa", YUR: "Yurimaguas" };
const MES = MONTHS.map((m) => m.slice(0, 3));
const n = (v: number) => v.toLocaleString("es-PE");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

/* Colores de datos (validados para daltonismo en claro y oscuro). Ruta: Pucallpa naranja, Yurimaguas verde agua.
   Motivos: seis tonos fijos por motivo (el mismo color en las dos rutas) y gris para «Otros». */
const VIZ_CSS = `
.board-root{--route-PCL:#eb6834;--route-YUR:#1baf7a;--r1:#eb6834;--r2:#1baf7a;--r3:#eda100;--r4:#e87ba4;--r5:#008300;--r6:#6250d6;--r-other:#8b8b93}
html.dark .board-root{--route-PCL:#d95926;--route-YUR:#199e70;--r1:#d95926;--r2:#199e70;--r3:#c98500;--r4:#d55181;--r5:#008300;--r6:#9085e9;--r-other:#6b6b73}`;
/** Curva de las animaciones: arranca rápido y frena suave */
const EASE = [0.22, 1, 0.36, 1] as const;
const REASON_SLOTS = ["--r1", "--r2", "--r3", "--r4", "--r5", "--r6"];

/* ---------- 1. Avance de entregas: una píldora por mes ---------- */

function Progress({ site, rows, onPick }: { site: Site; rows: MonthRow[]; onPick: (a: Ask) => void }) {
  const byM = new Map(rows.map((r) => [r.m, r]));
  const months = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => byM.has(m));
  return (
    <Card className="p-4">
      <h3 className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-sb-on-surface-variant">
        Avance de entregas mensual · Ruta {ROUTE_NAME[site]}
      </h3>
      {months.length ? (
        <div className="mt-4 flex justify-between gap-1 overflow-x-auto pb-1">
          {months.map((m) => {
            const r = byM.get(m)!;
            const p = pct(Number(r.delivered), Number(r.total)) ?? 0;
            return (
              <button key={m} type="button" onClick={() => onPick({ title: `${ROUTE_NAME[site]} · ${MONTHS[m - 1]}`, site, m })}
                title={`${MONTHS[m - 1]}: ${n(r.delivered)} de ${n(r.total)} entregadas (${p}%). Clic para ver el detalle.`}
                className="group flex min-w-[2.6rem] flex-1 flex-col items-center gap-1.5 rounded-xl py-1 hover:bg-sb-surface-container">
                <span className={cn("text-xs font-bold tabular-nums", p < 100 ? "text-sb-on-surface" : "text-sb-on-surface-variant")}>{p}%</span>
                <span className="relative h-28 w-7 overflow-hidden rounded-full border border-sb-outline-variant bg-sb-surface-container">
                  <motion.span className="absolute inset-x-0 bottom-0 rounded-full" style={{ background: `var(--route-${site})` }}
                    initial={{ height: 0 }} animate={{ height: `${p}%` }} transition={{ duration: 0.9, delay: 0.04 * (m - 1), ease: EASE }} />
                </span>
                <span className="text-[10px] font-semibold uppercase text-sb-on-surface">{MES[m - 1]}</span>
                <span className="text-[9px] tabular-nums text-sb-on-surface-variant">{n(r.delivered)}/{n(r.total)}</span>
              </button>
            );
          })}
        </div>
      ) : <p className="mt-6 text-center text-xs text-sb-on-surface-variant">Sin unidades este año.</p>}
    </Card>
  );
}

/* ---------- 2. Gráfico de líneas con guía y tooltip ---------- */

type Series = { name: string; color: string; values: (number | null)[] };

function LineChart({ series, max, unit, goal, height = 210, width = 640 }: { series: Series[]; max: number; unit: string; goal?: number; height?: number; width?: number }) {
  const W = width, H = height, L = 36, R = 14, T = 22, B = 26;
  const x = (i: number) => L + (i * (W - L - R)) / 11;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, max / 2, max].map((v) => Math.round(v));
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const move = (e: React.PointerEvent) => {
    const box = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    setHover(Math.max(0, Math.min(11, Math.round(((px - L) / (W - L - R)) * 11))));
  };
  // Etiquetas solo en el último punto de cada serie y en el punto señalado
  const lastIdx = (s: Series) => s.values.reduce<number>((a, v, i) => (v !== null ? i : a), -1);
  // Si otra serie anterior tiene su etiqueta en el mismo mes y a menos de 14 px, esta va debajo del punto
  const labelBelow = (si: number, i: number) => series.slice(0, si).some((o) => {
    const v = o.values[i], w = series[si].values[i];
    return v !== null && w !== null && (i === lastIdx(o) || i === hover) && Math.abs(y(v) - y(w)) < 14;
  });
  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none select-none" onPointerMove={move} onPointerLeave={() => setHover(null)} role="img"
        aria-label={series.map((s) => `${s.name}: ${s.values.map((v, i) => (v === null ? "" : `${MES[i]} ${v}${unit}`)).filter(Boolean).join(", ")}`).join(". ")}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--sb-outline-variant)" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--sb-on-surface-variant)">{t}{unit}</text>
          </g>
        ))}
        {goal !== undefined && (
          <g>
            <line x1={L} x2={W - R} y1={y(goal)} y2={y(goal)} stroke="var(--sb-on-surface-variant)" strokeWidth={1.5} strokeDasharray="3 4" />
            <text x={W - R} y={y(goal) - 5} textAnchor="end" fontSize={10} fill="var(--sb-on-surface-variant)">Meta {goal}{unit}</text>
          </g>
        )}
        {MES.map((m, i) => <text key={m} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--sb-on-surface-variant)">{m}</text>)}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T - 6} y2={H - B} stroke="var(--sb-on-surface-variant)" strokeOpacity={0.4} />}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => (v === null ? null : [x(i), y(v)] as const));
          const d = pts.reduce((acc, p, i) => (p ? `${acc}${acc && pts[i - 1] ? "L" : "M"}${p[0]},${p[1]}` : acc), "");
          return (
            <g key={s.name}>
              <motion.path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: EASE }} />
              {pts.map((p, i) => p && (
                <motion.circle key={i} cx={p[0]} cy={p[1]} fill={s.color} stroke="var(--sb-surface)" strokeWidth={2}
                  initial={{ r: 0 }} animate={{ r: hover === i ? 5 : 4 }} transition={{ duration: 0.3, delay: hover === null ? 0.08 * i : 0, ease: EASE }} />
              ))}
              {pts.map((p, i) => p && (i === lastIdx(s) || i === hover) && (
                <text key={`t${i}`} x={p[0]} y={labelBelow(si, i) ? p[1] + 17 : p[1] - 9} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--sb-on-surface)"
                  stroke="var(--sb-surface)" strokeWidth={3} paintOrder="stroke">{s.values[i]}{unit}</text>
              ))}
            </g>
          );
        })}
      </svg>
      {hover !== null && series.some((s) => s.values[hover] !== null) && (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-sb-outline-variant bg-sb-surface px-2.5 py-1.5 text-[11px] shadow-md"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: hover > 8 ? "translateX(-105%)" : "translateX(8px)" }}>
          <b className="block">{MONTHS[hover]}</b>
          {series.map((s) => s.values[hover] !== null && (
            <span key={s.name} className="flex items-center gap-1.5 whitespace-nowrap">
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}: <b>{s.values[hover]}{unit}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const Legend = ({ items }: { items: { name: string; color: string }[] }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium">
    {items.map((i) => (
      <span key={i.name} className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />{i.name}</span>
    ))}
  </div>
);

/* ---------- 3. Motivos de demora: barras al 100 % por mes ---------- */

function Reasons({ site, rows, colorOf, onPick }: {
  site: Site; rows: Data["reasons"]; colorOf: (r: string) => string; onPick: (a: Ask) => void;
}) {
  const months = [...new Set(rows.map((r) => r.m))].sort((a, b) => a - b);
  const names = [...new Set(rows.map((r) => r.reason))];
  const [hover, setHover] = useState<string | null>(null);
  return (
    <Card className="flex flex-col gap-3 p-4">
      <h3 className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-sb-on-surface-variant">
        Motivos de demora por mes ({ROUTE_NAME[site]}) · % fuera de tiempo
      </h3>
      <Legend items={names.map((r) => ({ name: r, color: colorOf(r) }))} />
      {months.length ? (
        <div className="flex h-64 items-stretch gap-1.5">
          {months.map((m) => {
            const list = rows.filter((r) => r.m === m);
            const total = list.reduce((t, r) => t + Number(r.n), 0);
            return (
              <button key={m} type="button" onClick={() => onPick({ title: `${ROUTE_NAME[site]} · ${MONTHS[m - 1]} · Fuera de tiempo`, site, m, service: "FUERA DE TIEMPO" })}
                className="flex min-w-0 flex-1 flex-col items-center gap-1 text-left">
                <span className="text-[10px] font-bold tabular-nums">{n(total)}</span>
                <motion.span className="flex w-full flex-1 origin-bottom flex-col-reverse gap-[2px] overflow-hidden rounded-md"
                  initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ duration: 0.7, delay: 0.05 * months.indexOf(m), ease: EASE }}>
                  {list.map((r) => {
                    const p = (Number(r.n) / total) * 100;
                    const key = `${m}|${r.reason}`;
                    return (
                      <span key={r.reason} onPointerEnter={() => setHover(key)} onPointerLeave={() => setHover(null)}
                        title={`${MONTHS[m - 1]} · ${r.reason}: ${n(r.n)} (${Math.round(p)}%)`}
                        className={cn("relative flex items-center justify-center overflow-hidden text-[9px] font-bold text-white transition-opacity duration-200 ease-out", hover && hover !== key && "opacity-60")}
                        style={{ height: `${p}%`, background: colorOf(r.reason) }}>
                        {p >= 9 && <span className="truncate px-0.5 [text-shadow:0_0_2px_rgb(0_0_0/0.6)]">{Math.round(p)}%</span>}
                      </span>
                    );
                  })}
                </motion.span>
                <span className="text-[10px] text-sb-on-surface-variant">{MES[m - 1]}</span>
              </button>
            );
          })}
        </div>
      ) : <p className="py-8 text-center text-xs text-sb-on-surface-variant">Ninguna unidad fuera de tiempo.</p>}
    </Card>
  );
}

/* ---------- 4. Tránsito: mes × estado, con filas a tiempo / fuera de tiempo (mismo diseño que el Dashboard) ---------- */

/** Fondo de la celda: más intenso cuanto mayor es el número (azul = a tiempo, rojo = fuera). */
const heat = (sv: "A TIEMPO" | "FUERA DE TIEMPO", v: number, max: number) =>
  ({ background: `color-mix(in oklab, var(${sv === "A TIEMPO" ? "--sb-ontime" : "--sb-late"}) ${Math.round(12 + 48 * (v / Math.max(1, max)))}%, transparent)` });

function Transit({ site, rows, onPick }: { site: Site; rows: Data["transit"]; onPick: (a: Ask) => void }) {
  const statuses = SITE_INFO[site].statuses;
  const months = [...new Set(rows.map((r) => r.m))].sort((a, b) => a - b);
  const [open, setOpen] = useState<Set<number>>(() => new Set(months.slice(-2)));
  const get = (m: number | null, st: Status | null, sv: string | null) =>
    rows.filter((r) => (m === null || r.m === m) && (st === null || r.status === st) && (sv === null || r.service === sv)).reduce((t, r) => t + Number(r.n), 0);
  const max = (sv: string) => Math.max(1, ...months.flatMap((m) => statuses.map((st) => get(m, st, sv))));
  const maxOn = max("A TIEMPO"), maxLate = max("FUERA DE TIEMPO");
  const toggle = (m: number) => setOpen((s) => { const x = new Set(s); if (x.has(m)) x.delete(m); else x.add(m); return x; });
  const SV = ["A TIEMPO", "FUERA DE TIEMPO"] as const;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-sb-outline-variant/40 px-4 py-3">
        <h3 className="text-sm font-semibold">Tránsito <span style={{ color: `var(--route-${site})` }}>{ROUTE_NAME[site]}</span> · unidades por estado</h3>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-sb-on-surface-variant">
          <ServiceBadge s="A TIEMPO" size="xs" /><ServiceBadge s="FUERA DE TIEMPO" size="xs" />
          <span>Color más intenso = más unidades. Abre un mes para ver a tiempo / fuera de tiempo; haz clic en una cifra para el detalle 2W/3W.</span>
        </div>
      </div>
      <div className="overflow-x-auto px-2 pb-2">
        <table className="w-full min-w-[760px] border-separate border-spacing-y-[2px] text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant/60">
              <th className="px-3 py-2 font-semibold">Mes fact.</th>
              {statuses.map((st) => <th key={st} className="px-2 py-2 text-right font-semibold">{STATUS_LABEL[st]}</th>)}
              <th className="px-3 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => {
              const isOpen = open.has(m);
              const title = `${ROUTE_NAME[site]} · ${MONTHS[m - 1]}`;
              const on = get(m, null, "A TIEMPO"), late = get(m, null, "FUERA DE TIEMPO");
              return (
                <Fragment key={m}>
                  <motion.tr initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04, duration: 0.4, ease: EASE }}
                    className="bg-sb-surface-container-low font-semibold">
                    <td className="rounded-l-xl px-3 py-2">
                      <button type="button" onClick={() => toggle(m)} aria-expanded={isOpen} className="flex w-full items-center gap-1.5 text-left">
                        <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.25, ease: EASE }} className="inline-flex">
                          <ChevronRight className="h-3.5 w-3.5" />
                        </motion.span>
                        {MONTHS[m - 1]}
                      </button>
                      <ServiceSplitBar onTime={on} late={late} className="ml-5 mt-1 w-40" />
                    </td>
                    {statuses.map((st) => {
                      const v = get(m, st, null);
                      return (
                        <td key={st} className="px-2 py-2 text-right">
                          {v ? <button type="button" onClick={() => onPick({ title: `${title} · ${STATUS_SHORT[st]}`, site, m, status: st })} className="hover:underline"><AnimatedNumber value={v} /></button> : ""}
                        </td>
                      );
                    })}
                    <td className="rounded-r-xl px-3 py-2 text-right">
                      <button type="button" onClick={() => onPick({ title, site, m })} className="hover:underline"><AnimatedNumber value={get(m, null, null)} /></button>
                    </td>
                  </motion.tr>
                  <AnimatePresence initial={false}>
                    {isOpen && SV.map((sv, j) => (
                      <motion.tr key={sv}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10, transition: { duration: 0.18 } }}
                        transition={{ delay: 0.05 * j, duration: 0.3, ease: EASE }}>
                        <td className="py-1 pl-8 pr-3"><ServiceBadge s={sv} size="xs" /></td>
                        {statuses.map((st) => {
                          const v = get(m, st, sv), stTotal = get(m, st, null);
                          return (
                            <td key={st} className="px-1 py-1 text-right">
                              {v > 0 && (
                                <button type="button"
                                  onClick={() => onPick({ title: `${title} · ${STATUS_SHORT[st]} · ${SERVICE_STYLE[sv].label}`, site, m, status: st, service: sv })}
                                  title={`${MONTHS[m - 1]} · ${STATUS_LABEL[st]} · ${SERVICE_STYLE[sv].label}: ${n(v)} (${Math.round((v / stTotal) * 100)}% de esa etapa)`}
                                  style={heat(sv, v, sv === "A TIEMPO" ? maxOn : maxLate)}
                                  className="block w-full rounded-lg px-2 py-1 text-right font-semibold transition-transform duration-200 ease-out hover:scale-105">
                                  <AnimatedNumber value={v} />
                                </button>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-1 text-right">
                          <button type="button" onClick={() => onPick({ title: `${title} · ${SERVICE_STYLE[sv].label}`, site, m, service: sv })}
                            className="inline-flex items-center gap-1.5 font-semibold hover:underline">
                            <span className={cn("h-2 w-2 rounded-full", SERVICE_STYLE[sv].dot)} />
                            <AnimatedNumber value={get(m, null, sv)} />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </Fragment>
              );
            })}
            {months.length > 0 && (
              <tr className="font-bold">
                <td className="border-t-2 border-sb-outline-variant/60 px-3 py-2">Total</td>
                {statuses.map((st) => (
                  <td key={st} className="border-t-2 border-sb-outline-variant/60 px-2 py-2 text-right">
                    {get(null, st, null) ? <button type="button" onClick={() => onPick({ title: `${ROUTE_NAME[site]} · ${STATUS_SHORT[st]}`, site, status: st })} className="hover:underline">{n(get(null, st, null))}</button> : ""}
                  </td>
                ))}
                <td className="border-t-2 border-sb-outline-variant/60 px-3 py-2 text-right">
                  <button type="button" onClick={() => onPick({ title: `${ROUTE_NAME[site]} · Todas`, site })} className="hover:underline">{n(get(null, null, null))}</button>
                </td>
              </tr>
            )}
            {!months.length && <tr><td colSpan={statuses.length + 2} className="px-3 py-8 text-center text-sb-on-surface-variant/60">Sin unidades este año.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------- Modal: detalle por distrito y dealer (2W motos · 3W motokares) ---------- */

function DetailModal({ ask, year, onClose }: { ask: Ask | null; year: number; onClose: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!ask) return; // cada consulta monta el modal de nuevo (key), así empieza vacío
    const q = new URLSearchParams({ site: ask.site, year: String(year) });
    for (const k of ["m", "service", "status", "delivered"] as const) if (ask[k] !== undefined) q.set(k, String(ask[k]));
    fetch(`/api/board/detail?${q}`).then((r) => r.json()).then(setData).catch(() => setData({ districts: [], totals: { w2: 0, w3: 0, total: 0 } }));
  }, [ask, year]);
  return (
    <Modal>
      <Modal.Backdrop isOpen={!!ask} onOpenChange={(o) => !o && onClose()}>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.CloseTrigger aria-label="Cerrar" />
            <Modal.Header>
              <Modal.Heading>{ask?.title}{data ? ` — ${n(data.totals.total)} unidad(es)` : ""}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {!data ? <p className="py-8 text-center text-sm text-sb-on-surface-variant">Cargando…</p> : (
                <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-sb-outline-variant/40">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-sb-surface">
                      <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant">
                        <th className="px-3 py-2 text-left font-semibold">Distrito / Dealer</th>
                        <th className="px-3 py-2 text-right font-semibold" title="Motos (2 llantas)">2W · motos</th>
                        <th className="px-3 py-2 text-right font-semibold" title="Motokares (3 llantas)">3W · motokares</th>
                        <th className="px-3 py-2 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.districts.map((d) => {
                        const isOpen = open.has(d.district);
                        return (
                          <Fragment key={d.district}>
                            <tr className="border-b border-sb-outline-variant/20 font-semibold">
                              <td className="px-3 py-2">
                                <button type="button" aria-expanded={isOpen} className="flex items-center gap-1"
                                  onClick={() => setOpen((s) => { const x = new Set(s); if (x.has(d.district)) x.delete(d.district); else x.add(d.district); return x; })}>
                                  <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200 ease-out", isOpen && "rotate-90")} />{d.district}
                                </button>
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{d.w2 ? n(d.w2) : ""}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{d.w3 ? n(d.w3) : ""}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{n(d.total)}</td>
                            </tr>
                            <AnimatePresence initial={false}>
                            {isOpen && d.dealers.map((x, k) => (
                              <motion.tr key={x.dealer} className="border-b border-sb-outline-variant/10 text-xs text-sb-on-surface-variant"
                                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
                                transition={{ duration: 0.25, delay: 0.03 * k, ease: EASE }}>
                                <td className="py-1.5 pl-9 pr-3">{x.dealer}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{x.w2 ? n(x.w2) : ""}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{x.w3 ? n(x.w3) : ""}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{n(x.total)}</td>
                              </motion.tr>
                            ))}
                            </AnimatePresence>
                          </Fragment>
                        );
                      })}
                      {!data.districts.length && <tr><td colSpan={4} className="py-8 text-center text-xs text-sb-on-surface-variant">Sin unidades.</td></tr>}
                    </tbody>
                    {!!data.districts.length && (
                      <tfoot className="sticky bottom-0 bg-sb-surface">
                        <tr className="border-t border-sb-outline-variant/40 font-bold">
                          <td className="px-3 py-2">Total</td>
                          <td className="px-3 py-2 text-right tabular-nums">{n(data.totals.w2)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{n(data.totals.w3)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{n(data.totals.total)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/* ---------- Página ---------- */

export default function Board() {
  const [year, setYear] = useState<number | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [reload, setReload] = useState(0);
  // Carga masiva de Excel (HSP-OFICIAL o PCL-FACT): Leyva y Honda
  const [role, setRole] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const canImport = role === "admin" || role === "viewer";

  useEffect(() => { fetch("/api/me").then((r) => r.json()).then((m) => setRole(m.role ?? null)).catch(() => {}); }, []);
  useEffect(() => {
    fetch(`/api/board${year ? `?year=${year}` : ""}`).then((r) => r.json()).then((d) => (d.error ? null : setData(d)));
  }, [year, reload]);

  async function upload(file: File) {
    setReading(true);
    const p = await readExcel(file);
    setReading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (p) setPreview(p);
  }
  async function savePreview() {
    if (!preview || preview.saved) return;
    setSaving(true); setProgress(0);
    try {
      const j = await saveExcel(preview.rows, setProgress);
      setPreview((p) => p && { ...p, saved: true });
      toast.success("Excel guardado: el tablero ya está actualizado", { description: `${j.created.toLocaleString()} nuevas, ${j.updated.toLocaleString()} actualizadas` });
      setReload((n) => n + 1);
    } catch (e) {
      toast.danger((e as Error).message, { description: "Lo que alcanzó a guardarse se queda. Vuelve a subir el Excel para completar el resto." });
    }
    setSaving(false);
  }

  const view = useMemo(() => {
    if (!data) return null;
    const of = (site: Site) => data.months.filter((r) => r.site === site);
    const series = (site: Site, f: (r: MonthRow) => number | null) => {
      const byM = new Map(of(site).map((r) => [r.m, r]));
      return Array.from({ length: 12 }, (_, i) => { const r = byM.get(i + 1); return r ? f(r) : null; });
    };
    const sl = (r: MonthRow) => pct(Number(r.on_time), Number(r.measured));
    // Nivel de servicio combinado: promedio de las dos rutas (como el HSP del Excel)
    const both = Array.from({ length: 12 }, (_, i) => {
      const v = ROUTES.map((s) => series(s, sl)[i]).filter((x): x is number => x !== null);
      return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    });
    const period = both.filter((v): v is number => v !== null);
    // Motivos: color fijo por motivo según cuántas unidades tiene en el año (los 6 más frecuentes; el resto, «Otros»)
    const totals = new Map<string, number>();
    for (const r of data.reasons) totals.set(r.reason, (totals.get(r.reason) ?? 0) + Number(r.n));
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r).filter((r) => r !== "OTROS").slice(0, REASON_SLOTS.length);
    const fold = (r: string) => (top.includes(r) ? r : "OTROS / SIN MOTIVO");
    const reasons = data.reasons.reduce<Data["reasons"]>((acc, r) => {
      const reason = fold(r.reason);
      const hit = acc.find((x) => x.site === r.site && x.m === r.m && x.reason === reason);
      if (hit) hit.n = Number(hit.n) + Number(r.n); else acc.push({ ...r, reason, n: Number(r.n) });
      return acc;
    }, []);
    const order = (r: string) => (top.includes(r) ? top.indexOf(r) : 99);
    reasons.sort((a, b) => a.m - b.m || order(a.reason) - order(b.reason));
    const colorOf = (r: string) => (top.includes(r) ? `var(${REASON_SLOTS[top.indexOf(r)]})` : "var(--r-other)");
    return {
      of, colorOf, reasons,
      routeSL: ROUTES.map((s) => ({ name: ROUTE_NAME[s], color: `var(--route-${s})`, values: series(s, sl) })),
      delay: ROUTES.map((s) => ({ name: ROUTE_NAME[s], color: `var(--route-${s})`, values: series(s, (r) => (r.delay === null ? null : Number(r.delay))) })),
      both, avg: period.length ? Math.round(period.reduce((a, b) => a + b, 0) / period.length) : null,
      maxDelay: Math.max(5, ...data.months.map((r) => Math.ceil(Number(r.delay ?? 0)))),
    };
  }, [data]);

  if (!data || !view) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando tablero…</div>;
  const routeLegend = ROUTES.map((s) => ({ name: ROUTE_NAME[s], color: `var(--route-${s})` }));

  return (
    <MotionConfig reducedMotion="user">
    <div className="board-root flex flex-col gap-5">
      <style>{VIZ_CSS}</style>
      <PageTitle title={`Tablero · ${data.year}`} sub="Por mes de facturación. Haz clic en un mes o en una cifra para ver el detalle por distrito con motos (2W) y motokares (3W).">
        {canImport && (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={reading || saving}
              title="HSP-OFICIAL (hojas PCL y YUR) o PCL-FACT de facturación"
              className="flex h-10 items-center gap-1.5 rounded-full bg-sb-primary px-4 text-sm font-medium text-sb-on-primary transition-opacity duration-200 hover:opacity-90 disabled:opacity-50">
              <Upload className="h-4 w-4" /> {reading ? "Leyendo Excel…" : "Cargar Excel"}
            </button>
          </>
        )}
        <Select aria-label="Año" className="w-32" variant="secondary" value={String(data.year)} onChange={(v) => setYear(Number(v))}>
          <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
          <Select.Popover>
            <ListBox>{data.years.map((y) => <ListBox.Item key={y} id={String(y)} textValue={String(y)}>{y}<ListBox.ItemIndicator /></ListBox.Item>)}</ListBox>
          </Select.Popover>
        </Select>
      </PageTitle>

      <AnimatePresence>
        {preview && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: EASE }}>
            <ImportPanel preview={preview} saving={saving} progress={progress} onSave={savePreview} onClose={() => setPreview(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-4 xl:grid-cols-2">
        {ROUTES.map((s) => <Progress key={s} site={s} rows={view.of(s)} onPick={setAsk} />)}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="flex flex-col gap-2 p-4">
          <h3 className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-sb-on-surface-variant">Nivel de servicio por ruta</h3>
          <Legend items={routeLegend} />
          <LineChart series={view.routeSL} max={100} unit="%" goal={data.target} />
        </Card>
        <Card className="flex flex-col gap-2 p-4">
          <h3 className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-sb-on-surface-variant">Nivel de servicio (las dos rutas)</h3>
          <p className="text-[11px] text-sb-on-surface-variant">Meta: {data.target}% · Promedio del periodo: <b className="text-sb-on-surface">{view.avg ?? "—"}%</b></p>
          <LineChart series={[{ name: "Nivel de servicio", color: "var(--sb-primary)", values: view.both }]} max={100} unit="%" goal={data.target} />
        </Card>
      </div>

      <Card className="flex flex-col gap-2 p-4">
        <h3 className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-sb-on-surface-variant">Promedio de días de demora (unidades fuera de tiempo)</h3>
        <Legend items={routeLegend} />
        <LineChart series={view.delay} max={view.maxDelay} unit="d" height={200} width={1300} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {ROUTES.map((s) => <Reasons key={s} site={s} rows={view.reasons.filter((r) => r.site === s)} colorOf={view.colorOf} onPick={setAsk} />)}
      </div>

      <div className="grid gap-4">
        {ROUTES.map((s) => <Transit key={`${s}-${data.year}`} site={s} rows={data.transit.filter((r) => r.site === s)} onPick={setAsk} />)}
      </div>

      <DetailModal key={ask ? JSON.stringify(ask) : "none"} ask={ask} year={data.year} onClose={() => setAsk(null)} />
    </div>
    </MotionConfig>
  );
}
