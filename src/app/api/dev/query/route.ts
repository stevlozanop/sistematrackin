import { NextResponse } from "next/server";
import { readOnlyQuery } from "@/lib/db";
import { guard } from "@/lib/guard";

/**
 * Consola SQL de The Iceberg Labs: solo consultas de lectura (SELECT, SHOW, DESCRIBE, EXPLAIN, WITH).
 * Una sola consulta, en una transacción de solo lectura, con 10 s como máximo y hasta 1000 filas.
 */
const READ = /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH)\b/i;
const MAX_ROWS = 1000;

export async function POST(req: Request) {
  const { err } = await guard(["dev"]);
  if (err) return err;
  const { sql } = await req.json().catch(() => ({}));
  const text = String(sql ?? "").trim().replace(/;\s*$/, "");
  if (!text) return NextResponse.json({ error: "Escribe una consulta" }, { status: 400 });
  if (!READ.test(text)) {
    return NextResponse.json({ error: "Solo se permiten consultas de lectura: SELECT, SHOW, DESCRIBE, EXPLAIN o WITH." }, { status: 400 });
  }
  if (text.includes(";")) return NextResponse.json({ error: "Ejecuta una sola consulta a la vez (sin «;» en medio)." }, { status: 400 });

  const start = Date.now();
  try {
    const { rows, fields } = await readOnlyQuery(text);
    const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    // Nunca devolver contraseñas, aunque se pidan
    const hash = (v: unknown) => typeof v === "string" && /^\$2[aby]\$\d\d\$/.test(v);
    const safe = list.slice(0, MAX_ROWS).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === "password_hash" || hash(v) ? "••••••" : Buffer.isBuffer(v) ? `[archivo ${Math.ceil(v.length / 1024)} KB]` : v])));
    return NextResponse.json({ columns: fields, rows: safe, total: list.length, truncated: list.length > MAX_ROWS, ms: Date.now() - start });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, ms: Date.now() - start }, { status: 400 });
  }
}
