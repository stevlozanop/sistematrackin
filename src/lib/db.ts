import mysql, { type Pool, type PoolConnection, type ResultSetHeader } from "mysql2/promise";
import bcrypt from "bcryptjs";

const g = globalThis as unknown as { __poolV2?: Pool; __ready?: Promise<void> };

/**
 * Conexión: DATABASE_URL (mysql://usuario:clave@host:puerto/base, como la dan Aiven, TiDB, Railway…)
 * o DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME. DB_SSL=true para bases en la nube (Vercel no tiene MySQL propio).
 */
function poolConfig(): mysql.PoolOptions {
  const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  const ssl = process.env.DB_SSL === "true" || url?.searchParams.get("ssl") === "true" || url?.searchParams.has("ssl-mode");
  return {
    host: url?.hostname ?? process.env.DB_HOST ?? "127.0.0.1",
    port: Number(url?.port || process.env.DB_PORT || 3306),
    user: url ? decodeURIComponent(url.username) : process.env.DB_USER ?? "root",
    password: url ? decodeURIComponent(url.password) : process.env.DB_PASSWORD ?? "",
    database: url?.pathname.slice(1) || process.env.DB_NAME || "system_trackin",
    ssl: ssl ? { rejectUnauthorized: process.env.DB_SSL_INSECURE !== "true", minVersion: "TLSv1.2" } : undefined,
    dateStrings: true, // DATE llega como 'YYYY-MM-DD'
    charset: "utf8mb4_unicode_ci", // misma colación que la base (evita "Illegal mix of collations")
    // En Vercel cada función abre su propio pool: pocas conexiones para no agotar el límite de la base
    connectionLimit: Number(process.env.DB_POOL_LIMIT) || (process.env.VERCEL ? 3 : 10),
    maxIdle: process.env.VERCEL ? 1 : undefined,
    idleTimeout: 60_000,
    enableKeepAlive: true,
  };
}

const pool: Pool = (g.__poolV2 ??= (() => {
  const p = mysql.createPool(poolConfig());
  // Hora de Perú (UTC-5, sin horario de verano) para NOW() y CURDATE(): las bases en la nube suelen estar en UTC
  p.pool.on("connection", (c) => c.query("SET time_zone = '-05:00'"));
  return p;
})());

