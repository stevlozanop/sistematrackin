/**
 * Lectura del Excel (HSP-OFICIAL y PCL-FACT). No depende del servidor: el navegador lo usa para leer
 * el archivo en su lado y enviar solo las filas (Vercel no acepta subir un Excel de 30 MB).
 */
import * as XLSX from "xlsx";
import { DATE_FIELDS, type DateField, type Site } from "./hsp";
import { roadRoute } from "./yur";

/** Una fila del Excel ya normalizada al formato de la tabla `units`. */
export type UnitRow = {
  site: Site;
  chassis: string;
  dealer: string | null;
  fields: Record<(typeof TEXT_FIELDS)[number], string | null>;
  billing_date: string | null;
  dates: Partial<Record<DateField, string | null>>;
};

export const TEXT_FIELDS = [
  "motor", "lote", "material", "category", "order_sap", "invoice", "delivery", "guia", "center",
  "dealer_group", "department", "district", "route", "nave", "container", "carrier", "plan_almacen",
  "driver", "gm_com", "observation", "delay_reason",
] as const;

export type ImportFormat = "HSP" | "FACT";

/** Normaliza encabezados: sin tildes, minúsculas, espacios simples. */
export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Columnas de cada formato: campo -> posibles encabezados (normalizados). */
export const MAP = {
  PCL: {
    billing_date: ["fecha de facturacion"],
    dealer: ["nombre tienda"],
    department: ["departamento"],
    district: ["distrito"],
    order_sap: ["pedido sap"],
    invoice: ["factura sunat"],
    material: ["codigo material"],
    category: ["tipo"],
    lote: ["lote"],
    motor: ["numero motor"],
    chassis: ["numero chasis"],
    delivery: ["numero de entrega"],
    guia: ["guias de remision"],
    center: ["cl"],
    carrier: ["tramo final"],
    container: ["contenedor"],
    plan_almacen: ["plan almacen"],
    nave: ["nave"],
    observation: ["observacion"],
    delay_reason: ["detalle", "rt"],
    d_zarpe: ["zarpe iqt"],
    d_arribo: ["arribo pcl"],
    d_almacen: ["fecha entrega almacen"],
    d_despacho: ["despacho de almacen"],
    d_alm_lima: ["fecha entrega almacen transportista lima"],
    d_sal_lima: ["fecha salida almacen transportista lima"],
    d_entrega: ["fecha entrega dealer"],
  },
  YUR: {
    billing_date: ["fecha facturacion"],
    dealer: ["destinatario"],
    motor: ["numero motor"],
    chassis: ["numero chasis"],
    guia: ["guia remision"],
    material: ["codigo material"],
    delivery: ["numero entrega"],
    category: ["tipo"],
    dealer_group: ["dealer"],
    district: ["distrito"],
    route: ["ruta"],
    order_sap: ["pedido sap"],
    invoice: ["factura sunat"],
    lote: ["lote"],
    nave: ["nave"],
    gm_com: ["gm/com"],
    observation: ["observacion", "obs."],
    container: ["ctn"],
    driver: ["chofer"],
    delay_reason: ["demora", "auxiliar-dem"],
    d_carga: ["fecha d carga"],
    d_zarpe: ["fecha de zarpe"],
    d_arribo: ["arribo_yur"],
    d_almacen: ["enapu_yurimaguas"],
    d_despacho: ["fecha despacho"],
    d_entrega: ["fecha entrega r."],
  },
  FACT: {
    billing_date: ["fecha facturacion"],
    dealer: ["nombre tienda"],
    department: ["departamento"],
    district: ["distrito"],
    order_sap: ["numero pedido sap"],
    invoice: ["factura sunat"],
    material: ["codigo material"],
    category: ["categoria"],
    lote: ["lote"],
    motor: ["numero motor"],
    chassis: ["numero chasis"],
    delivery: ["numero entrega"],
    guia: ["guia remision"],
    center: ["centro logistico"],
  },
} as const;

/** Fecha del Excel (número de serie, Date o texto d/m/aaaa) -> "aaaa-mm-dd". */
export function toIso(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

export const text = (v: unknown, max = 160) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

/** Todos los encabezados conocidos (de los tres formatos), para ubicar la fila de títulos. */
const KNOWN = new Set(Object.values(MAP).flatMap((m) => Object.values(m as Record<string, readonly string[]>).flat()));

/**
 * Filas de una hoja. Los títulos no siempre están en la fila 1 (a veces arriba hay un logo, un título o
 * filas vacías): se toma, entre las primeras 20 filas, la que tenga más encabezados conocidos.
 */
export function sheetRows(ws: XLSX.WorkSheet) {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true, blankrows: false });
  let at = 0, best = 0;
  for (let i = 0; i < Math.min(20, raw.length); i++) {
    const hits = (raw[i] ?? []).filter((h) => KNOWN.has(norm(String(h ?? "")))).length;
    if (hits > best) { best = hits; at = i; }
  }
  const header = (raw[at] ?? []).map((h) => norm(String(h ?? "")));
  return { header, rows: raw.slice(at + 1) };
}

