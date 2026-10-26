import { NextResponse } from "next/server";
import { connectionInfo, query, queryList } from "@/lib/db";
import { guard } from "@/lib/guard";

/**
 * Consola The Iceberg Labs · base de datos.
 * GET           -> conexión, motor y tablas (filas, tamaño, actualización)
 * GET ?table=x  -> columnas, índices y las últimas 20 filas de esa tabla (sin contraseñas)
 */
const HIDDEN = new Set(["password_hash"]);

export async function GET(req: Request) {
  const { err } = await guard(["dev"]);
  if (err) return err;
  const table = new URL(req.url).searchParams.get("table");

  const tables = await query<{ name: string; kind: string; engine: string | null; rows: number; size_kb: number; updated: string | null; collation: string | null }>(
    `SELECT table_name name, table_type kind, engine, table_rows \`rows\`,
       ROUND((data_length + index_length) / 1024) size_kb, DATE_FORMAT(update_time,'%Y-%m-%d %H:%i') updated, table_collation collation
     FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_type, table_name`,
  );

  if (!table) {
    const [[v], [chars]] = await Promise.all([
      query<{ v: string }>("SELECT VERSION() v"),
      query<{ cs: string; co: string }>("SELECT @@character_set_database cs, @@collation_database co"),
    ]);
    // COUNT exacto para las tablas pequeñas (table_rows es aproximado en InnoDB)
    const exact = await Promise.all(tables.map(async (t) => (t.kind === "BASE TABLE" ? Number((await query<{ n: number }>(`SELECT COUNT(*) n FROM \`${t.name}\``))[0]?.n ?? 0) : null)));
    return NextResponse.json({
      connection: { ...connectionInfo(), engine: v?.v.includes("MariaDB") ? "MariaDB" : "MySQL", version: v?.v ?? "", charset: chars?.cs, collation: chars?.co },
      tables: tables.map((t, i) => ({ ...t, rows: exact[i] ?? null, size_kb: Number(t.size_kb ?? 0) })),
    });
  }

  // Solo tablas que existen (el nombre nunca va directo del usuario a la consulta)
  const t = tables.find((x) => x.name === table);
  if (!t) return NextResponse.json({ error: "Esa tabla no existe" }, { status: 404 });
  const [columns, indexes, sample] = await Promise.all([
    query(`SHOW FULL COLUMNS FROM \`${t.name}\``),
    t.kind === "BASE TABLE" ? query(`SHOW INDEX FROM \`${t.name}\``) : Promise.resolve([]),
    queryList<Record<string, unknown>>(`SELECT * FROM \`${t.name}\` ${t.kind === "BASE TABLE" && (await hasId(t.name)) ? "ORDER BY id DESC" : ""} LIMIT 20`),
  ]);
  return NextResponse.json({
    table: t,
    columns,
    indexes,
    sample: sample.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, HIDDEN.has(k) ? "••••••" : Buffer.isBuffer(v) ? `[archivo ${Math.ceil(v.length / 1024)} KB]` : v]))),
  });
}

async function hasId(table: string) {
  return (await query("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'id'", [table])).length > 0;
}