const MIGRATIONS = [
  // guía paso a paso: se abre sola hasta que el usuario la termina
  "ALTER TABLE users ADD COLUMN guide_seen TINYINT(1) NOT NULL DEFAULT 0",
  // empresas (Consorcio Leyva, Honda…) y cuentas de solo lectura: dealer (sus unidades) y viewer (todo)
  `CREATE TABLE IF NOT EXISTS companies (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL UNIQUE,
    kind ENUM('transport','client') NOT NULL DEFAULT 'transport',
    ruc VARCHAR(11) NULL,
    members VARCHAR(500) NULL,
    address VARCHAR(200) NULL,
    phone VARCHAR(40) NULL,
    email VARCHAR(160) NULL,
    website VARCHAR(160) NULL,
    notes VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  "ALTER TABLE users MODIFY role ENUM('dev','admin','operator','viewer','dealer') NOT NULL",
  "ALTER TABLE users ADD COLUMN company_id INT UNSIGNED NULL",
  "ALTER TABLE users ADD COLUMN dealer_id INT UNSIGNED NULL",
  "ALTER TABLE users ADD CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL",
  "ALTER TABLE users ADD CONSTRAINT fk_users_dealer FOREIGN KEY (dealer_id) REFERENCES dealers(id) ON DELETE CASCADE",
  // consorcios cliente (Honda…) creados por la transportista: parent_id = la empresa que los creó
  "ALTER TABLE companies ADD COLUMN parent_id INT UNSIGNED NULL AFTER kind",
  "ALTER TABLE companies ADD CONSTRAINT fk_companies_parent FOREIGN KEY (parent_id) REFERENCES companies(id) ON DELETE SET NULL",
  // logo de cada empresa (se guarda en la base para que no se pierda al reiniciar o desplegar)
  "ALTER TABLE companies ADD COLUMN logo MEDIUMBLOB NULL",
  "ALTER TABLE companies ADD COLUMN logo_type VARCHAR(20) NULL",
  "ALTER TABLE companies ADD COLUMN logo_updated DATETIME NULL",
  // color principal de cada empresa (tema de sus cuentas: Leyva verde, Honda rojo…)
  "ALTER TABLE companies ADD COLUMN color VARCHAR(7) NULL AFTER parent_id",
  // cuenta principal de la empresa (se muestra como «Empresa 01» en vez de «Supervisor»)
  "ALTER TABLE companies ADD COLUMN owner_id INT UNSIGNED NULL AFTER parent_id",
  "ALTER TABLE companies ADD CONSTRAINT fk_companies_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL",
  // cliente de Honda al que pertenece cada tienda (SORSA, CREDIVARGAS…) y cuentas de cliente que ven todas sus tiendas
  "ALTER TABLE dealers ADD COLUMN client VARCHAR(120) NULL",
  "ALTER TABLE dealers ADD KEY idx_dealers_client (client)",
  "ALTER TABLE users ADD COLUMN client VARCHAR(120) NULL AFTER dealer_id",
  // quién creó cada cuenta (Leyva, Honda o The Iceberg Labs)
  "ALTER TABLE users ADD COLUMN created_by INT UNSIGNED NULL",
  // código propio por tipo: empresas EMP-01, EMP-02… · consorcios CON-01, CON-02…
  "ALTER TABLE companies ADD COLUMN code VARCHAR(10) NULL AFTER kind",
  "ALTER TABLE companies ADD UNIQUE KEY uq_companies_code (code)",
  // dirección corta de la entrada propia de un consorcio: /honda y /honda/clientes
  "ALTER TABLE companies ADD COLUMN slug VARCHAR(40) NULL AFTER code",
  "ALTER TABLE companies ADD UNIQUE KEY uq_companies_slug (slug)",
  `UPDATE companies c JOIN (
     SELECT id, CONCAT(IF(kind = 'client', 'CON', 'EMP'), '-', LPAD(ROW_NUMBER() OVER (PARTITION BY kind ORDER BY id), 2, '0')) code FROM companies
   ) x ON x.id = c.id SET c.code = x.code WHERE c.code IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT code FROM companies) y WHERE y.code IS NOT NULL)`,
  // vista previa de la carga por etapa entre el paso 1 y el 2 (en Vercel cada llamada puede caer en otro servidor)
  `CREATE TABLE IF NOT EXISTS import_stash (
    token CHAR(36) NOT NULL PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    payload LONGTEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

/** Crea el usuario dev inicial si todavía no existe (el esquema vive en database/schema.sql). */
function ready() {
  return (g.__ready ??= (async () => {
    // Cambios de esquema para bases creadas antes (database/schema.sql ya los trae). Cada uno se puede repetir.
    for (const sql of MIGRATIONS) {
      await pool.query(sql).catch((e) => {
        if (!["ER_DUP_FIELDNAME", "ER_DUP_KEYNAME", "ER_FK_DUP_NAME", "ER_CANT_CREATE_TABLE"].includes(e?.code)) throw e;
      });
    }
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

/**
 * Consola SQL de The Iceberg Labs: ejecuta UNA consulta dentro de una transacción de solo lectura, con límite de tiempo.
 * Aunque la consulta intente escribir, la base la rechaza.
 */
export async function readOnlyQuery(sql: string) {
  await ready();
  const c = await pool.getConnection();
  try {
    await c.query("SET SESSION max_statement_time = 10").catch(() => c.query("SET SESSION max_execution_time = 10000").catch(() => {}));
    await c.query("START TRANSACTION READ ONLY");
    const [rows, fields] = await c.query({ sql, rowsAsArray: false });
    return { rows, fields: (fields as { name: string }[] | undefined)?.map((f) => f.name) ?? [] };
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    // la conexión vuelve al pool: quitarle el límite para no cortar cargas grandes de Excel
    await c.query("SET SESSION max_statement_time = 0").catch(() => c.query("SET SESSION max_execution_time = 0").catch(() => {}));
    c.release();
  }
}

/** Datos de la conexión (sin la contraseña), para la consola de The Iceberg Labs. */
export const connectionInfo = () => {
  const c = poolConfig();
  return { host: c.host, port: c.port, user: c.user, database: c.database, poolLimit: c.connectionLimit, ssl: !!c.ssl };
};

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
