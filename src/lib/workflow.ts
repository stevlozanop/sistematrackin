/** Reglas de edición por etapas: orden estricto, bloqueo y encargados. Se usa en el servidor y en la pantalla. */
import { SITE_INFO, type DateField, type Site } from "./hsp";

/** dev/admin = super admin · operator = encargado · viewer = solo lectura de todo (Honda) · dealer = solo sus unidades */
export type Role = "dev" | "admin" | "operator" | "viewer" | "dealer";
export type Stage = { site: Site; field: DateField };

/** dev y admin = super admin: ven todo, cargan Excel y pueden corregir fechas bloqueadas. */
export const isSuper = (role?: Role | null) => role === "dev" || role === "admin";

/** Ve todas las unidades (sin poder editar si es viewer). */
export const seesAll = (role?: Role | null) => role === "dev" || role === "admin" || role === "viewer";

export const ROLE_LABEL: Record<Role, string> = { dev: "SWM Labs", admin: "Supervisor", operator: "Encargado", viewer: "Solo lectura", dealer: "Dealer" };

/** Código de empresa según su orden de registro: 1 -> «EMP-01». */
export const companyCode = (id: number) => `EMP-${String(id).padStart(2, "0")}`;

/** Etiqueta de la cuenta: la cuenta principal de una empresa se llama «Empresa» (no «Supervisor»). */
export const roleLabel = (role: Role, owner?: boolean | number | null) => (role === "admin" && Number(owner) ? "Empresa" : ROLE_LABEL[role]);

/**
 * Áreas de trabajo: al crear un encargado se elige su área y las etapas se asignan solas.
 * carrier = el área es de transporte y puede limitarse a una empresa (solo ve sus unidades).
 */
export type Area = {
  id: string; label: string; tag: string; site: Site | null; fields: DateField[]; carrier?: boolean; desc: string;
};
export const AREAS: Area[] = [
  { id: "PUERTO_IQT_PCL", label: "Puerto Iquitos · PCL", tag: "iquitospcl", site: "PCL", fields: ["d_zarpe"], desc: "Registra el zarpe de la nave desde Iquitos." },
  { id: "RECEPCION_PCL", label: "Recepción Pucallpa", tag: "recepcionpcl", site: "PCL", fields: ["d_arribo"], desc: "Registra la llegada de la nave a Pucallpa." },
  { id: "ALMACEN_PCL", label: "Almacén / Stock PCL", tag: "almacenpcl", site: "PCL", fields: ["d_almacen", "d_despacho"], desc: "Registra el ingreso al almacén y el despacho, indicando qué transporte lleva la unidad." },
  { id: "TRANSPORTE_LIMA", label: "Transporte Lima", tag: "transportelima", site: "PCL", fields: ["d_alm_lima", "d_sal_lima"], carrier: true, desc: "Registra la entrega y la salida del almacén de Lima." },
  { id: "TRANSPORTE_PCL", label: "Transporte tramo final · PCL", tag: "transportepcl", site: "PCL", fields: ["d_entrega"], carrier: true, desc: "Registra la entrega de la unidad al dealer." },
  { id: "PUERTO_IQT_YUR", label: "Puerto Iquitos · YUR", tag: "iquitosyur", site: "YUR", fields: ["d_carga", "d_zarpe"], desc: "Registra la carga y el zarpe de la nave hacia Yurimaguas." },
  { id: "ALMACEN_YUR", label: "Almacén Yurimaguas", tag: "almacenyur", site: "YUR", fields: ["d_arribo", "d_almacen", "d_despacho"], desc: "Registra el arribo, el ingreso a ENAPU y el despacho." },
  { id: "TRANSPORTE_YUR", label: "Transporte · YUR", tag: "transporteyur", site: "YUR", fields: ["d_entrega"], desc: "Registra la entrega de la unidad al dealer." },
  { id: "CUSTOM", label: "Personalizado", tag: "encargado", site: null, fields: [], desc: "Eliges a mano las etapas." },
];
export const areaOf = (id?: string | null) => AREAS.find((a) => a.id === id) ?? null;
export const areaStages = (a: Area): Stage[] => (a.site ? a.fields.map((field) => ({ site: a.site!, field })) : []);

type Dates = Partial<Record<DateField, string | null>> & { via_lima?: number | boolean | null };

