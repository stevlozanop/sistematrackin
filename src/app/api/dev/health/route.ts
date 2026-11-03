import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { guard } from "@/lib/guard";
import { healthChecks } from "@/lib/dev-health";

/** Consola The Iceberg Labs · Salud de la base: semáforo de cada punto, consultas lentas, índices sin uso y limpieza de tablas. */
export async function GET() {
  const { err } = await guard(["dev"]);
  if (err) return err;
  const [health, unused] = await Promise.all([
    healthChecks(),
    query(
      `SELECT s.relname AS "table", s.indexrelname AS "index", pg_relation_size(s.indexrelid)::bigint AS bytes
       FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
       WHERE s.schemaname = 'public' AND s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary
       ORDER BY bytes DESC LIMIT 15`,
    ).catch(() => []),
  ]);
  let slow: unknown[] = [];
  for (const from of ["pg_stat_statements", "extensions.pg_stat_statements"]) {
    try {
      slow = await query(
        `SELECT LEFT(regexp_replace(query, '\\s+', ' ', 'g'), 200) AS query, calls::bigint AS calls, ROUND(mean_exec_time::numeric, 1) AS mean_ms, ROUND(max_exec_time::numeric, 0) AS max_ms
         FROM ${from} WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database()) AND calls > 2
         ORDER BY mean_exec_time DESC LIMIT 10`,
      );
      break;
    } catch { /* otro esquema */ }
  }
  return NextResponse.json({ ...health, unused, slow });
}