function parseSheet(ws: XLSX.WorkSheet, kind: keyof typeof MAP, site: Site): UnitRow[] {
  const { header, rows } = sheetRows(ws);
  const map = MAP[kind] as Record<string, readonly string[]>;
  const idx: Record<string, number> = {};
  for (const [field, names] of Object.entries(map)) {
    const i = names.map((n) => header.indexOf(n)).find((i) => i >= 0);
    if (i !== undefined) idx[field] = i;
  }
  const get = (r: unknown[], f: string) => (idx[f] === undefined ? undefined : r[idx[f]]);
  const out: UnitRow[] = [];
  for (const r of rows) {
    const chassis = text(get(r, "chassis"), 40);
    if (!chassis) continue;
    const fields = {} as UnitRow["fields"];
    for (const f of TEXT_FIELDS) fields[f] = text(get(r, f), f === "observation" ? 500 : 120);
    if (fields.category) fields.category = fields.category.toUpperCase();
    if (fields.department) fields.department = fields.department.toUpperCase();
    if (fields.route) fields.route = fields.route.toUpperCase();
    if (fields.delay_reason) fields.delay_reason = fields.delay_reason.toUpperCase();
    if (site === "YUR" && !fields.center) fields.center = "3114";
    const dates: UnitRow["dates"] = {};
    for (const d of DATE_FIELDS) if (idx[d] !== undefined) dates[d] = toIso(get(r, d));
    out.push({ site, chassis, dealer: text(get(r, "dealer")), fields, billing_date: toIso(get(r, "billing_date")), dates });
  }
  return out;
}

/** Detecta el formato y devuelve las filas. HSP-OFICIAL = hojas PCL y/o YUR; PCL-FACT = facturación diaria. */
export function parseWorkbook(buf: ArrayBuffer | Uint8Array): { format: ImportFormat; rows: UnitRow[] } {
  const wb = XLSX.read(buf, { type: "array", dense: true });
  const find = (name: string) => wb.SheetNames.find((n) => norm(n) === norm(name));
  const pcl = find("PCL"), yur = find("YUR");
  if (pcl || yur) {
    const rows = [
      ...(pcl ? parseSheet(wb.Sheets[pcl], "PCL", "PCL") : []),
      ...(yur ? parseSheet(wb.Sheets[yur], "YUR", "YUR") : []),
    ];
    if (rows.length) return { format: "HSP", rows };
  }
  // Facturación: se leen TODAS las hojas (tablas) que tengan «Número Chasis» y «Nombre Tienda», no solo la primera
  const fact: UnitRow[] = [];
  for (const n of wb.SheetNames) {
    const { header } = sheetRows(wb.Sheets[n]);
    if (header.includes("numero chasis") && header.includes("nombre tienda")) fact.push(...parseSheet(wb.Sheets[n], "FACT", "PCL"));
  }
  if (fact.length) return { format: "FACT", rows: fact };
  throw new Error(
    'No se reconoce el Excel. Usa el HSP-OFICIAL (hojas "PCL" y "YUR") o el PCL-FACT de facturación (columnas "Número Chasis" y "Nombre Tienda").',
  );
}

/**
 * Junta filas del mismo chasis (repetidas en una hoja, en varias hojas o en varios Excel).
 * Van en orden (del archivo más antiguo al más nuevo): cada dato que trae una fila posterior reemplaza
 * al anterior, pero una celda vacía nunca borra lo que ya se tenía. Así un Excel viejo + uno nuevo
 * se suman y quedan las fechas más recientes.
 */
export function dedupe(rows: UnitRow[]) {
  const m = new Map<string, UnitRow>();
  for (const r of rows) {
    const k = `${r.site}|${r.chassis.toUpperCase()}`;
    const p = m.get(k);
    if (!p) { m.set(k, { ...r, fields: { ...r.fields }, dates: { ...r.dates } }); continue; }
    if (r.dealer) p.dealer = r.dealer;
    if (r.billing_date) p.billing_date = r.billing_date;
    for (const f of TEXT_FIELDS) if (r.fields[f]) p.fields[f] = r.fields[f];
    for (const [d, v] of Object.entries(r.dates) as [DateField, string | null][]) {
      if (v) p.dates[d] = v;
      else if (!(d in p.dates)) p.dates[d] = null;
    }
  }
  return [...m.values()];
}


/* ---------- Ruta por distrito (facturación oficial) ---------- */

/** Ruta y plazo de un distrito (tabla district_routes). department vacío = cualquier departamento. */
export type DistrictRoute = { district: string; department: string; site: Site; days: number };

const up = (v: string | null | undefined) => norm(String(v ?? "")).toUpperCase();

/**
 * Ruta de una unidad según su distrito: primero el distrito + departamento, después el distrito solo.
 * Si el distrito es de la ruta Yurimaguas va por YUR; si no, por defecto por PCL (Pucallpa).
 */
export function routeOf(routes: DistrictRoute[], district: string | null, department: string | null): Site {
  const d = up(district), dep = up(department);
  const exact = routes.find((r) => up(r.district) === d && r.department && up(r.department) === dep);
  const any = routes.find((r) => up(r.district) === d && !r.department);
  return (exact ?? any)?.site === "YUR" ? "YUR" : "PCL";
}

/** Facturación (PCL-FACT / FACT HSP-DATA): cada fila toma la ruta de su distrito. */
export function applyRoutes(rows: UnitRow[], routes: DistrictRoute[]) {
  for (const r of rows) {
    r.site = routeOf(routes, r.fields.district, r.fields.department);
    // Yurimaguas: la ruta de carretera (Oriente 1…5, Norte 1) se deduce del distrito
    if (r.site === "YUR" && !r.fields.route) {
      const road = roadRoute(r.fields.district);
      if (road) r.fields.route = road;
    }
  }
  return rows;
}
