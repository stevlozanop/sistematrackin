/**
 * Lectura del Excel (HSP-OFICIAL y PCL-FACT). No depende del servidor: el navegador lo usa para leer
 * el archivo en su lado y enviar solo las filas (Vercel no acepta subir un Excel de 30 MB).
 */
import * as XLSX from "xlsx";
import { DATE_FIELDS, type DateField, type Site } from "./hsp";

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

export function sheetRows(ws: XLSX.WorkSheet) {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true, blankrows: false });
  const header = (raw[0] ?? []).map((h) => norm(String(h ?? "")));
  return { header, rows: raw.slice(1) };
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
  for (const n of wb.SheetNames) {
    const { header } = sheetRows(wb.Sheets[n]);
    if (header.includes("numero chasis") && header.includes("nombre tienda")) {
      return { format: "FACT", rows: parseSheet(wb.Sheets[n], "FACT", "PCL") };
    }
  }
  throw new Error(
    'No se reconoce el Excel. Usa el HSP-OFICIAL (hojas "PCL" y "YUR") o el PCL-FACT de facturación (columnas "Número Chasis" y "Nombre Tienda").',
  );
}

/** Quita chasis repetidos dentro del mismo archivo (gana la última fila, como en el Excel). */
export function dedupe(rows: UnitRow[]) {
  const m = new Map<string, UnitRow>();
  for (const r of rows) m.set(`${r.site}|${r.chassis}`, r);
  return [...m.values()];
}

