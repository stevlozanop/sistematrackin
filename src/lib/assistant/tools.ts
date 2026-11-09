import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { query } from "@/lib/db";
import { dealerScope } from "@/lib/clients";
import { getScope } from "@/lib/guard";
import type { Session } from "@/lib/auth";

/**
 * Herramientas de solo lectura del asistente. Todas filtran por lo que la cuenta puede ver:
 * - cliente (dealer): solo sus tiendas · encargado de transporte: solo las unidades de su empresa · el resto: todo.
 * Nada aquí escribe en la base.
 */

export type Scope = { sql: string; args: unknown[]; label: string; dealer: boolean };

export async function scopeFor(s: Session): Promise<Scope | null> {
  if (s.role === "dealer") {
    const sc = await dealerScope(s.id);
    if (!sc) return null;
    return { sql: sc.sql, args: sc.args, label: sc.client ? `solo las tiendas del cliente ${sc.client}` : "solo su tienda", dealer: true };
  }
  if (s.role === "operator") {
    const sc = await getScope(s.id);
    if (sc.carrier) return { sql: "carrier = ?", args: [sc.carrier], label: `solo las unidades de la empresa de transporte ${sc.carrier}`, dealer: false };
  }
  return { sql: "TRUE", args: [], label: "todo el sistema", dealer: false };
}

/** Unidades que esta cuenta puede ver (subconsulta) */
const V = (sc: Scope) => `(SELECT * FROM v_units WHERE ${sc.sql})`;

const SITE = z.enum(["PCL", "YUR"]).optional();
const siteSql = (site?: string) => (site ? " AND site = ?" : "");
const siteArg = (site?: string) => (site ? [site] : []);
const like = (t: string) => `%${t.trim().replace(/[%_\\]/g, "")}%`;

type Def = { tool: Anthropic.Beta.BetaTool; schema: z.ZodType; run: (input: never, sc: Scope) => Promise<unknown>; label: string };

const buscarGuia = z.object({ texto: z.string().min(3).max(40) });
const buscarUnidad = z.object({ texto: z.string().min(3).max(40) });
const resumen = z.object({ site: SITE });
const alertas = z.object({ site: SITE, tipo: z.enum(["vencidas", "por_vencer", "sin_motivo"]) });
const cambios = z.object({ horas: z.number().int().min(1).max(168).optional(), site: SITE });
const naves = z.object({ site: SITE });
const dealer = z.object({ texto: z.string().min(2).max(60) });

/** Resumen de una o varias guías de remisión: dónde está cada unidad y cómo va su plazo */
async function guiaInfo(guias: string[], sc: Scope) {
  if (!guias.length) return [];
  const base = await query<Record<string, unknown>>(
    `SELECT guia, site, MAX(dealer) dealer, MAX(district) distrito, MAX(zone) zona, COUNT(*) unidades,
            SUM(category = '2W') motos, SUM(category = '3W') motokares,
            MIN(billing_date) facturada, MIN(est_date) fecha_estimada,
            SUM(service = 'FUERA DE TIEMPO') fuera_de_tiempo, SUM(d_entrega IS NOT NULL) entregadas,
            MAX(nave) nave, string_agg(DISTINCT container, ', ') contenedores, MAX(driver) chofer, MAX(carrier) transporte,
            MAX(d_carga) embarque, MAX(d_zarpe) zarpe, MAX(d_arribo) arribo, MAX(d_almacen) almacen,
            MAX(d_despacho) despacho, MAX(d_entrega) entrega,
            string_agg(DISTINCT delay_reason, ', ') motivos_demora
     FROM ${V(sc)} v WHERE guia IN (?) GROUP BY guia, site ORDER BY guia`, [...sc.args, guias]);
  const states = await query<{ guia: string; status: string; n: number }>(
    `SELECT guia, status, COUNT(*) n FROM ${V(sc)} v WHERE guia IN (?) GROUP BY guia, status ORDER BY guia`, [...sc.args, guias]);
  const last = await query<{ guia: string; field: string; at: string; quien: string | null }>(
    `SELECT DISTINCT ON (v.guia) v.guia, e.field, DATE_FORMAT(e.at, '%Y-%m-%d %H:%i') at, us.name quien
     FROM ${V(sc)} v JOIN unit_events e ON e.unit_id = v.id LEFT JOIN users us ON us.id = e.user_id
     WHERE v.guia IN (?) ORDER BY v.guia, e.id DESC`, [...sc.args, guias]);
  const rec = await query<{ guia: string; kind: string; note: string | null; received_on: string }>(
    "SELECT guia, kind, note, received_on FROM receptions WHERE guia IN (?) ORDER BY id DESC", [guias]);
  return base.map((b) => ({
    ...b,
    estados: states.filter((x) => x.guia === b.guia).map((x) => `${x.status}: ${x.n}`),
    ultimo_registro: (({ field, at, quien }) => ({ etapa: field, cuando: at, ...(sc.dealer ? {} : { quien }) }))(last.find((l) => l.guia === b.guia) ?? { field: null, at: null, quien: null } as never),
    recepciones_del_dealer: rec.filter((r) => r.guia === b.guia).slice(0, 3),
  }));
}

