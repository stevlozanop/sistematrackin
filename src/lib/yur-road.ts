/**
 * Carretera desde Yurimaguas (IIRSA Norte y sus ramales): pueblos, tramos con sus km y cómo se recorren.
 * Sirve para ordenar las paradas de un camión, saber si un destino queda «en el camino»
 * y ubicar cada camión sobre la carretera en el mapa 3D (sin GPS: por sus paradas y sus fechas).
 */
import { roadRoute, routeInfo } from "./yur";

export type Town = { id: string; name: string; x: number; y: number; hub?: boolean };

/** Ubicación aproximada (longitud y latitud reales, pasadas a un plano: 1° ≈ 100 unidades; y crece hacia el sur) */
const at = (lon: number, lat: number) => ({ x: Math.round((lon + 78.6) * 100), y: Math.round((-lat - 6.4) * 100) });
const T = (id: string, name: string, lon: number, lat: number, hub = false): Town => ({ id, name, ...at(lon, lat), hub });

export const TOWNS: Town[] = [
  T("YURIMAGUAS", "Yurimaguas", -76.08, -5.9, true),
  T("TARAPOTO", "Tarapoto", -76.36, -6.49),
  T("JUANJUI", "Juanjuí", -76.7, -7.18),
  T("MOYOBAMBA", "Moyobamba", -76.97, -6.03),
  T("RIOJA", "Rioja", -77.17, -6.06),
  T("NUEVA CAJAMARCA", "Nueva Cajamarca", -77.31, -5.94),
  T("PEDRO RUIZ", "Pedro Ruiz", -77.98, -5.94, true),
  T("CHACHAPOYAS", "Chachapoyas", -77.87, -6.23),
  T("BAGUA GRANDE", "Bagua Grande", -78.44, -5.76),
  T("BAGUA", "Bagua", -78.53, -5.64),
  T("JAEN", "Jaén", -78.81, -5.71),
  T("OLMOS", "Olmos", -79.75, -5.98, true),
  T("CHICLAYO", "Chiclayo", -79.84, -6.77),
  T("LA VICTORIA", "La Victoria", -79.84, -6.82),
  T("CHOTA", "Chota", -78.65, -6.56),
  T("PIURA", "Piura", -80.63, -5.19),
  T("SULLANA", "Sullana", -80.69, -4.9),
  T("PAITA", "Paita", -81.11, -5.09),
  T("PARINAS", "Pariñas", -81.27, -4.58),
  T("CHEPEN", "Chepén", -79.43, -7.22),
  T("PACASMAYO", "Pacasmayo", -79.57, -7.4),
  T("TRUJILLO", "Trujillo", -79.03, -8.11),
  T("CHIMBOTE", "Chimbote", -78.58, -9.07),
  T("HUARAZ", "Huaraz", -77.53, -9.53),
];
export const ORIGIN = "YURIMAGUAS";

/** Tramos de carretera: [desde, hasta, km]. Todo sale de Yurimaguas (un árbol: cada pueblo tiene un solo camino) */
export const ROADS: [string, string, number][] = [
  ["YURIMAGUAS", "TARAPOTO", 127], ["TARAPOTO", "JUANJUI", 140], ["TARAPOTO", "MOYOBAMBA", 110],
  ["MOYOBAMBA", "RIOJA", 22], ["RIOJA", "NUEVA CAJAMARCA", 18], ["NUEVA CAJAMARCA", "PEDRO RUIZ", 150],
  ["PEDRO RUIZ", "CHACHAPOYAS", 50], ["PEDRO RUIZ", "BAGUA GRANDE", 100], ["BAGUA GRANDE", "BAGUA", 25], ["BAGUA GRANDE", "JAEN", 60],
  ["BAGUA GRANDE", "OLMOS", 230], ["OLMOS", "CHICLAYO", 105], ["OLMOS", "PIURA", 175], ["PIURA", "SULLANA", 40], ["SULLANA", "PARINAS", 105],
  ["PIURA", "PAITA", 55], ["CHICLAYO", "LA VICTORIA", 5], ["CHICLAYO", "CHOTA", 220], ["CHICLAYO", "CHEPEN", 100],
  ["CHEPEN", "PACASMAYO", 25], ["PACASMAYO", "TRUJILLO", 105], ["TRUJILLO", "CHIMBOTE", 130], ["CHIMBOTE", "HUARAZ", 190],
];