/**
 * Etapa que se puede llenar ahora (la siguiente a la última con fecha), en orden estricto.
 * PCL con dealer de Ruta Lima: 5 despacho → 5.1 almacén Lima → 5.2 salida Lima → 6 entrega. Los demás: 5 → 6.
 * Debe coincidir con la columna next_step de la vista v_units.
 */
export function allowedNext(site: Site, u: Dates): DateField[] {
  if (u.d_entrega) return [];
  if (site === "PCL") {
    if (u.d_sal_lima) return ["d_entrega"];
    if (u.d_alm_lima) return ["d_sal_lima"];
    if (u.d_despacho) return [Number(u.via_lima) ? "d_alm_lima" : "d_entrega"];
    if (u.d_almacen) return ["d_despacho"];
    if (u.d_arribo) return ["d_almacen"];
    if (u.d_zarpe) return ["d_arribo"];
    return ["d_zarpe"];
  }
  if (u.d_despacho) return ["d_entrega"];
  if (u.d_almacen) return ["d_despacho"];
  if (u.d_arribo) return ["d_almacen"];
  if (u.d_zarpe) return ["d_arribo"];
  if (u.d_carga) return ["d_zarpe"];
  return ["d_carga"];
}

/** Fecha más reciente de las etapas anteriores: la nueva fecha no puede ser menor. */
export function previousDate(site: Site, u: Dates, field: DateField): string | null {
  const order = SITE_INFO[site].dates.map((d) => d.key);
  const before = order.slice(0, order.indexOf(field));
  return before.map((k) => u[k]).filter((v): v is string => !!v).sort().at(-1) ?? null;
}

/** SQL (sobre v_units) de las unidades que esperan esta etapa. */
export function pendingSql(_site: Site, field: DateField): string {
  return `next_step = '${field}'`;
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * ¿Puede este usuario poner esta fecha en esta unidad? Devuelve null si sí, o el motivo si no.
 * El super admin puede corregir cualquier fecha (incluso bloqueada o vacía).
 */
export function checkDateEdit(
  role: Role, stages: Stage[], site: Site, u: Dates & { carrier?: string | null }, field: DateField, value: string | null,
  carrier?: string | null,
): string | null {
  if (isSuper(role)) return null;
  if (!stages.some((s) => s.site === site && s.field === field)) return "Esta etapa no está asignada a ti";
  if (carrier && (u.carrier ?? "").toUpperCase() !== carrier.toUpperCase()) return "La unidad es de otra empresa de transporte";
  if (u[field]) return "La fecha ya fue registrada y está bloqueada";
  if (!value) return "Indica la fecha";
  if (!allowedNext(site, u).includes(field)) return "Primero debe registrarse la etapa anterior";
  if (value > today()) return "No se puede registrar una fecha futura";
  const prev = previousDate(site, u, field);
  if (prev && value < prev) return "La fecha no puede ser anterior a la de la etapa previa";
  return null;
}

/**
 * ¿Al registrar esta fecha la unidad queda (o ya está) fuera de tiempo y todavía no tiene motivo de demora?
 * En ese caso se pide el motivo antes de guardar.
 */
export function needsDelayReason(
  u: { est_date?: string | null; delay_reason?: string | null }, value: string | null, newReason?: string | null,
) {
  if (!value || !u.est_date || u.delay_reason || newReason) return false;
  return value > u.est_date || today() > u.est_date;
}

export const stageLabel = (site: Site, field: string) =>
  SITE_INFO[site].dates.find((d) => d.key === field)?.label ?? (field === "delay_reason" ? "Motivo de demora" : field);

/** Dominio de los usuarios del sistema (solo sirve para entrar; no tiene que ser un correo real). */
export const USER_DOMAIN = "trackin.pe";

/**
 * Usuario sugerido: 3 letras del nombre + apellido + "." + área.
 * Ej.: "Steven Lozano", Almacén PCL -> stelozano.almacenpcl@trackin.pe
 */
export function suggestEmail(fullName: string, role: "admin" | "operator" | "viewer" | "dealer", areaId?: string | null) {
  const words = fullName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  // 2-3 palabras: nombre + 1er apellido (2da palabra). 4 o más: nombre, 2do nombre, apellidos -> 3ra palabra.
  const last = words.length >= 4 ? words[2] : words[1] ?? "";
  const base = last ? words[0].slice(0, 3) + last : words[0];
  const tag = role === "admin" ? "supervisor" : role === "viewer" ? "lectura" : role === "dealer" ? "dealer" : areaOf(areaId)?.tag ?? "encargado";
  return `${base}.${tag}@${USER_DOMAIN}`;
}
