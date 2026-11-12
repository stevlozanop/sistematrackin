import { gzipSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { query } from "./db";

/**
 * Respaldo completo de la base: todas las tablas en un JSON comprimido (respaldo-AAAA-MM-DD.json.gz).
 * Se guarda en un bucket PRIVADO de Supabase Storage («respaldos») y se conservan los últimos 30 días.
 * Necesita SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY. En una PC sin esas variables
 * se guarda en data/respaldos. Se restaura con «npm run db:restaurar -- archivo.json.gz --confirmar».
 */
const BUCKET = "respaldos";
const KEEP_DAYS = 30;

const url = () => (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const backupTarget = () => (url() && key() ? "supabase" : process.env.VERCEL ? "none" : "local");

async function storage(p: string, init: RequestInit = {}) {
  const r = await fetch(`${url()}/storage/v1/${p}`, { ...init, headers: { Authorization: `Bearer ${key()}`, apikey: key(), ...(init.headers ?? {}) } });
  if (!r.ok && r.status !== 409) throw new Error(`Storage ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

/** Arma el archivo: { version, at, tables: { nombre: filas[] } } (los archivos binarios van en base64) */
export async function dumpDatabase() {
  const tables = await query<{ name: string }>(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  const out: Record<string, unknown[]> = {};
  let rows = 0;
  for (const { name } of tables) {
    const list = await query<Record<string, unknown>>(`SELECT * FROM "public"."${name.replace(/"/g, '""')}"`);
    out[name] = list.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Buffer.isBuffer(v) ? { $b64: v.toString("base64") } : v])));
    rows += list.length;
  }
  const json = JSON.stringify({ version: 1, at: new Date().toISOString(), tables: out });
  return { gz: gzipSync(json, { level: 9 }), tables: tables.length, rows };
}

export type BackupFile = { name: string; bytes: number; at: string };

/** Hace el respaldo de hoy, lo sube y borra los de hace más de 30 días */
export async function runBackup() {
  const target = backupTarget();
  if (target === "none") throw new Error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Vercel");
  const { gz, tables, rows } = await dumpDatabase();
  const name = `respaldo-${new Date().toISOString().slice(0, 10)}.json.gz`;
  if (target === "supabase") {
    await storage("bucket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) });
    await storage(`object/${BUCKET}/${name}`, { method: "POST", headers: { "Content-Type": "application/gzip", "x-upsert": "true" }, body: new Uint8Array(gz) });
    const old = (await listBackups()).filter((f) => Date.now() - new Date(f.at).getTime() > KEEP_DAYS * 86400_000).map((f) => f.name);
    if (old.length) await storage(`object/${BUCKET}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: old }) });
  } else {
    const dir = path.join(process.cwd(), "data", "respaldos");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), gz);
  }
  return { name, bytes: gz.length, tables, rows, target };
}

/** Respaldos guardados, del más nuevo al más viejo */
export async function listBackups(): Promise<BackupFile[]> {
  const target = backupTarget();
  if (target === "supabase") {
    const r = await storage(`object/list/${BUCKET}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefix: "", limit: 100, sortBy: { column: "name", order: "desc" } }) });
    const list = (await r.json().catch(() => [])) as { name: string; created_at?: string; metadata?: { size?: number } }[];
    return Array.isArray(list) ? list.filter((f) => f.name.endsWith(".json.gz")).map((f) => ({ name: f.name, bytes: f.metadata?.size ?? 0, at: f.created_at ?? "" })) : [];
  }
  if (target === "local") {
    const dir = path.join(process.cwd(), "data", "respaldos");
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith(".json.gz")).sort().reverse()
      .map((f) => { const st = fs.statSync(path.join(dir, f)); return { name: f, bytes: st.size, at: st.mtime.toISOString() }; });
  }
  return [];
}

/** Descarga un respaldo (para guardarlo también en otro lado) */
export async function readBackup(name: string): Promise<Buffer | null> {
  if (!/^respaldo-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(name)) return null;
  if (backupTarget() === "supabase") {
    const r = await fetch(`${url()}/storage/v1/object/${BUCKET}/${name}`, { headers: { Authorization: `Bearer ${key()}`, apikey: key() } });
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  }
  const f = path.join(process.cwd(), "data", "respaldos", name);
  return fs.existsSync(f) ? fs.readFileSync(f) : null;
}
