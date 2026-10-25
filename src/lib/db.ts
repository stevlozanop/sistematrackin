import mysql, { type Pool, type PoolConnection, type ResultSetHeader } from "mysql2/promise";
import bcrypt from "bcryptjs";

const g = globalThis as unknown as { __poolV2?: Pool; __ready?: Promise<void> };

const pool: Pool = (g.__poolV2 ??= mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "system_trackin",
  dateStrings: true, // DATE llega como 'YYYY-MM-DD'
  charset: "utf8mb4_unicode_ci", // misma colación que la base (evita "Illegal mix of collations")
  connectionLimit: 10,
}));

/** Crea el usuario dev inicial si todavía no existe (el esquema vive en database/schema.sql). */
function ready() {
  return (g.__ready ??= (async () => {
    const [rows] = await pool.query("SELECT 1 FROM users WHERE role='dev' LIMIT 1");
    if ((rows as unknown[]).length) return;
    await pool.execute("INSERT IGNORE INTO users(name,email,password_hash,role) VALUES (?,?,?, 'dev')", [
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
  const [rows] = await pool.execute(sql, params as never[]);
  return rows as T[];
}

/** Como query(), pero acepta listas en "IN (?)" y "VALUES ?" (usa pool.query en vez de execute). */
export async function queryList<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await ready();
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

export async function run(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  await ready();
  const [res] = await pool.execute(sql, params as never[]);
  return res as ResultSetHeader;
}

export async function tx<T>(fn: (c: PoolConnection) => Promise<T>): Promise<T> {
  await ready();
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const r = await fn(c);
    await c.commit();
    return r;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