const byId = new Map(TOWNS.map((t) => [t.id, t]));
const parent = new Map<string, { id: string; km: number }>(ROADS.map(([a, b, km]) => [b, { id: a, km }]));

const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
const ALIAS: Record<string, string> = { "NVA. CAJAMARCA": "NUEVA CAJAMARCA", "NVA CAJAMARCA": "NUEVA CAJAMARCA", TALARA: "PARINAS" };

/** Pueblo de la carretera para un distrito (null si no se conoce) */
export function townOf(district?: string | null) {
  if (!district) return null;
  const k = key(district);
  return byId.get(ALIAS[k] ?? k) ?? null;
}
export const town = (id: string) => byId.get(id)!;

/** Camino desde Yurimaguas hasta ese pueblo (lista de pueblos, empezando por Yurimaguas) */
export function pathFromOrigin(id: string): string[] {
  const out = [id];
  let cur = id;
  for (let i = 0; i < 40 && parent.has(cur); i++) { cur = parent.get(cur)!.id; out.unshift(cur); }
  return out[0] === ORIGIN ? out : [ORIGIN];
}
/** Km por carretera desde Yurimaguas */
export function kmFromOrigin(id: string) {
  let km = 0, cur = id;
  for (let i = 0; i < 40 && parent.has(cur); i++) { km += parent.get(cur)!.km; cur = parent.get(cur)!.id; }
  return km;
}
const edgeKm = (a: string, b: string) => (parent.get(b)?.id === a ? parent.get(b)!.km : parent.get(a)?.id === b ? parent.get(a)!.km : 0);

/** Camino entre dos pueblos (sube hasta el cruce común y baja) */
export function pathBetween(a: string, b: string): string[] {
  const pa = pathFromOrigin(a), pb = pathFromOrigin(b);
  let i = 0;
  while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++;
  return [...pa.slice(i - 1).reverse(), ...pb.slice(i)];
}

/** Ordena los distritos de un camión como los recorre: primero los más cercanos, ramal por ramal */
export function orderStops(districts: string[]) {
  const uniq = [...new Set(districts.filter(Boolean))];
  return uniq.sort((a, b) => {
    const ta = townOf(a), tb = townOf(b);
    if (!ta || !tb) return ta ? -1 : tb ? 1 : a.localeCompare(b);
    return kmFromOrigin(ta.id) - kmFromOrigin(tb.id);
  });
}

/**
 * ¿Todos los destinos quedan en un solo camino (sin tener que volver)? Si no, dice qué destino obliga a desviarse.
 * Ej.: Moyobamba + Jaén → en el camino. Juanjuí + Jaén → Juanjuí es otro ramal (hay que volver a Tarapoto).
 */
export function oneLine(districts: string[]) {
  const towns = orderStops(districts).map(townOf).filter(Boolean) as Town[];
  if (towns.length < 2) return { ok: true, off: [] as string[] };
  const far = towns.reduce((m, t) => (kmFromOrigin(t.id) > kmFromOrigin(m.id) ? t : m));
  const line = new Set(pathFromOrigin(far.id));
  const off = towns.filter((t) => !line.has(t.id)).map((t) => t.name);
  return { ok: off.length === 0, off, far: far.name };
}

/** ¿Este distrito queda en el camino hacia el destino más lejano del camión? */
export function onTheWay(district: string | null, farthest: string | null) {
  const t = townOf(district), f = townOf(farthest);
  if (!t || !f) return false;
  return pathFromOrigin(f.id).includes(t.id);
}

/** Días de camión hasta ese distrito (los de su ruta; mínimo 1 salvo la entrega local) */
export function daysTo(district: string | null, route?: string | null) {
  const r = routeInfo(route || roadRoute(district));
  if (!r) return 2;
  return r.local ? 0 : Math.max(1, r.days);
}

/**
 * Llegada estimada a cada parada, en el orden del camión: lo normal de su ruta desde el despacho,
 * y nunca antes de la parada anterior más el viaje entre ambas (unos 250 km por día).
 */
