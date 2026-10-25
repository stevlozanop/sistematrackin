/** Definiciones del Excel HSP-OFICIAL: módulos PCL (Pucallpa) y YUR (Yurimaguas). */

export type Site = "PCL" | "YUR";
export const SITES: Site[] = ["PCL", "YUR"];

export type DateField =
  | "d_carga" | "d_zarpe" | "d_arribo" | "d_almacen" | "d_despacho" | "d_alm_lima" | "d_sal_lima" | "d_entrega";
export const DATE_FIELDS: DateField[] = [
  "d_carga", "d_zarpe", "d_arribo", "d_almacen", "d_despacho", "d_alm_lima", "d_sal_lima", "d_entrega",
];

export type Status =
  | "IQT-PORT" | "TRANSITO FLUVIAL" | "ARRIBO PUERTO" | "EN ALMACÉN" | "TRANSITO DEALER" | "EN ALMACÉN LIMA"
  | "TRANSITO DEALER 2" | "ENTREGADO";
export type Service = "A TIEMPO" | "FUERA DE TIEMPO";

export const SITE_INFO: Record<Site, {
  title: string; short: string; zoneLabel: string; zoneField: "department" | "route";
  dates: { key: DateField; n: string; label: string }[]; statuses: Status[];
}> = {
  PCL: {
    title: "PCL · Pucallpa",
    short: "PCL",
    zoneLabel: "Departamento",
    zoneField: "department",
    // n = número del paso al que lleva esa fecha (in = entrada, out = salida)
    dates: [
      { key: "d_zarpe", n: "2", label: "Zarpe IQT" },
      { key: "d_arribo", n: "3", label: "Arribo PCL" },
      { key: "d_almacen", n: "4", label: "Entrega almacén (in)" },
      { key: "d_despacho", n: "5", label: "Despacho almacén (out)" },
      { key: "d_alm_lima", n: "5.1", label: "Entrega alm. Lima (in)" },
      { key: "d_sal_lima", n: "5.2", label: "Salida alm. Lima (out)" },
      { key: "d_entrega", n: "6", label: "Entrega dealer" },
    ],
    statuses: ["IQT-PORT", "TRANSITO FLUVIAL", "ARRIBO PUERTO", "EN ALMACÉN", "TRANSITO DEALER", "EN ALMACÉN LIMA", "TRANSITO DEALER 2", "ENTREGADO"],
  },
  YUR: {
    title: "YUR · Yurimaguas",
    short: "YUR",
    zoneLabel: "Ruta",
    zoneField: "route",
    dates: [
      { key: "d_carga", n: "1", label: "Carga en Iquitos" },
      { key: "d_zarpe", n: "2", label: "Zarpe IQT" },
      { key: "d_arribo", n: "3", label: "Arribo Yurimaguas" },
      { key: "d_almacen", n: "4", label: "Ingreso ENAPU (in)" },
      { key: "d_despacho", n: "5", label: "Despacho (out)" },
      { key: "d_entrega", n: "6", label: "Entrega dealer" },
    ],
    statuses: ["IQT-PORT", "TRANSITO FLUVIAL", "ARRIBO PUERTO", "EN ALMACÉN", "TRANSITO DEALER", "ENTREGADO"],
  },
};

// Cada fecha se muestra con su número de paso: "4. Entrega almacén (in)"
for (const info of Object.values(SITE_INFO)) for (const d of info.dates) d.label = `${d.n}. ${d.label}`;

/** Pasos del proceso (como en el Excel): 1 a 6, con 5.1 y 5.2 solo para dealers de Ruta Lima. */
export const STATUS_STEP: Record<Status, string> = {
  "IQT-PORT": "1",
  "TRANSITO FLUVIAL": "2",
  "ARRIBO PUERTO": "3",
  "EN ALMACÉN": "4",
  "TRANSITO DEALER": "5",
  "EN ALMACÉN LIMA": "5.1",
  "TRANSITO DEALER 2": "5.2",
  ENTREGADO: "6",
};
const STATUS_NAME: Record<Status, string> = {
  "IQT-PORT": "IQT-Port",
  "TRANSITO FLUVIAL": "Tránsito fluvial",
  "ARRIBO PUERTO": "Arribo puerto",
  "EN ALMACÉN": "En almacén",
  "TRANSITO DEALER": "Tránsito dealer",
  "EN ALMACÉN LIMA": "En almacén Lima",
  "TRANSITO DEALER 2": "Tránsito dealer 2",
  ENTREGADO: "Entregado",
};
/** "4. En almacén" */
export const STATUS_LABEL = Object.fromEntries(
  Object.entries(STATUS_NAME).map(([k, v]) => [k, `${STATUS_STEP[k as Status]}. ${v}`]),
) as Record<Status, string>;
export const STATUS_SHORT = STATUS_NAME;

/** Motivos de demora usados en el Excel (columnas DETALLE / DEMORA). */
export const DELAY_REASONS = [
  "OTROS",
  "DEMORA ZARPE",
  "DEMORA T.F",
  "DEMORA DESEMBARQUE",
  "DEMORA DESPACHO",
  "DEMORA EN ENTREGA",
  "FALTA DE ALMACENAMIENTO",
  "MOTIVO DE HUELGA",
  "REDIRECCIONADO",
];

export const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre",
];

export const isSite = (v: unknown): v is Site => v === "PCL" || v === "YUR";

/** "2026-10-16" -> "16/10/2026" */
export const fmtDate = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

/** Texto de la alerta según los días que faltan para la fecha estimada. */
export function daysText(days: number | null | undefined) {
  if (days === null || days === undefined) return "";
  if (days < -1) return `Vencida hace ${-days} días`;
  if (days === -1) return "Vencida ayer";
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  return `Vence en ${days} días`;
}
