#!/usr/bin/env node
/**
 * Aplica database/schema.sql a la base del .env (Supabase) sin tocar los datos:
 * crea lo que falte y actualiza las funciones y la vista v_units.
 *
 *   npm run db:esquema
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!raw) {
  console.error("Falta DATABASE_URL en el .env");
  process.exit(1);
}
const url = new URL(raw);
const local = ["127.0.0.1", "localhost"].includes(url.hostname);
for (const k of ["sslmode", "supa", "pgbouncer"]) url.searchParams.delete(k);
const db = new pg.Client({ connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: false } });
await db.connect().catch((e) => {
  console.error(e.code === "28P01" ? "La base rechazó la contraseña (DATABASE_URL en .env)." : `No se pudo conectar: ${e.message}`);
  process.exit(1);
});
try {
  const t = Date.now();
  // Todo el archivo va en una sola transacción: si algo falla, no queda a medias
  await db.query(fs.readFileSync(path.join(root, "database", "schema.sql"), "utf8"));
  const { rows: [r] } = await db.query("SELECT (SELECT COUNT(*) FROM units) units, (SELECT COUNT(*) FROM v_units) v");
  console.log(`Esquema actualizado en ${((Date.now() - t) / 1000).toFixed(1)} s · ${r.units} unidades, ${r.v} en la vista.`);
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
