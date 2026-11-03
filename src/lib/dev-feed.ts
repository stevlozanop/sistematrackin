import { query } from "./db";

/** Una interacción real en la plataforma */
export type FeedRow = {
  kind: "view" | "login" | "fail" | "logout" | "event" | "import";
  at: string; detail: string | null; extra: string | null; n: number;
  user_id: number | null; name: string | null; role: string | null; company: string | null;
};

/**
 * Todo lo que hacen las cuentas, junto y en orden: pantallas abiertas, ingresos (y fallidos),
 * fechas registradas (agrupadas por minuto, paso y ruta, para que un Excel no tape lo demás) y Excel subidos.
 */
export function feed({ kind = "all", userId = 0, withDev = false, limit = 60, days = 30 }: { kind?: string; userId?: number; withDev?: boolean; limit?: number; days?: number }) {
  return query<FeedRow>(
    `WITH f AS (
       SELECT 'view' AS kind, pv.at, pv.user_id, pv.path AS detail, NULL::text AS extra, 1 AS n
         FROM page_views pv WHERE pv.at > NOW() - make_interval(days => ?)
       UNION ALL
       SELECT a.kind::text, a.at, a.user_id, a.email::text, a.ip, 1 FROM auth_events a WHERE a.at > NOW() - make_interval(days => ?)
       UNION ALL
       SELECT 'event', date_trunc('minute', e.at), e.user_id, e.field::text, un.site::text, COUNT(*)::int
         FROM unit_events e JOIN units un ON un.id = e.unit_id WHERE e.at > NOW() - make_interval(days => ?)
         GROUP BY 2, 3, 4, 5
       UNION ALL
       SELECT 'import', b.created_at, b.user_id, b.file_name, b.kind::text, GREATEST(b.created, b.updated, b.dates)
         FROM import_batches b WHERE b.created_at > NOW() - make_interval(days => ?)
     )
     SELECT f.kind, to_char(f.at, 'YYYY-MM-DD HH24:MI:SS') AS at, f.detail, f.extra, f.n, f.user_id,
       u.name::text AS name, u.role::text AS role, c.name::text AS company
     FROM f LEFT JOIN users u ON u.id = f.user_id LEFT JOIN companies c ON c.id = u.company_id
     WHERE (?::text = 'all' OR f.kind = ?::text OR (?::text = 'auth' AND f.kind IN ('login', 'fail', 'logout')))
       AND (?::int = 0 OR f.user_id = ?::int)
       AND (?::boolean OR u.role IS NULL OR u.role <> 'dev')
     ORDER BY f.at DESC LIMIT ?`,
    [days, days, days, days, kind, kind, kind, userId, userId, withDev, limit],
  );
}
