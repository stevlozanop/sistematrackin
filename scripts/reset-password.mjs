#!/usr/bin/env node
/**
 * Pone una contraseña nueva a una cuenta (por si se olvidó). Se ejecuta en tu PC, contra la base del .env:
 *
 *   npm run clave -- dev@trackin.local
 *
 * La contraseña se escribe en la terminal (no se ve al escribirla) y se guarda cifrada.
 */
import readline from "node:readline";
import bcrypt from "bcryptjs";
import pg from "pg";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Indica el correo:  npm run clave -- correo@ejemplo.com");
  process.exit(1);
}
const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!raw) {
  console.error("Falta DATABASE_URL en el .env");
  process.exit(1);
}

/** Pregunta sin mostrar lo que se escribe. */
function ask(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); };
    rl.question(q, (a) => { rl.close(); process.stdout.write("\n"); resolve(a); });
  });
}

const url = new URL(raw);
const local = ["127.0.0.1", "localhost"].includes(url.hostname);
for (const k of ["sslmode", "supa", "pgbouncer"]) url.searchParams.delete(k);
const db = new pg.Client({ connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: false } });
await db.connect();
try {
  const { rows: [u] } = await db.query("SELECT id, name, role FROM users WHERE email = $1", [email]);
  if (!u) throw new Error(`No existe una cuenta con el correo ${email}`);
  console.log(`Cuenta: ${u.name} (${u.role})`);
  const p1 = await ask("Contraseña nueva (mín. 8): ");
  if (p1.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");
  const p2 = await ask("Repite la contraseña: ");
  if (p1 !== p2) throw new Error("Las contraseñas no coinciden");
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [bcrypt.hashSync(p1, 10), u.id]);
  console.log("Listo: ya puedes entrar con la contraseña nueva.");
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
