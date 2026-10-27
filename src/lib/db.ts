import pg from "pg";
import bcrypt from "bcryptjs";

/**
 * Base de datos PostgreSQL (Supabase). El esquema está en database/schema.sql.
 *
 * Las consultas del sistema se escribieron para MySQL y se mantienen casi iguales:
 * - Se usa "?" para los parámetros; aquí se convierten a $1, $2… Un arreglo en "IN (?)" se expande,
 *   y un arreglo de filas en "VALUES ?" se convierte en (…),(…).
 * - "<=>" pasa a IS NOT DISTINCT FROM, `nombre` a "nombre" e INTERVAL 20 SECOND a INTERVAL '20 second'.
 * - ASC / DESC ponen los vacíos donde los ponía MySQL (primero / al final). Sin ASC explícito, Postgres
 *   los pone al final: si importa, se escribe NULLS FIRST.
 * - IF(), DATE_FORMAT(), CURDATE(), DATEDIFF(), YEAR(), MONTH(), UNIX_TIMESTAMP() y SUM(condición)
 *   existen en la base como funciones (database/schema.sql).
 * - Los resultados llegan como antes: fechas en texto ('2026-10-26', '2026-10-26 18:30:00'),
 *   conteos como número y condiciones como 1/0.
 */

const g = globalThis as unknown as { __pgPool?: pg.Pool; __ready?: Promise<void> };

const TYPES: Record<number, (v: string) => unknown> = {
  1082: (v) => v,                      // date        -> '2026-10-26'
  1114: (v) => v.slice(0, 19),         // timestamp   -> '2026-10-26 18:30:00'
  1184: (v) => v.slice(0, 19),         // timestamptz -> en hora de Perú (zona de la sesión)
  20: Number,                          // bigint (COUNT, SUM) -> número
  1700: Number,                        // numeric (AVG, ROUND) -> número
  16: (v) => (v === "t" ? 1 : 0),      // boolean -> 1 / 0, como MySQL
};
const types = {
  getTypeParser: (oid: number, format?: string) => TYPES[oid] ?? pg.types.getTypeParser(oid, format as never),
} as pg.CustomTypesConfig;

/**
 * Conexión: DATABASE_URL o POSTGRES_URL (la que crea la integración de Supabase en Vercel).
 * En Vercel conviene la del pooler (puerto 6543). DB_SSL_CA = certificado de Supabase para verificarlo.
 */
function poolConfig(): pg.PoolConfig {
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL || "postgres://postgres:postgres@127.0.0.1:5432/postgres";
  const url = new URL(raw);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  // sslmode y los parámetros propios de Supabase se manejan con la opción ssl de abajo
  for (const k of ["sslmode", "supa", "pgbouncer"]) url.searchParams.delete(k);
  return {
    connectionString: url.toString(),
    ssl: local || process.env.DB_SSL === "false" ? false
      : process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n") } : { rejectUnauthorized: false },
    // En Vercel cada función abre su propio pool: pocas conexiones para no agotar el límite de la base
    // Supabase limita las conexiones (15 en el pooler en modo sesión): pocas por proceso y se sueltan rápido
    max: Number(process.env.DB_POOL_LIMIT) || 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    types,
  };
}

const pool: pg.Pool = (g.__pgPool ??= new pg.Pool(poolConfig()));

