import { query } from "./db";

export type Level = "good" | "warn" | "crit";
export type Check = { key: string; label: string; value: string; level: Level; hint: string };

const LIMIT_MB = Number(process.env.DB_LIMIT_MB) || 500;
const lv = (v: number, warn: number, crit: number, higherIsBad = true): Level =>
  higherIsBad ? (v >= crit ? "crit" : v >= warn ? "warn" : "good") : (v <= crit ? "crit" : v <= warn ? "warn" : "good");

/**
 * Salud real de la base (Postgres en Supabase): tiempo de respuesta, conexiones, caché, consultas largas,
 * bloqueos, filas muertas, espacio y transacciones revertidas. Cada punto con su semáforo y qué hacer.
 */
export async function healthChecks() {
  // Tiempo de respuesta: 3 consultas mínimas, desde el servidor de la app hasta la base y de vuelta
  const pings: number[] = [];
  for (let i = 0; i < 3; i++) { const t = performance.now(); await query("SELECT 1"); pings.push(performance.now() - t); }
  const ping = pings.sort((a, b) => a - b)[1];
  const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
  const [[s], [conn], long, [locks], dead, [db]] = await Promise.all([
    safe(query<Record<string, number>>(
      "SELECT blks_hit::bigint AS hit, blks_read::bigint AS read, xact_commit::bigint AS commits, xact_rollback::bigint AS rollbacks FROM pg_stat_database WHERE datname = current_database()",
    )),
    safe(query<{ n: number; max: number }>("SELECT (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database())::int AS n, current_setting('max_connections')::int AS max")),
    safe(query<{ pid: number; secs: number; state: string; query: string }>(
      `SELECT pid, EXTRACT(EPOCH FROM (now() - query_start))::int AS secs, state, LEFT(regexp_replace(query, '\\s+', ' ', 'g'), 180) AS query
       FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'
         AND query_start < now() - interval '5 seconds' ORDER BY query_start LIMIT 10`,
    )),
    safe(query<{ n: number }>("SELECT COUNT(*)::int AS n FROM pg_locks WHERE NOT granted")),
    safe(query<{ name: string; live: number; dead: number; vacuum: string | null; analyze: string | null }>(
      `SELECT relname AS name, n_live_tup::bigint AS live, n_dead_tup::bigint AS dead,
         to_char(GREATEST(last_vacuum, last_autovacuum), 'YYYY-MM-DD HH24:MI') AS vacuum, to_char(GREATEST(last_analyze, last_autoanalyze), 'YYYY-MM-DD HH24:MI') AS analyze
       FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY n_dead_tup DESC`,
    )),
    safe(query<{ mb: number }>("SELECT ROUND(pg_database_size(current_database()) / 1048576.0, 2) AS mb")),
  ]);
  const num = (v: unknown) => Number(v ?? 0);
  const blocks = s ? num(s.hit) + num(s.read) : 0;
  const hit = blocks ? (num(s!.hit) / blocks) * 100 : 100;
  // Con pocas lecturas (base recién iniciada o estadísticas recién reiniciadas) el porcentaje todavía no dice nada
  const fewReads = blocks < 50000;
  const rb = s && num(s.commits) ? (num(s.rollbacks) / (num(s.commits) + num(s.rollbacks))) * 100 : 0;
  const connPct = conn ? (num(conn.n) / Math.max(1, num(conn.max))) * 100 : 0;
  const worst = dead.filter((t) => num(t.live) + num(t.dead) > 1000).map((t) => ({ ...t, pct: (num(t.dead) / (num(t.live) + num(t.dead))) * 100 })).sort((a, b) => b.pct - a.pct)[0];
  const usedPct = (num(db?.mb) / LIMIT_MB) * 100;
  const checks: Check[] = [
    { key: "ping", label: "Tiempo de respuesta", value: `${ping.toFixed(0)} ms`, level: lv(ping, 120, 300), hint: "Ida y vuelta de la app a la base. Si sube, revisa la región o el pooler (puerto 6543)." },
    { key: "conns", label: "Conexiones en uso", value: `${num(conn?.n)} de ${num(conn?.max)} (${connPct.toFixed(0)}%)`, level: lv(connPct, 60, 85), hint: "Cerca del máximo, las pantallas empiezan a fallar. El pooler las reparte." },
    { key: "cache", label: "Aciertos de caché", value: `${hit.toFixed(2)}%`, level: fewReads ? "good" : lv(hit, 98, 95, false), hint: fewReads ? "Todavía hay pocas lecturas para juzgarlo; se evalúa cuando la base tenga más uso." : "Lecturas servidas desde memoria. Bajo 95% la base lee mucho del disco." },
    { key: "long", label: "Consultas de más de 5 s", value: String(long.length), level: lv(long.length, 1, 3), hint: "Consultas trabadas o muy pesadas en este momento." },
    { key: "locks", label: "Bloqueos en espera", value: String(num(locks?.n)), level: lv(num(locks?.n), 1, 5), hint: "Consultas esperando a que otra suelte una tabla o fila." },
    { key: "dead", label: "Filas muertas (peor tabla)", value: worst ? `${worst.pct.toFixed(1)}% en ${worst.name}` : "0%", level: lv(worst?.pct ?? 0, 10, 20), hint: "Filas borradas o cambiadas que aún ocupan espacio; el autovacuum las limpia." },
    { key: "space", label: "Espacio del plan", value: `${num(db?.mb).toFixed(1)} de ${LIMIT_MB} MB (${usedPct.toFixed(1)}%)`, level: lv(usedPct, 70, 85), hint: "Al llenarse el plan, la base deja de aceptar datos nuevos." },
    { key: "rollback", label: "Transacciones revertidas", value: `${rb.toFixed(2)}%`, level: lv(rb, 2, 5), hint: "Guardados que fallaron y se deshicieron. Si sube, hay errores al guardar." },
  ];
  const level: Level = checks.some((c) => c.level === "crit") ? "crit" : checks.some((c) => c.level === "warn") ? "warn" : "good";
  return { level, checks, long, dead: dead.map((t) => ({ ...t, live: num(t.live), dead: num(t.dead) })) };
}
