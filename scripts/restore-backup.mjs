#!/usr/bin/env node
/**
 * Restaura un respaldo completo (respaldo-AAAA-MM-DD.json.gz) en la base del .env. Se ejecuta en tu PC:
 *
 *   npm run db:restaurar -- respaldo-2026-11-12.json.gz            → solo muestra qué trae (no toca nada)
 *   npm run db:restaurar -- respaldo-2026-11-12.json.gz --confirmar → BORRA los datos actuales y pone los del respaldo
 *
 * Primero aplica el esquema (npm run db:esquema). Todo va en una sola transacción: si algo falla, no cambia nada.
 */
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import pg from "pg";

const file = process.argv[2];
const confirm = process.argv.includes("--confirmar");
if (!file || !fs.existsSync(file)) {
  console.error("Indica el archivo:  npm run db:restaurar -- respaldo-AAAA-MM-DD.json.gz [--confirmar]");
  process.exit(1);
}
const dump = JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8"));
const names = Object.keys(dump.tables ?? {});
const total = names.reduce((t, n) => t + dump.tables[n].length, 0);
console.log(`Respaldo del ${dump.at} · ${names.length} tablas · ${total.toLocaleString("es-PE")} filas`);
for (const n of names) if (dump.tables[n].length) console.log(`  ${n.padEnd(22)} ${dump.tables[n].length.toLocaleString("es-PE")}`);
if (!confirm) {
  console.log("\nNo se tocó nada. Para restaurar (borra los datos actuales) agrega --confirmar.");
  process.exit(0);
}

const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!raw) { console.error("Falta DATABASE_URL en el .env"); process.exit(1); }
const url = new URL(raw);
const local = ["127.0.0.1", "localhost"].includes(url.hostname);
for (const k of ["sslmode", "supa", "pgbouncer"]) url.searchParams.delete(k);
const db = new pg.Client({ connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: false } });
await db.connect();

// Orden de carga: primero las tablas de las que dependen otras (claves foráneas)
const deps = (await db.query(`
  SELECT tc.relname AS child, tp.relname AS parent FROM pg_constraint c
  JOIN pg_class tc ON tc.oid = c.conrelid JOIN pg_class tp ON tp.oid = c.confrelid
  JOIN pg_namespace n ON n.oid = tc.relnamespace WHERE c.contype = 'f' AND n.nspname = 'public'`)).rows;
const existing = new Set((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows.map((r) => r.table_name));
const tables = names.filter((n) => existing.has(n));
const order = [], seen = new Set();
const visit = (t, stack = new Set()) => {
  if (seen.has(t) || stack.has(t)) return;
  stack.add(t);
  for (const d of deps) if (d.child === t && d.parent !== t && tables.includes(d.parent)) visit(d.parent, stack);
  seen.add(t); order.push(t);
};
tables.forEach((t) => visit(t));

const q = (id) => `"${id.replace(/"/g, '""')}"`;
try {
  await db.query("BEGIN");
  await db.query(`TRUNCATE ${tables.map(q).join(", ")} RESTART IDENTITY CASCADE`);
  for (const t of order) {
    const rows = dump.tables[t];
    if (!rows.length) continue;
    const cols = (await db.query("SELECT column_name, is_generated, identity_generation FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [t])).rows;
    const usable = cols.filter((c) => c.is_generated !== "ALWAYS").map((c) => c.column_name).filter((c) => c in rows[0]);
    const always = cols.some((c) => c.identity_generation === "ALWAYS");
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const vals = [], ph = chunk.map((r) => `(${usable.map((c) => {
        const v = r[c];
        vals.push(v && typeof v === "object" && "$b64" in v ? Buffer.from(v.$b64, "base64") : v !== null && typeof v === "object" ? JSON.stringify(v) : v);
        return `$${vals.length}`;
      }).join(",")})`);
      await db.query(`INSERT INTO ${q(t)} (${usable.map(q).join(",")}) ${always ? "OVERRIDING SYSTEM VALUE " : ""}VALUES ${ph.join(",")}`, vals);
    }
    // Los autonuméricos siguen desde el último id
    for (const c of cols.filter((c) => c.identity_generation)) {
      await db.query(`SELECT setval(pg_get_serial_sequence($1, $2), GREATEST(COALESCE((SELECT MAX(${q(c.column_name)}) FROM ${q(t)}), 0), 1))`, [`public.${t}`, c.column_name]);
    }
    console.log(`  ✓ ${t} (${rows.length.toLocaleString("es-PE")})`);
  }
  await db.query("COMMIT");
  console.log("\nRestaurado. Recarga el sistema.");
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(`\nNo se restauró nada (se deshizo todo): ${e.message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