/** MySQL -> Postgres: parámetros "?" y las pocas diferencias de sintaxis que usan las consultas. */
export function toPg(sql: string, params: unknown[] = []) {
  const values: unknown[] = [];
  const bind = (v: unknown) => {
    values.push(v === undefined ? null : v);
    return `$${values.length}`;
  };
  let i = 0;
  const out = sql
    .replace(/`([^`]+)`/g, '"$1"')
    .replace(/<=>/g, " IS NOT DISTINCT FROM ")
    // Al ordenar, MySQL pone los vacíos (NULL) primero en ASC y al final en DESC; Postgres al revés
    .replace(/\b(ASC|DESC)\b(?!\s+NULLS)/gi, (_, d) => (d.toUpperCase() === "ASC" ? "ASC NULLS FIRST" : "DESC NULLS LAST"))
    .replace(/INTERVAL\s+(\d+)\s+(SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|YEAR)\b/gi, (_, n, unit) => `INTERVAL '${n} ${unit.toLowerCase()}'`)
    .replace(/\?/g, () => {
      const v = params[i++];
      if (!Array.isArray(v)) return bind(v);
      if (!v.length) return "NULL"; // IN () vacío: no coincide con nada
      if (Array.isArray(v[0])) return v.map((row: unknown[]) => `(${row.map(bind).join(",")})`).join(",");
      return v.map(bind).join(",");
    });
  return { sql: out, values };
}

/** Tablas con id autonumérico: un INSERT devuelve insertId, como en MySQL. */
const ID_TABLES = new Set(["companies", "users", "dealers", "units", "unit_events"]);
const insertTable = (sql: string) => /^\s*INSERT\s+INTO\s+(\w+)/i.exec(sql)?.[1]?.toLowerCase();

export type ResultSetHeader = { insertId: number; affectedRows: number };

type Exec = (sql: string, values: unknown[]) => Promise<pg.QueryResult>;

async function runOn(exec: Exec, sql: string, params: unknown[]) {
  const t = toPg(sql, params);
  const table = insertTable(sql);
  const returning = !!table && ID_TABLES.has(table) && !/\bRETURNING\b/i.test(sql);
  const r = await exec(returning ? `${t.sql} RETURNING id` : t.sql, t.values);
  return { r, header: { insertId: Number(r.rows?.[0]?.id ?? 0), affectedRows: r.rowCount ?? 0 } as ResultSetHeader };
}

/** Conexión dentro de una transacción, con la misma forma que mysql2: c.query(sql, params) -> [filas | header]. */
export type TxConnection = {
  query: (sql: string, params?: unknown[]) => Promise<[unknown, pg.FieldDef[]]>;
  execute: (sql: string, params?: unknown[]) => Promise<[unknown, pg.FieldDef[]]>;
};

function wrap(c: pg.PoolClient): TxConnection {
  const query = async (sql: string, params: unknown[] = []): Promise<[unknown, pg.FieldDef[]]> => {
    const { r, header } = await runOn((s, v) => c.query(s, v), sql, params);
    const rows = r.command === "SELECT" || /\bRETURNING\b/i.test(sql);
    return [rows ? r.rows : header, r.fields];
  };
  return { query, execute: query };
}

/** Cambios de esquema para bases creadas antes (idempotentes: ADD COLUMN IF NOT EXISTS…). */
const MIGRATIONS: string[] = [];

/** Aplica los cambios pendientes y crea el usuario dev inicial si todavía no existe. */
function ready() {
  return (g.__ready ??= (async () => {
    for (const sql of MIGRATIONS) await pool.query(sql);
    const { rows } = await pool.query("SELECT 1 FROM users WHERE role='dev' LIMIT 1");
    if (rows.length) return;
    await pool.query("INSERT INTO users(name,email,password_hash,role) VALUES ($1,$2,$3,'dev') ON CONFLICT DO NOTHING", [
      "Desarrollador",
      process.env.DEV_EMAIL ?? "dev@trackin.local",
      bcrypt.hashSync(process.env.DEV_PASSWORD ?? "Dev12345!", 10),
    ]);
  })().catch((e) => {
    g.__ready = undefined;
    throw e;
  }));
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await ready();
  const t = toPg(sql, params);
  return (await pool.query(t.sql, t.values)).rows as T[];
}

/** Igual que query(). En MySQL era la versión que aceptaba listas en "IN (?)"; aquí query() también las acepta. */
export const queryList = query;

export async function run(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  await ready();
  return (await runOn((s, v) => pool.query(s, v), sql, params)).header;
}

/**
 * Consola SQL de The Iceberg Labs: ejecuta UNA consulta dentro de una transacción de solo lectura, con límite de tiempo.
 * Aunque la consulta intente escribir, la base la rechaza.
 */
export async function readOnlyQuery(sql: string) {
  await ready();
  const c = await pool.connect();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SET LOCAL statement_timeout = 10000");
    const res = (await c.query(sql)) as pg.QueryResult | pg.QueryResult[];
    const last = Array.isArray(res) ? res[res.length - 1] : res;
    return { rows: last.rows, fields: last.fields?.map((f) => f.name) ?? [] };
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    c.release();
  }
}

/** Datos de la conexión (sin la contraseña), para la consola de The Iceberg Labs. */
export const connectionInfo = () => {
  const c = poolConfig();
  const url = new URL(c.connectionString!);
  return {
    host: url.hostname, port: Number(url.port || 5432), user: decodeURIComponent(url.username),
    database: url.pathname.slice(1), poolLimit: c.max, ssl: !!c.ssl,
  };
};

export async function tx<T>(fn: (c: TxConnection) => Promise<T>): Promise<T> {
  await ready();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(wrap(c));
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
