/**
 * Ruta Yurimaguas (YUR): distinta de PCL.
 * - Iquitos → Yurimaguas por río en chata (EDUARDO 01…07, 1H…7H), con las motos sueltas: sin contenedores.
 * - En Yurimaguas: arribo al puerto, ingreso a ENAPU y despacho en camión por la carretera (IIRSA Norte)
 *   a 6 rutas: Oriente 1 (Yurimaguas, entrega local), Oriente 2 (Tarapoto), Oriente 3 (Juanjuí),
 *   Oriente 4 (Moyobamba, Nueva Cajamarca, Rioja), Oriente 5 (Jaén, Bagua, Chachapoyas) y Norte 1 (Piura, Chiclayo…).
 * Metas por tramo: lo normal (8 de cada 10 envíos) según el historial del Excel HSP-OFICIAL, hoja YUR.
 */

/** Chatas de la ruta (se suman las que aparezcan en los datos) */
export const YUR_CHATAS = [
  "EDUARDO 01", "EDUARDO 02", "EDUARDO 03", "EDUARDO 04", "EDUARDO 05", "EDUARDO 06", "EDUARDO 07",
  "EDUARDO 1H", "EDUARDO 2H", "EDUARDO 3H", "EDUARDO 4H", "EDUARDO 5H", "EDUARDO 6H", "EDUARDO 7H",
];

/** Rutas de carretera desde Yurimaguas, con sus destinos y días de camión normales */
export const YUR_ROUTES: { route: string; label: string; places: string; days: number; local?: boolean }[] = [
  { route: "RUTA ORIENTE 1", label: "Oriente 1", places: "Yurimaguas (entrega local)", days: 0, local: true },
  { route: "RUTA ORIENTE 2", label: "Oriente 2", places: "Tarapoto", days: 3 },
  { route: "RUTA ORIENTE 3", label: "Oriente 3", places: "Juanjuí", days: 2 },
  { route: "RUTA ORIENTE 4", label: "Oriente 4", places: "Moyobamba · Nueva Cajamarca · Rioja", days: 2 },
  { route: "RUTA ORIENTE 5", label: "Oriente 5", places: "Jaén · Bagua · Bagua Grande · Chachapoyas", days: 2 },
  { route: "RUTA NORTE 1", label: "Norte 1", places: "Piura · Chiclayo · Sullana · Chota", days: 4 },
];
export const routeInfo = (route?: string | null) => YUR_ROUTES.find((r) => r.route === String(route ?? "").toUpperCase()) ?? null;

/**
 * Ruta de carretera de cada distrito, sacada del historial (Excel HSP-OFICIAL, hoja YUR): cada distrito
 * siempre salió por la misma ruta. La facturación trae el distrito pero no la ruta, así que se pone sola.
 */
const DISTRICT_ROUTE: Record<string, string> = {
  YURIMAGUAS: "RUTA ORIENTE 1",
  TARAPOTO: "RUTA ORIENTE 2",
  JUANJUI: "RUTA ORIENTE 3",
  MOYOBAMBA: "RUTA ORIENTE 4", "NVA. CAJAMARCA": "RUTA ORIENTE 4", "NUEVA CAJAMARCA": "RUTA ORIENTE 4", RIOJA: "RUTA ORIENTE 4",
  JAEN: "RUTA ORIENTE 5", BAGUA: "RUTA ORIENTE 5", "BAGUA GRANDE": "RUTA ORIENTE 5", CHACHAPOYAS: "RUTA ORIENTE 5",
  PIURA: "RUTA NORTE 1", CHICLAYO: "RUTA NORTE 1", SULLANA: "RUTA NORTE 1", CHOTA: "RUTA NORTE 1", PAITA: "RUTA NORTE 1",
  PARINAS: "RUTA NORTE 1", TRUJILLO: "RUTA NORTE 1", CHIMBOTE: "RUTA NORTE 1", HUARAZ: "RUTA NORTE 1", CHEPEN: "RUTA NORTE 1",
  PACASMAYO: "RUTA NORTE 1", "LA VICTORIA": "RUTA NORTE 1",
};
const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toUpperCase();

/** Ruta que le toca a un distrito (null si el distrito no se conoce) */
export function roadRoute(district?: string | null) {
  if (!district) return null;
  return DISTRICT_ROUTE[key(district)] ?? null;
}

/** Distritos conocidos de una ruta (para mostrarlos) */
export const routeDistricts = (route: string) => Object.entries(DISTRICT_ROUTE).filter(([, r]) => r === route).map(([d]) => d);

/** Metas de días por tramo */
export const YUR_TARGET = { iquitos: 3, rio: 6, puerto: 5 };

type Dates = { billing_date?: string | null; d_carga?: string | null; d_zarpe?: string | null; d_arribo?: string | null; d_almacen?: string | null; d_despacho?: string | null; d_entrega?: string | null; route?: string | null };
export type Tramo = { key: "iquitos" | "rio" | "puerto" | "carretera"; label: string; detail: string; days: number | null; target: number; running: boolean; late: boolean; reason: string };

const ms = (s: string) => Date.parse(`${String(s).slice(0, 10)}T12:00:00Z`);
const diff = (a?: string | null, b?: string | null) => (a && b ? Math.round((ms(b) - ms(a)) / 864e5) : null);

/**
 * Los 4 tramos de una unidad de YUR con los días que lleva (o tardó) cada uno frente a su meta,
 * y el motivo de demora que corresponde si se pasó.
 */
export function yurTramos(u: Dates, today: string): Tramo[] {
  const r = routeInfo(u.route);
  const leg = (key: Tramo["key"], label: string, detail: string, from: string | null | undefined, to: string | null | undefined, target: number, reason: string): Tramo => {
    const running = !!from && !to;
    const days = from ? diff(from, to ?? today) : null;
    return { key, label, detail, days, target, running, late: days !== null && days > target, reason };
  };
  // En el puerto de Yurimaguas, el motivo depende de dónde se quedó: sin ingresar a ENAPU o sin despachar
  const portReason = u.d_arribo && (!u.d_almacen || (diff(u.d_arribo, u.d_almacen) ?? 0) > 1) ? "DEMORA DESEMBARQUE" : "DEMORA DESPACHO";
  return [
    leg("iquitos", "Iquitos", "facturación → zarpe", u.billing_date, u.d_zarpe, YUR_TARGET.iquitos, "DEMORA ZARPE"),
    leg("rio", "Río", "zarpe → arribo a Yurimaguas", u.d_zarpe, u.d_arribo, YUR_TARGET.rio, "DEMORA T.F"),
    leg("puerto", "Puerto Yurimaguas", "arribo → ENAPU → despacho", u.d_arribo, u.d_despacho, YUR_TARGET.puerto, portReason),
    leg("carretera", "Carretera", r ? `${r.label}: ${r.places}` : "despacho → entrega al dealer", u.d_despacho, u.d_entrega, r?.days ?? 2, "DEMORA EN ENTREGA"),
  ];
}

/** Tramo con más días de atraso (para sugerir el motivo de demora) */
export function worstTramo(t: Tramo[]) {
  return t.filter((x) => x.late).sort((a, b) => (b.days! - b.target) - (a.days! - a.target))[0] ?? null;
}
