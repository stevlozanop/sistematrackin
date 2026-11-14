import { queryList } from "@/lib/db";

/*
 * Doble check de cada entrega: ✓ el transportista registró su entrega · ✓✓ el cliente confirmó lo recibido.
 */

/**
 * 1.er check (sobre g.ids = unidades de la guía, r = última recepción, e = primer registro de entrega):
 * el transportista registró su entrega (marca «entrega_transportista»), o —registros anteriores— la entrega
 * se registró antes que la recepción o la registró otra persona.
 */
export const CARRIER_OK = `EXISTS (SELECT 1 FROM unit_events y WHERE y.unit_id = ANY(g.ids) AND y.field = 'entrega_transportista')
  OR (e.at IS NOT NULL AND (r.id IS NULL OR e.user_id IS DISTINCT FROM r.user_id OR e.at < r.created_at - INTERVAL '5 seconds'))`;
export const LATEST_RECEPTION = "LEFT JOIN LATERAL (SELECT * FROM receptions x WHERE x.guia = g.guia ORDER BY x.created_at DESC LIMIT 1) r ON true";
export const FIRST_DELIVERY = "LEFT JOIN LATERAL (SELECT user_id, at FROM unit_events x WHERE x.unit_id = ANY(g.ids) AND x.field = 'd_entrega' ORDER BY x.at LIMIT 1) e ON true";

/** Guías que el cliente ya recibió pero el transportista no registró su entrega (les falta el 1.er check) */
export async function missingCarrier(where: string, args: unknown[]) {
  const rows = await queryList<{ guia: string }>(
    `WITH g AS (SELECT guia, array_agg(id) ids FROM v_units
       WHERE guia IS NOT NULL AND d_entrega IS NOT NULL AND d_entrega >= CURRENT_DATE - 90 AND guia IN (SELECT guia FROM receptions) AND ${where}
       GROUP BY guia)
     SELECT g.guia FROM g ${LATEST_RECEPTION} ${FIRST_DELIVERY} WHERE NOT (${CARRIER_OK})`, args);
  return rows.map((r) => r.guia);
}
