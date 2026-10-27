#!/usr/bin/env node
/**
 * Copia todos los datos de la base MySQL (XAMPP) a PostgreSQL (Supabase).
 *
 *   MYSQL_URL=mysql://root@127.0.0.1:3306/system_trackin \
 *   DATABASE_URL='postgres://postgres.xxxx:CLAVE@aws-0-us-east-1.pooler.supabase.com:5432/postgres' \
 *   node scripts/mysql-to-postgres.mjs        (o: npm run db:migrar, que lee .env)
 *
 * - Crea las tablas con database/schema.sql (si ya existen, no las toca).
 * - Si la base de destino ya tiene unidades o usuarios, se detiene. Con --reemplazar borra lo que haya y copia de nuevo.
 * - Usa la conexión directa o la del pooler en modo sesión (puerto 5432), no la del puerto 6543.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import pg from "pg";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const replace = process.argv.includes("--reemplazar");
const mysqlUrl = process.env.MYSQL_URL ?? "mysql://root@127.0.0.1:3306/system_trackin";
const pgUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING;
if (!pgUrl) {
  console.error("Falta DATABASE_URL (la cadena de conexión de Supabase).");
  process.exit(1);
}

// Orden: primero lo que otras tablas referencian
const TABLES = ["dealers", "companies", "users", "units", "lead_times", "settings", "user_stages", "unit_events"];
const IDENTITY = ["dealers", "companies", "users", "units", "unit_events"];

const target = new URL(pgUrl);
const local = ["127.0.0.1", "localhost"].includes(target.hostname);
for (const k of ["sslmode", "supa", "pgbouncer"]) target.searchParams.delete(k);

const fail = (msg) => { console.error(msg); process.exit(1); };
const my = await mysql.createConnection({ uri: mysqlUrl, dateStrings: true, charset: "utf8mb4_unicode_ci" })
  .catch((e) => fail(`No se pudo conectar a MySQL (${e.code ?? e.message}). ¿Está encendido XAMPP? MYSQL_URL=${mysqlUrl}`));
const pgc = new pg.Client({ connectionString: target.toString(), ssl: local ? false : { rejectUnauthorized: false } });
await pgc.connect().catch((e) => fail(
  e.code === "28P01" ? "Supabase rechazó la contraseña: revisa la clave en DATABASE_URL (una @ se escribe %40)."
    : e.code === "ENOTFOUND" || e.code === "ENETUNREACH" ? `No se encontró el servidor de Supabase (${target.host}). Usa la cadena del «Session pooler».`
    : `No se pudo conectar a Supabase: ${e.message}`,
));
const log = (...a) => console.log(...a);

try {
  log(`MySQL:    ${new URL(mysqlUrl).host}${new URL(mysqlUrl).pathname}`);
  log(`Postgres: ${target.host}${target.pathname}`);

  log("1/4 Creando las tablas (database/schema.sql)…");
  await pgc.query(fs.readFileSync(path.join(root, "database", "schema.sql"), "utf8"));

  const { rows: [has] } = await pgc.query("SELECT (SELECT COUNT(*) FROM units) + (SELECT COUNT(*) FROM users WHERE role <> 'dev') n");
  if (Number(has.n) > 0 && !replace) {
    throw new Error("La base de destino ya tiene datos. Para borrarlos y copiar de nuevo, agrega --reemplazar");
  }

  await pgc.query("BEGIN");
  log("2/4 Vaciando el destino…");
  await pgc.query(`TRUNCATE ${TABLES.join(", ")}, import_stash RESTART IDENTITY CASCADE`);

  log("3/4 Copiando datos…");
  let pendingCompanies = [];
  for (const table of TABLES) {
    const [rows] = await my.query(`SELECT * FROM \`${table}\``);
    const { rows: colRows } = await pgc.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1", [table],
    );
    const pgCols = new Set(colRows.map((r) => r.column_name));
    const cols = rows.length ? Object.keys(rows[0]).filter((c) => pgCols.has(c)) : [];
    // Las empresas se apuntan entre sí y a usuarios: esas columnas se llenan después
    const later = table === "companies" ? ["parent_id", "owner_id"] : [];
    const insertCols = cols.filter((c) => !later.includes(c));
    const fix = (v) => (typeof v === "string" && v.startsWith("0000-00-00") ? null : v);
    const per = Math.max(1, Math.floor(60000 / Math.max(1, insertCols.length)));
    for (let i = 0; i < rows.length; i += per) {
      const chunk = rows.slice(i, i + per);
      const values = [];
      const tuples = chunk.map((r) => `(${insertCols.map((c) => { values.push(fix(r[c])); return `$${values.length}`; }).join(",")})`);
      await pgc.query(`INSERT INTO ${table} (${insertCols.map((c) => `"${c}"`).join(",")}) VALUES ${tuples.join(",")}`, values);
    }
    if (later.length) pendingCompanies = rows;
    // Ya están los usuarios: ahora sí se enlazan las empresas (consorcio padre y cuenta principal)
    if (table === "users") {
      for (const r of pendingCompanies) {
        await pgc.query("UPDATE companies SET parent_id = $1, owner_id = $2 WHERE id = $3", [r.parent_id ?? null, r.owner_id ?? null, r.id]);
      }
    }
    log(`   ${table.padEnd(12)} ${rows.length.toLocaleString("es-PE")} filas`);
  }
  // Los autonuméricos siguen desde el último id copiado
  for (const t of IDENTITY) {
    await pgc.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`);
  }
  await pgc.query("COMMIT");

  log("4/4 Verificando…");
  let ok = true;
  for (const t of TABLES) {
    const [[a]] = await my.query(`SELECT COUNT(*) n FROM \`${t}\``);
    const { rows: [b] } = await pgc.query(`SELECT COUNT(*) n FROM ${t}`);
    const same = Number(a.n) === Number(b.n);
    ok &&= same;
    log(`   ${t.padEnd(12)} MySQL ${String(a.n).padStart(7)} · Postgres ${String(b.n).padStart(7)} ${same ? "✓" : "✗"}`);
  }
  log(ok ? "Listo: todos los datos están en Postgres." : "Hay diferencias: revisa las tablas marcadas con ✗.");
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  await pgc.query("ROLLBACK").catch(() => {});
  console.error(`Error: ${e.message}`);
  process.exitCode = 1;
} finally {
  await my.end();
  await pgc.end();
}
