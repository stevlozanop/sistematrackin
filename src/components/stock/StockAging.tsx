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
const tone = (d: number | null) => (d === null ? "text-sb-on-surface-variant" : d >= 30 ? "text-sb-late" : d >= 15 ? "text-amber-500" : "text-sb-on-surface");
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
        <div className="scroll-hidden overflow-x-auto">
          <table className="w-max min-w-full border-separate border-spacing-0 text-xs tabular-nums">
            <thead>
              {/* Días de espera */}
              <tr>
                <th className="sticky left-0 z-10 bg-sb-surface px-3 pb-1 pt-3 text-left text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">Días de espera</th>
                {data.batches.map((b) => {
                  const span = KINDS.filter(({ k }) => b[k] > 0).length, d = data.days(b.arribo);
                  return (
                    <th key={b.key} colSpan={span} className="border-l border-sb-outline-variant/30 px-2 pb-1 pt-3 text-center">
                      <span className={cn("text-lg font-semibold leading-none", tone(d))}>{d ?? "—"}</span>
                    </th>
                  );
                })}
                <th rowSpan={3} className="sticky right-0 z-10 border-b border-l border-sb-outline-variant/40 bg-sb-surface px-3 pb-2 align-bottom text-right text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">Total</th>
              </tr>
              {/* Arribo · nave */}
              <tr>
                <th className="sticky left-0 z-10 bg-sb-surface px-3 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">Arribo · nave</th>
                {data.batches.map((b) => (
                  <th key={b.key} colSpan={KINDS.filter(({ k }) => b[k] > 0).length} className="border-l border-sb-outline-variant/30 px-2 py-1 text-center font-normal">
                    <span className="block whitespace-nowrap text-[11px] font-semibold capitalize">{b.arribo ? short(b.arribo) : "Sin arribo"}</span>
                    <span className="block max-w-[7rem] truncate whitespace-nowrap text-[10px] text-sb-on-surface-variant" title={b.nave ?? ""}>{b.nave ?? "—"}</span>
                  </th>
                ))}
              </tr>
              {/* Tipo */}
              <tr>
                <th className="sticky left-0 z-10 border-b border-sb-outline-variant/40 bg-sb-surface px-3 pb-2 pt-1 text-left text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">Distrito</th>
                {data.cols.map((c, i) => (
                  <th key={`${c.batch.key}|${c.k}`} className={cn("border-b border-sb-outline-variant/40 px-2 pb-2 pt-1 text-center text-[10px] font-semibold", (i === 0 || data.cols[i - 1].batch !== c.batch) && "border-l border-l-sb-outline-variant/30")} style={{ color: c.color }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.districts.map((d, di) => {
                const z = zoneOf(d), prev = data.districts[di - 1], next = data.districts[di + 1];
                const joinUp = !!prev && z !== d && zoneOf(prev) === z, joinDown = !!next && z !== d && zoneOf(next) === z;
                const row = data.cols.map((c) => data.get(d, c));
                return (
                  <tr key={d} className="group">
                    <td className={cn("sticky left-0 z-10 bg-sb-surface px-3 py-2 font-semibold uppercase group-hover:bg-sb-surface-container-low", !joinUp && di > 0 && "border-t border-sb-outline-variant/30")}>
                      <span className="relative block pl-2">
                        {(joinUp || joinDown) && <span aria-hidden className={cn("absolute -bottom-2 -top-2 left-0 w-[3px] bg-sb-primary/60", !joinUp && "top-0 rounded-t-full", !joinDown && "bottom-0 rounded-b-full")} />}
                        <span className="whitespace-nowrap">{d}</span>
                      </span>
                    </td>
                    {row.map((v, i) => (
                      <td key={i} className={cn("px-2 py-2 text-center group-hover:bg-sb-surface-container-low", !joinUp && di > 0 && "border-t border-sb-outline-variant/30",
                        (i === 0 || data.cols[i - 1].batch !== data.cols[i].batch) && "border-l border-l-sb-outline-variant/30")}>
                        {v ? <span className="font-semibold" style={{ color: data.cols[i].color }}>{n(v)}</span> : null}
                      </td>
                    ))}
                    <td className={cn("sticky right-0 z-10 border-l border-sb-outline-variant/40 bg-sb-surface px-3 py-2 text-right font-semibold group-hover:bg-sb-surface-container-low", !joinUp && di > 0 && "border-t border-t-sb-outline-variant/30")}>
                      {n(row.reduce((t, v) => t + v, 0))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="sticky left-0 z-10 border-t-2 border-sb-outline-variant/60 bg-sb-surface px-3 py-2.5">Total</td>
                {data.cols.map((c, i) => (
                  <td key={i} className={cn("border-t-2 border-sb-outline-variant/60 px-2 py-2.5 text-center", (i === 0 || data.cols[i - 1].batch !== c.batch) && "border-l border-l-sb-outline-variant/30")} style={{ color: c.color }}>
                    {n(c.batch[c.k])}
                  </td>
                ))}
                <td className="sticky right-0 z-10 border-l border-t-2 border-sb-outline-variant/60 bg-sb-surface px-3 py-2.5 text-right text-sm">{n(data.total)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5 text-[10px] text-sb-on-surface-variant">
            <span><b style={{ color: W2 }}>2W</b> motos · <b style={{ color: W3 }}>3W</b> motokares</span>
            <span><b className="text-sb-late">rojo</b> 30 días o más · <b className="text-amber-500">ámbar</b> 15 a 29 días</span>
          </p>
        </div>
      )}
    </Card>
  );
}
