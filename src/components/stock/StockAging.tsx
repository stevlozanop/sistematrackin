"use client";
import { useMemo } from "react";
import { Hourglass } from "lucide-react";
import { Card } from "@/components/ui";
import { W2, W3 } from "@/components/Kinds";
import { n } from "@/components/stage/StageKit";
import { daysBetween, parseISO, todayLima } from "@/lib/dates";
import { districtCompare, zoneOf } from "@/lib/zones";
import { cn } from "@/lib/cn";

/** Lo que espera en almacén: distrito · nave · fecha de arribo · motos y motokares */
export type AgingRow = { district: string | null; nave: string | null; arribo: string | null; w2: number; w3: number };

type Kind = "w2" | "w3";
const KINDS: { k: Kind; label: string; color: string }[] = [{ k: "w2", label: "2W", color: W2 }, { k: "w3", label: "3W", color: W3 }];

/** Días de espera: rojo desde 30, ámbar desde 15 */
const level = (d: number | null) => (d === null ? "none" : d >= 30 ? "late" : d >= 15 ? "warn" : "ok");
const tone = (d: number | null) => ({ none: "text-sb-on-surface-variant", late: "text-sb-late", warn: "text-amber-600 dark:text-amber-400", ok: "text-sb-on-surface" })[level(d)];
/** Ficha de cada llegada y franja de su columna, según cuánto lleva esperando */
const head = (d: number | null) => ({ none: "bg-sb-surface-container", late: "bg-sb-late-soft", warn: "bg-amber-500/12", ok: "bg-sb-surface-container" })[level(d)];
const band = (d: number | null) => ({ none: "", late: "bg-sb-late-soft/35", warn: "bg-amber-500/[0.06]", ok: "" })[level(d)];
const short = (iso: string) => parseISO(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short" }).replace(".", "");

/**
 * Stock por antigüedad (como el cuadro «Stock almacén Pucallpa por antigüedad»): una columna por llegada
 * (fecha de arribo + nave, de la más antigua a la más nueva) con sus días de espera hasta hoy, y una fila por distrito.
 * Los distritos que salen juntos van pegados (misma barrita que en el stock por distrito).
 */
export function StockAging({ rows }: { rows: AgingRow[] | null }) {
  const today = todayLima();
  const data = useMemo(() => {
    if (!rows?.length) return null;
    // Llegadas: fecha de arribo + nave, de la más antigua a la más nueva (sin fecha, al final)
    const batches = [...rows.reduce((m, r) => {
      const k = `${r.arribo ?? ""}|${r.nave ?? ""}`;
      const b = m.get(k) ?? { key: k, arribo: r.arribo, nave: r.nave, w2: 0, w3: 0 };
      b.w2 += r.w2; b.w3 += r.w3; m.set(k, b); return m;
    }, new Map<string, { key: string; arribo: string | null; nave: string | null; w2: number; w3: number }>()).values()]
      .sort((a, b) => (a.arribo ?? "9999").localeCompare(b.arribo ?? "9999") || String(a.nave).localeCompare(String(b.nave)));
    // Columnas: en cada llegada, solo los tipos que trae
    const cols = batches.flatMap((b) => KINDS.filter(({ k }) => b[k] > 0).map((kd) => ({ batch: b, ...kd })));
    const districts = [...new Set(rows.map((r) => r.district ?? "Sin distrito"))].sort(districtCompare);
    const cell = new Map<string, number>();
    for (const r of rows) for (const { k } of KINDS) {
      const id = `${r.district ?? "Sin distrito"}|${r.arribo ?? ""}|${r.nave ?? ""}|${k}`;
      cell.set(id, (cell.get(id) ?? 0) + r[k]);
    }
    const get = (d: string, c: (typeof cols)[number]) => cell.get(`${d}|${c.batch.key}|${c.k}`) ?? 0;
    const days = (a: string | null) => (a ? Math.max(0, daysBetween(parseISO(a), today)) : null);
    const total = rows.reduce((t, r) => t + r.w2 + r.w3, 0);
    const old30 = rows.filter((r) => (days(r.arribo) ?? 0) >= 30).reduce((t, r) => t + r.w2 + r.w3, 0);
    return { batches, cols, districts, get, days, total, old30, oldest: batches.find((b) => b.arribo) ?? null };
  }, [rows, today]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-sb-outline-variant/40 px-4 py-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sb-primary-soft text-sb-primary"><Hourglass className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Stock por antigüedad</h3>
          <p className="text-[11px] text-sb-on-surface-variant">Días de espera desde que arribó a Pucallpa hasta hoy, por nave y distrito: lo de la izquierda lleva más tiempo esperando consolidación</p>
        </div>
        {data && (
          <div className="flex flex-wrap gap-2 text-[11px]">
            {data.oldest && (
              <span className="rounded-full bg-sb-surface-container px-2.5 py-1">
                Más antigua: <b className={tone(data.days(data.oldest.arribo))}>{data.days(data.oldest.arribo)} días</b> · {data.oldest.nave ?? "sin nave"}
              </span>
            )}
            <span className={cn("rounded-full px-2.5 py-1", data.old30 ? "bg-sb-late-soft text-sb-late" : "bg-sb-surface-container")}>
              <b className="tabular-nums">{n(data.old30)}</b> de {n(data.total)} unid. con 30 días o más
            </span>
          </div>
        )}
      </div>

      {!rows && <div className="m-3 h-40 animate-pulse rounded-xl bg-sb-surface-container-low" />}
      {rows && !data && <p className="px-4 py-10 text-center text-xs text-sb-on-surface-variant">No hay unidades en almacén.</p>}
      {data && (
        <div className="sb-aging scroll-hidden overflow-x-auto pb-1">
          <table className="w-max min-w-full border-separate border-spacing-x-0 border-spacing-y-0 text-xs tabular-nums">
            <thead>
              {/* Una ficha por llegada: días de espera (en color), fecha de arribo y nave */}
              <tr>
                <th rowSpan={2} className="sb-aging-sticky sticky left-0 z-10 min-w-[8.5rem] sm:min-w-[10.5rem] px-3 pb-2 pt-3 text-left align-bottom text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">
                  Distrito<span className="block text-[9px] font-normal normal-case tracking-normal opacity-80">espera máxima</span>
                </th>
                {data.batches.map((b) => {
                  const span = KINDS.filter(({ k }) => b[k] > 0).length, d = data.days(b.arribo);
                  return (
                    <th key={b.key} colSpan={span} className="px-1 pt-3 align-bottom">
                      <div className={cn("sb-aging-head mx-auto flex min-w-[5.5rem] flex-col items-center rounded-[var(--sb-aging-hr,16px)] px-3 py-2 text-center", head(d))}>
                        <span className={cn("text-xl font-semibold leading-none", tone(d))}>{d ?? "—"}<span className="ml-0.5 text-[10px] font-medium">{d === 1 ? "día" : "días"}</span></span>
                        <span className="mt-1.5 whitespace-nowrap text-[11px] font-semibold capitalize text-sb-on-surface">{b.arribo ? short(b.arribo) : "Sin arribo"}</span>
                        <span className="block max-w-[7.5rem] truncate whitespace-nowrap font-mono text-[10px] font-normal text-sb-on-surface-variant" title={b.nave ?? ""}>{b.nave ?? "sin nave"}</span>
                      </div>
                    </th>
                  );
                })}
                <th rowSpan={2} aria-hidden className="w-full" />
                <th rowSpan={2} className="sb-aging-sticky sticky right-0 z-10 px-3 pb-2 text-right align-bottom text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">Total</th>
              </tr>
              <tr>
                {data.cols.map((c) => (
                  <th key={`${c.batch.key}|${c.k}`} className="px-1 pb-2 pt-1.5 text-center text-[10px] font-semibold" style={{ color: c.color }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.districts.map((d, di) => {
                const z = zoneOf(d), prev = data.districts[di - 1], next = data.districts[di + 1];
                const joinUp = !!prev && z !== d && zoneOf(prev) === z, joinDown = !!next && z !== d && zoneOf(next) === z;
                const row = data.cols.map((c) => data.get(d, c));
                // Lo más antiguo que espera este distrito
                const max = data.cols.reduce<number | null>((m, c, i) => { const x = data.days(c.batch.arribo); return row[i] && x !== null && (m === null || x > m) ? x : m; }, null);
                const line = !joinUp && di > 0 && "border-t border-sb-outline-variant/30";
                return (
                  <tr key={d} className="group">
                    <td className={cn("sb-aging-sticky sticky left-0 z-10 px-3 py-2 group-hover:bg-sb-surface-container-low", line)}>
                      <span className="relative flex items-center justify-between gap-2 pl-2.5">
                        {(joinUp || joinDown) && <span aria-hidden className={cn("absolute -bottom-2 -top-2 left-0 w-[3px] bg-sb-primary/60", !joinUp && "top-0 rounded-t-full", !joinDown && "bottom-0 rounded-b-full")} />}
                        <span className="whitespace-nowrap font-semibold uppercase">{d}</span>
                        {max !== null && <span className={cn("sb-aging-chip shrink-0 rounded-[var(--sb-aging-r,999px)] px-1.5 py-px text-[10px] font-semibold", head(max), tone(max))}>{max} d</span>}
                      </span>
                    </td>
                    {row.map((v, i) => (
                      <td key={i} className={cn("px-1 py-1.5 text-center group-hover:bg-sb-surface-container-low", line, band(data.days(data.cols[i].batch.arribo)))}>
                        {v ? (
                          <span className="sb-aging-chip inline-flex min-w-[2.25rem] justify-center rounded-[var(--sb-aging-r,999px)] px-2 py-1 font-semibold"
                            style={{ color: data.cols[i].color, background: `color-mix(in oklab, ${data.cols[i].color} 13%, transparent)` }}>{n(v)}</span>
                        ) : <span className="text-sb-on-surface-variant/30">·</span>}
                      </td>
                    ))}
                    <td className={cn(line, "group-hover:bg-sb-surface-container-low")} />
                    <td className={cn("sb-aging-sticky sticky right-0 z-10 px-3 py-2 text-right text-sm font-semibold group-hover:bg-sb-surface-container-low", line)}>
                      {n(row.reduce((t, v) => t + v, 0))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="sb-aging-sticky sticky left-0 z-10 border-t-2 border-sb-outline-variant/60 px-3 py-2.5">Total</td>
                {data.cols.map((c, i) => (
                  <td key={i} className={cn("border-t-2 border-sb-outline-variant/60 px-1 py-2.5 text-center", band(data.days(c.batch.arribo)))} style={{ color: c.color }}>
                    {n(c.batch[c.k])}
                  </td>
                ))}
                <td className="border-t-2 border-sb-outline-variant/60" />
                <td className="sb-aging-sticky sticky right-0 z-10 border-t-2 border-sb-outline-variant/60 px-3 py-2.5 text-right text-base">{n(data.total)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-[10px] text-sb-on-surface-variant">
            <span><b style={{ color: W2 }}>2W</b> motos · <b style={{ color: W3 }}>3W</b> motokares</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-sb-late-soft" /> 30 días o más</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-500/25" /> 15 a 29 días</span>
            <span>«espera máxima»: lo más antiguo que tiene cada distrito</span>
          </p>
        </div>
      )}
    </Card>
  );
}