export const TOOLS: Record<string, Def> = {
  buscar_guia: {
    label: "Buscando la guía",
    schema: buscarGuia,
    tool: {
      name: "buscar_guia",
      description: "Busca guías de remisión (completas o parte del número, ej. «0157233» o «09-0T005-0157233») y devuelve dónde están sus unidades: estado (etapa), cantidad de motos y motokares, dealer, nave, contenedor, chofer, fechas de cada etapa, fecha estimada de entrega, cuántas están fuera de tiempo y el último registro. Úsala para preguntas como «¿en qué parte está la guía X?».",
      input_schema: { type: "object", properties: { texto: { type: "string", description: "Número de guía completo o una parte (mínimo 3 caracteres)" } }, required: ["texto"], additionalProperties: false },
      eager_input_streaming: true,
    },
    run: async (i: z.infer<typeof buscarGuia>, sc) => {
      const found = await query<{ guia: string }>(`SELECT DISTINCT guia FROM ${V(sc)} v WHERE guia ILIKE ? ORDER BY guia LIMIT 6`, [...sc.args, like(i.texto)]);
      if (!found.length) return { encontradas: 0, nota: "No hay guías con ese número entre las unidades que esta cuenta puede ver." };
      return { encontradas: found.length, guias: await guiaInfo(found.map((f) => f.guia), sc) };
    },
  },
  buscar_unidad: {
    label: "Buscando la unidad",
    schema: buscarUnidad,
    tool: {
      name: "buscar_unidad",
      description: "Busca una unidad por número de chasis o de motor (completo o parte) y devuelve todos sus datos (estado, guía, dealer, fechas de cada etapa, fecha estimada, motivo de demora) y su historial de registros.",
      input_schema: { type: "object", properties: { texto: { type: "string", description: "Chasis o motor, completo o parte (mínimo 3 caracteres)" } }, required: ["texto"], additionalProperties: false },
      eager_input_streaming: true,
    },
    run: async (i: z.infer<typeof buscarUnidad>, sc) => {
      const units = await query<Record<string, unknown>>(
        `SELECT id, site, chassis chasis, motor, category tipo, material modelo, guia, dealer, district distrito, zone zona, status estado, service servicio,
                billing_date facturada, est_date fecha_estimada, days_left dias_restantes, alert alerta, delay_reason motivo_demora,
                nave, container contenedor, driver chofer, carrier transporte, next_step siguiente_etapa,
                d_carga embarque, d_zarpe zarpe, d_arribo arribo, d_almacen almacen, d_despacho despacho, d_alm_lima almacen_lima, d_sal_lima salida_lima, d_entrega entrega
         FROM ${V(sc)} v WHERE chassis ILIKE ? OR motor ILIKE ? ORDER BY chassis LIMIT 5`, [...sc.args, like(i.texto), like(i.texto)]);
      if (!units.length) return { encontradas: 0, nota: "No hay unidades con ese chasis o motor entre las que esta cuenta puede ver." };
      const ev = await query<{ unit_id: number; field: string; new_value: string | null; at: string; quien: string | null }>(
        `SELECT e.unit_id, e.field, e.new_value, DATE_FORMAT(e.at, '%Y-%m-%d %H:%i') at, us.name quien FROM unit_events e LEFT JOIN users us ON us.id = e.user_id
         WHERE e.unit_id IN (?) ORDER BY e.id DESC LIMIT 40`, [units.map((u) => u.id)]);
      return {
        encontradas: units.length,
        unidades: units.map(({ id, ...u }) => ({
          ...u,
          historial: ev.filter((e) => e.unit_id === id).slice(0, 8).map((e) => ({ campo: e.field, valor: e.new_value, cuando: e.at, ...(sc.dealer ? {} : { quien: e.quien }) })),
        })),
      };
    },
  },
  resumen_general: {
    label: "Revisando el resumen",
    schema: resumen,
    tool: {
      name: "resumen_general",
      description: "Resumen del momento: cuántas unidades hay en cada estado (etapa) por módulo (PCL Pucallpa, YUR Yurimaguas), cuántas fuera de tiempo, por vencer, vencidas sin motivo, y entregas del mes. Úsala para preguntas generales («¿cómo vamos?», «¿cuántas hay en almacén?»).",
      input_schema: { type: "object", properties: { site: { type: "string", enum: ["PCL", "YUR"], description: "Opcional: solo un módulo" } }, additionalProperties: false },
      eager_input_streaming: true,
    },
    run: async (i: z.infer<typeof resumen>, sc) => {
      const byState = await query(
        `SELECT site, status estado, COUNT(*) unidades, SUM(category = '2W') motos, SUM(category = '3W') motokares, SUM(service = 'FUERA DE TIEMPO') fuera_de_tiempo
         FROM ${V(sc)} v WHERE TRUE${siteSql(i.site)} GROUP BY site, status ORDER BY site, status`, [...sc.args, ...siteArg(i.site)]);
      const [k] = await query(
        `SELECT SUM(d_entrega IS NULL) pendientes, SUM(alert = 'VENCIDA') vencidas, SUM(alert = 'POR VENCER') por_vencer,
                SUM(alert = 'VENCIDA' AND delay_reason IS NULL) vencidas_sin_motivo, SUM(est_date = CURRENT_DATE AND d_entrega IS NULL) vencen_hoy,
                SUM(d_entrega >= date_trunc('month', CURRENT_DATE)::date) entregadas_este_mes,
                SUM(d_entrega >= date_trunc('month', CURRENT_DATE)::date AND service = 'A TIEMPO') entregadas_a_tiempo_este_mes
         FROM ${V(sc)} v WHERE TRUE${siteSql(i.site)}`, [...sc.args, ...siteArg(i.site)]);
      return { por_estado: byState, totales: k };
    },
  },
  alertas: {
    label: "Revisando alertas",
    schema: alertas,
    tool: {
      name: "alertas",
      description: "Lista las guías con unidades vencidas (pasaron su fecha estimada sin entregarse), por vencer, o vencidas sin motivo de demora, con su dealer, estado y días. Agrupa por guía (máximo 25).",
      input_schema: {
        type: "object",
        properties: { tipo: { type: "string", enum: ["vencidas", "por_vencer", "sin_motivo"] }, site: { type: "string", enum: ["PCL", "YUR"] } },
        required: ["tipo"], additionalProperties: false,
      },
      eager_input_streaming: true,
    },
    run: async (i: z.infer<typeof alertas>, sc) => {
      const cond = i.tipo === "vencidas" ? "alert = 'VENCIDA'" : i.tipo === "por_vencer" ? "alert = 'POR VENCER'" : "alert = 'VENCIDA' AND delay_reason IS NULL";
      const rows = await query(
        `SELECT guia, site, MAX(dealer) dealer, string_agg(DISTINCT status, ', ') estados, COUNT(*) unidades, MIN(est_date) fecha_estimada,
                MIN(days_left) dias_restantes, string_agg(DISTINCT delay_reason, ', ') motivos
         FROM ${V(sc)} v WHERE ${cond}${siteSql(i.site)} GROUP BY guia, site ORDER BY MIN(days_left), guia LIMIT 25`, [...sc.args, ...siteArg(i.site)]);
      const [t] = await query<{ n: number; g: number }>(`SELECT COUNT(*) n, COUNT(DISTINCT guia) g FROM ${V(sc)} v WHERE ${cond}${siteSql(i.site)}`, [...sc.args, ...siteArg(i.site)]);
      return { total_unidades: t?.n ?? 0, total_guias: t?.g ?? 0, mostrando: rows.length, guias: rows, nota: "dias_restantes negativo = días de atraso" };
    },
  },
  ultimos_cambios: {
    label: "Revisando los últimos registros",
    schema: cambios,
    tool: {
      name: "ultimos_cambios",
      description: "Qué se registró en el sistema en las últimas horas (por defecto 24, máximo 168): por cada registro, la etapa o dato, cuántas unidades, qué guías, quién y cuándo. Úsala para «¿qué pasó hoy?», «¿qué se despachó?», «¿ya registraron el arribo?».",
      input_schema: {
        type: "object",
        properties: { horas: { type: "integer", minimum: 1, maximum: 168 }, site: { type: "string", enum: ["PCL", "YUR"] } },
        additionalProperties: false,
      },
      eager_input_streaming: true,
    },
    run: async (i: z.infer<typeof cambios>, sc) => {
      const h = i.horas ?? 24;
      const rows = await query(
        `SELECT v.site, e.field dato, e.new_value valor, ${sc.dealer ? "" : "us.name quien, "}DATE_FORMAT(MAX(e.at), '%Y-%m-%d %H:%i') cuando,
                COUNT(DISTINCT e.unit_id) unidades, string_agg(DISTINCT v.guia, ', ') guias
         FROM unit_events e JOIN ${V(sc)} v ON v.id = e.unit_id LEFT JOIN users us ON us.id = e.user_id
         WHERE e.at > LOCALTIMESTAMP(0) - make_interval(hours => ?::int)${i.site ? " AND v.site = ?" : ""}
         GROUP BY v.site, e.field, e.new_value${sc.dealer ? "" : ", us.name"} ORDER BY MAX(e.at) DESC LIMIT 30`,
        [...sc.args, h, ...siteArg(i.site)]);
      return { horas: h, registros: (rows as Record<string, unknown>[]).map((r) => ({ ...r, guias: String(r.guias ?? "").split(", ").slice(0, 12).join(", ") })) };
    },
  },
  naves_en_camino: {
    label: "Revisando las naves",
    schema: naves,
    tool: {
      name: "naves_en_camino",
      description: "Naves (chatas y motonaves como KIARA o HENRY) con carga embarcada o navegando por el río: cuántas unidades y contenedores lleva cada una, cuándo zarpó y cuántos días lleva.",
      input_schema: { type: "object", properties: { site: { type: "string", enum: ["PCL", "YUR"] } }, additionalProperties: false },
      eager_input_streaming: true,
    },
    run: async (i: z.infer<typeof naves>, sc) => ({
      naves: await query(
        `SELECT site, COALESCE(nave, '(sin nave)') nave, status estado, COUNT(*) unidades, SUM(category = '2W') motos, SUM(category = '3W') motokares,
                COUNT(DISTINCT container) contenedores, COUNT(DISTINCT guia) guias, MIN(d_carga) primer_embarque, MAX(d_zarpe) zarpe,
                CURRENT_DATE - MAX(d_zarpe) dias_navegando, SUM(service = 'FUERA DE TIEMPO') fuera_de_tiempo
         FROM ${V(sc)} v WHERE status IN ('EMBARQUE', 'TRANSITO FLUVIAL')${siteSql(i.site)}
         GROUP BY site, nave, status ORDER BY site, MAX(d_zarpe) NULLS LAST`, [...sc.args, ...siteArg(i.site)]),
    }),
  },
  buscar_dealer: {
    label: "Buscando el dealer",
    schema: dealer,
    tool: {
      name: "buscar_dealer",
      description: "Busca un dealer o cliente (ej. «SORSA», «UCAYALI MOTORS», «ATALAYA») y devuelve sus unidades pendientes por estado, cuántas fuera de tiempo, entregadas este mes y sus guías pendientes.",
      input_schema: { type: "object", properties: { texto: { type: "string", description: "Nombre o parte del nombre del dealer, cliente o distrito" } }, required: ["texto"], additionalProperties: false },
      eager_input_streaming: true,
    },
    run: async (i: z.infer<typeof dealer>, sc) => {
      const t = like(i.texto);
      const cond = "(dealer ILIKE ? OR district ILIKE ? OR dealer_id IN (SELECT id FROM dealers WHERE client ILIKE ?))";
      const rows = await query(
        `SELECT dealer, site, status estado, COUNT(*) unidades, SUM(service = 'FUERA DE TIEMPO') fuera_de_tiempo
         FROM ${V(sc)} v WHERE ${cond} AND d_entrega IS NULL GROUP BY dealer, site, status ORDER BY dealer, site, status LIMIT 60`, [...sc.args, t, t, t]);
      const guias = await query(
        `SELECT guia, site, MAX(dealer) dealer, string_agg(DISTINCT status, ', ') estados, COUNT(*) unidades, MIN(est_date) fecha_estimada
         FROM ${V(sc)} v WHERE ${cond} AND d_entrega IS NULL GROUP BY guia, site ORDER BY MIN(est_date) LIMIT 15`, [...sc.args, t, t, t]);
      const [m] = await query(
        `SELECT COUNT(*) entregadas_este_mes FROM ${V(sc)} v WHERE ${cond} AND d_entrega >= date_trunc('month', CURRENT_DATE)::date`, [...sc.args, t, t, t]);
      return { pendientes_por_estado: rows, guias_pendientes: guias, ...m };
    },
  },
};

export const TOOL_LIST = Object.values(TOOLS).map((d) => d.tool);

/** Ejecuta una herramienta validando su entrada; devuelve el texto para el tool_result */
export async function runTool(name: string, input: unknown, sc: Scope): Promise<{ text: string; error: boolean }> {
  const def = TOOLS[name];
  if (!def) return { text: `Herramienta desconocida: ${name}`, error: true };
  const parsed = def.schema.safeParse(input ?? {});
  if (!parsed.success) return { text: JSON.stringify({ INVALID_INPUT: parsed.error.issues.map((x) => x.message).join("; ") }), error: true };
  try {
    const out = await def.run(parsed.data as never, sc);
    const text = JSON.stringify(out, (_k, v) => (v === null ? undefined : v));
    return { text: text.length > 24000 ? text.slice(0, 24000) + "…(recortado)" : text, error: false };
  } catch (e) {
    console.error("[assistant tool]", name, e);
    return { text: "Error al consultar la base de datos", error: true };
  }
}
