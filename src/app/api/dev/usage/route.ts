import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { guard } from "@/lib/guard";

/** Límite del plan de la base (Supabase gratis: 500 MB). Se cambia con DB_LIMIT_MB. */
const LIMIT_MB = Number(process.env.DB_LIMIT_MB) || 500;

/**
 * Consola The Iceberg Labs · Consumo real: tamaño de la base y de cada tabla, filas, lecturas y escrituras,
 * conexiones, aciertos de caché, consultas que más tiempo consumen (pg_stat_statements) y llamadas a la API por día.
 */
export async function GET() {
  const { err } = await guard(["dev"]);
  if (err) return err;
  const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
  const [[db], tables, conns, [stats], [maxc], apiDays, viewDays, eventDays] = await Promise.all([
    query<{ mb: number; version: string }>("SELECT ROUND(pg_database_size(current_database()) / 1048576.0, 2) AS mb, current_setting('server_version') AS version"),
    query(
      `SELECT s.relname AS name, s.n_live_tup::bigint AS rows, pg_total_relation_size(s.relid)::bigint AS bytes,
         pg_indexes_size(s.relid)::bigint AS index_bytes, COALESCE(s.seq_scan, 0)::bigint AS seq_scan, COALESCE(s.idx_scan, 0)::bigint AS idx_scan,
         s.n_tup_ins::bigint AS ins, s.n_tup_upd::bigint AS upd, s.n_tup_del::bigint AS del
       FROM pg_stat_user_tables s WHERE s.schemaname = 'public' ORDER BY pg_total_relation_size(s.relid) DESC`,
    ),
    safe(query<{ state: string | null; n: number }>("SELECT COALESCE(state, 'otro') AS state, COUNT(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1 ORDER BY 2 DESC")),
    safe(query<Record<string, number | string>>(
      `SELECT xact_commit::bigint AS commits, xact_rollback::bigint AS rollbacks, blks_hit::bigint AS hit, blks_read::bigint AS read,
         tup_returned::bigint AS returned, tup_inserted::bigint AS inserted, tup_updated::bigint AS updated, tup_deleted::bigint AS deleted,
         to_char(stats_reset, 'YYYY-MM-DD HH24:MI') AS since
       FROM pg_stat_database WHERE datname = current_database()`,
    )),
    safe(query<{ n: string }>("SELECT current_setting('max_connections') AS n")),
    query<{ d: string; role: string; n: number }>(
      "SELECT to_char(hour::date, 'YYYY-MM-DD') AS d, role::text AS role, SUM(n)::int AS n FROM api_usage WHERE hour > NOW() - INTERVAL 30 DAY GROUP BY 1, 2 ORDER BY 1, 2",
    ),
    query<{ d: string; n: number }>("SELECT to_char(at::date, 'YYYY-MM-DD') AS d, COUNT(*)::int AS n FROM page_views WHERE at > NOW() - INTERVAL 30 DAY GROUP BY 1 ORDER BY 1"),
    query<{ d: string; n: number }>("SELECT to_char(at::date, 'YYYY-MM-DD') AS d, COUNT(*)::int AS n FROM unit_events WHERE at > NOW() - INTERVAL 30 DAY GROUP BY 1 ORDER BY 1"),
  ]);
  // Consultas que más tiempo de la base consumen (si la extensión está activa; en Supabase viene activa)
  let statements: unknown[] = [];
  for (const from of ["pg_stat_statements", "extensions.pg_stat_statements"]) {
    try {
      statements = await query(
        `SELECT LEFT(regexp_replace(query, '\\s+', ' ', 'g'), 220) AS query, calls::bigint AS calls,
           ROUND(total_exec_time::numeric, 1) AS total_ms, ROUND(mean_exec_time::numeric, 2) AS mean_ms, rows::bigint AS rows
         FROM ${from} WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
         ORDER BY total_exec_time DESC LIMIT 12`,
      );
      break;
    } catch { /* probar el otro esquema */ }
  }
  const num = (v: unknown) => Number(v ?? 0);
  return NextResponse.json({
    db: { mb: num(db?.mb), limitMb: LIMIT_MB, version: db?.version ?? "" },
    tables: tables.map((t) => Object.fromEntries(Object.entries(t as Record<string, unknown>).map(([k, v]) => [k, k === "name" ? v : num(v)]))),
    connections: { byState: conns.map((c) => ({ state: c.state, n: num(c.n) })), max: num(maxc?.n) },
    stats: stats ? { ...Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, k === "since" ? v : num(v)])) } : null,
    statements,
    days: { api: apiDays.map((r) => ({ ...r, n: num(r.n) })), views: viewDays.map((r) => ({ ...r, n: num(r.n) })), events: eventDays.map((r) => ({ ...r, n: num(r.n) })) },
  });
}
