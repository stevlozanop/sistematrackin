/**
 * Red de carreteras genérica (un árbol desde un origen): pueblos, tramos con sus km y cómo se recorren.
 * La usa la ruta Pucallpa para el mapa 3D de camiones (igual que la de Yurimaguas en yur-road.ts).
 * Sin GPS: cada camión se ubica por sus paradas y sus fechas.
 */
import type { Town, TripLike, TripState, TripStop } from "./yur-road";

export type Net = ReturnType<typeof makeNet>;

/** Ubicación aproximada (longitud y latitud reales a un plano: 1° ≈ 100 unidades; y crece hacia el sur) */
export const at = (lon: number, lat: number) => ({ x: Math.round((lon + 78.6) * 100), y: Math.round((-lat - 6.4) * 100) });
export const T = (id: string, name: string, lon: number, lat: number, hub = false): Town => ({ id, name, ...at(lon, lat), hub });

const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
const day = (s: string) => Date.parse(`${s.slice(0, 10)}T12:00:00Z`);
const days = (a: string, b: string) => Math.round((day(b) - day(a)) / 864e5);

export function makeNet(towns: Town[], roads: [string, string, number][], origin: string, alias: Record<string, string> = {}) {
  const byId = new Map(towns.map((t) => [t.id, t]));
  const parent = new Map<string, { id: string; km: number }>(roads.map(([a, b, km]) => [b, { id: a, km }]));
  const townOf = (district?: string | null) => {
    if (!district) return null;
    const k = key(district);
    return byId.get(alias[k] ?? k) ?? null;
  };
  const town = (id: string) => byId.get(id)!;
  const pathFromOrigin = (id: string): string[] => {
    const out = [id];
    let cur = id;
    for (let i = 0; i < 40 && parent.has(cur); i++) { cur = parent.get(cur)!.id; out.unshift(cur); }
    return out[0] === origin ? out : [origin];
  };
  const kmFromOrigin = (id: string) => {
    let km = 0, cur = id;
    for (let i = 0; i < 40 && parent.has(cur); i++) { km += parent.get(cur)!.km; cur = parent.get(cur)!.id; }
    return km;
  };
  const edgeKm = (a: string, b: string) => (parent.get(b)?.id === a ? parent.get(b)!.km : parent.get(a)?.id === b ? parent.get(a)!.km : 0);
  const pathBetween = (a: string, b: string): string[] => {
    const pa = pathFromOrigin(a), pb = pathFromOrigin(b);
    let i = 0;
    while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++;
    return [...pa.slice(i - 1).reverse(), ...pb.slice(i)];
  };
  const pathKm = (path: string[]) => path.slice(1).reduce((t, id, i) => t + edgeKm(path[i], id), 0);
  /** Distritos en el orden en que el camión los recorre (los más cercanos primero) */
  const orderStops = (districts: string[]) => [...new Set(districts.filter(Boolean))].sort((a, b) => {
    const ta = townOf(a), tb = townOf(b);
    if (!ta || !tb) return ta ? -1 : tb ? 1 : a.localeCompare(b);
    return kmFromOrigin(ta.id) - kmFromOrigin(tb.id);
  });
  const pointOnPath = (path: string[], km: number) => {
    if (path.length < 2) { const t = byId.get(path[0] ?? origin)!; return { x: t.x, y: t.y, angle: 0 }; }
    let left = Math.max(0, km);
    for (let i = 0; i < path.length - 1; i++) {
      const a = byId.get(path[i])!, b = byId.get(path[i + 1])!, len = edgeKm(path[i], path[i + 1]) || 1;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      if (left <= len || i === path.length - 2) { const f = Math.min(1, left / len); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle }; }
      left -= len;
    }
    const t = byId.get(path[path.length - 1])!;
    return { x: t.x, y: t.y, angle: 0 };
  };
  /** Posición y estado del camión según sus paradas (igual que en Yurimaguas) */
  const tripPosition = (t: TripLike, today: string) => {
    const stops = [...t.stops].sort((a, b) => a.seq - b.seq);
    const done = (s: TripStop) => s.total > 0 && s.delivered >= s.total;
    const nextI = stops.findIndex((s) => !done(s));
    const townId = (s?: TripStop) => (s && townOf(s.district)?.id) || origin;
    if (nextI === -1) {
      const last = stops[stops.length - 1];
      return { ...pointOnPath([townId(last)], 0), state: "entregado" as TripState, at: last?.district ?? null, next: null as TripStop | null, late: 0, progress: 1, doneStops: stops.length };
    }
    const next = stops[nextI], prev = nextI > 0 ? stops[nextI - 1] : null;
    const lateDays = next.eta ? Math.max(0, days(next.eta, today)) : 0;
    if (next.arrived_on) {
      return { ...pointOnPath([townId(next)], 0), state: (lateDays > 0 ? "atrasado" : "parada") as TripState, at: next.district, next, late: lateDays, progress: (nextI + 0.5) / stops.length, doneStops: nextI };
    }
    const from = prev ? townId(prev) : origin;
    const start = prev?.arrived_on ?? (prev?.eta ?? t.dispatched_on);
    const span = Math.max(1, next.eta ? days(start, next.eta) : 2);
    const f = Math.min(0.92, Math.max(0.06, days(start, today) / span));
    const path = pathBetween(from, townId(next));
    return { ...pointOnPath(path, pathKm(path) * f), state: (lateDays > 0 ? "atrasado" : "camino") as TripState, at: null as string | null, next, late: lateDays, progress: (nextI + f) / stops.length, doneStops: nextI };
  };
  return { towns, roads, origin, townOf, town, pathFromOrigin, kmFromOrigin, pathBetween, pathKm, orderStops, pointOnPath, tripPosition };
}