export function planEtas(date: string, stops: { district: string; route?: string | null }[]) {
  const add = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  let prev = date, from = ORIGIN;
  return stops.map((s) => {
    const t = townOf(s.district);
    const leg = t ? pathKm(pathBetween(from, t.id)) : 0;
    const eta = [add(date, daysTo(s.district, s.route)), add(prev, Math.round(leg / 250))].sort().pop()!;
    prev = eta; if (t) from = t.id;
    return eta;
  });
}

/** Punto de la carretera a cierta distancia (km) sobre un camino de pueblos, con su dirección */
export function pointOnPath(path: string[], km: number) {
  if (path.length < 2) { const t = byId.get(path[0] ?? ORIGIN)!; return { x: t.x, y: t.y, angle: 0 }; }
  let left = Math.max(0, km);
  for (let i = 0; i < path.length - 1; i++) {
    const a = byId.get(path[i])!, b = byId.get(path[i + 1])!, len = edgeKm(path[i], path[i + 1]) || 1;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (left <= len || i === path.length - 2) {
      const f = Math.min(1, left / len);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle };
    }
    left -= len;
  }
  const t = byId.get(path[path.length - 1])!;
  return { x: t.x, y: t.y, angle: 0 };
}
export const pathKm = (path: string[]) => path.slice(1).reduce((t, id, i) => t + edgeKm(path[i], id), 0);

/* ---------- Dónde va cada camión ---------- */

export type TripStop = { district: string; seq: number; eta: string | null; arrived_on: string | null; total: number; delivered: number };
export type TripLike = { id: number; dispatched_on: string; stops: TripStop[] };
export type TripState = "camino" | "parada" | "atrasado" | "entregado";

const day = (s: string) => Date.parse(`${s.slice(0, 10)}T12:00:00Z`);
const days = (a: string, b: string) => Math.round((day(b) - day(a)) / 864e5);

/**
 * Posición y estado del camión según sus paradas:
 * - todas entregadas → «entregado» en la última parada;
 * - llegó a la parada que sigue (sin entregar todo) → «en parada» ahí;
 * - si no, va entre la parada anterior (o Yurimaguas) y la siguiente, según los días que lleva frente a los estimados.
 */
export function tripPosition(t: TripLike, today: string) {
  const stops = [...t.stops].sort((a, b) => a.seq - b.seq);
  const done = (s: TripStop) => s.total > 0 && s.delivered >= s.total;
  const nextI = stops.findIndex((s) => !done(s));
  const townId = (s?: TripStop) => (s && townOf(s.district)?.id) || ORIGIN;
  if (nextI === -1) {
    const last = stops[stops.length - 1];
    const p = pointOnPath([townId(last)], 0);
    return { ...p, state: "entregado" as TripState, at: last?.district ?? null, next: null as TripStop | null, late: 0, progress: 1, doneStops: stops.length };
  }
  const next = stops[nextI];
  const prev = nextI > 0 ? stops[nextI - 1] : null;
  const lateDays = next.eta ? Math.max(0, days(next.eta, today)) : 0;
  if (next.arrived_on) {
    const p = pointOnPath([townId(next)], 0);
    return { ...p, state: (lateDays > 0 ? "atrasado" : "parada") as TripState, at: next.district, next, late: lateDays, progress: (nextI + 0.5) / stops.length, doneStops: nextI };
  }
  const from = prev ? townId(prev) : ORIGIN;
  const start = prev?.arrived_on ?? (prev?.eta ?? t.dispatched_on);
  const span = Math.max(1, next.eta ? days(start, next.eta) : 2);
  const f = Math.min(0.92, Math.max(0.06, days(start, today) / span));
  const path = pathBetween(from, townId(next));
  const p = pointOnPath(path, pathKm(path) * f);
  return { ...p, state: (lateDays > 0 ? "atrasado" : "camino") as TripState, at: null as string | null, next, late: lateDays, progress: (nextI + f) / stops.length, doneStops: nextI };
}

export const STATE_LABEL: Record<TripState, string> = { camino: "En camino", parada: "En parada", atrasado: "Atrasado", entregado: "Entregado" };
