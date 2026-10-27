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
    `SELECT c.relname AS name, CASE c.relkind WHEN 'v' THEN 'VIEW' ELSE 'BASE TABLE' END AS kind, NULL AS engine,
       GREATEST(c.reltuples, 0)::bigint AS "rows", ROUND(pg_total_relation_size(c.oid) / 1024.0) AS size_kb,
       NULL AS updated, NULL AS collation
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v') ORDER BY c.relkind, c.relname`,
  );

  if (!table) {
    const [[v]] = await Promise.all([query<{ v: string }>("SELECT current_setting('server_version') v")]);
    // COUNT exacto (reltuples es aproximado)
    const exact = await Promise.all(tables.map(async (t) => (t.kind === "BASE TABLE" ? Number((await query<{ n: number }>(`SELECT COUNT(*) n FROM "${t.name}"`))[0]?.n ?? 0) : null)));
    return NextResponse.json({
      connection: { ...connectionInfo(), engine: "PostgreSQL", version: v?.v.match(/PostgreSQL ([\d.]+)/)?.[1] ?? v?.v ?? "", charset: "UTF8", collation: "citext (sin distinguir mayúsculas)" },
      tables: tables.map((t, i) => ({ ...t, rows: exact[i] ?? null, size_kb: Number(t.size_kb ?? 0) })),
    });
  }

  // Solo tablas que existen (el nombre nunca va directo del usuario a la consulta)
  const t = tables.find((x) => x.name === table);
  if (!t) return NextResponse.json({ error: "Esa tabla no existe" }, { status: 404 });
  const [columns, indexes, sample] = await Promise.all([
    // Mismas columnas que mostraba SHOW FULL COLUMNS de MySQL
    query(
      `SELECT col.column_name AS "Field",
         CASE WHEN col.data_type = 'USER-DEFINED' THEN col.udt_name
              WHEN col.character_maximum_length IS NOT NULL THEN col.data_type || '(' || col.character_maximum_length || ')'
              ELSE col.data_type END AS "Type",
         col.is_nullable AS "Null",
         CASE WHEN EXISTS (SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
                           WHERE i.indrelid = ?::regclass AND a.attname = col.column_name AND i.indisprimary) THEN 'PRI'
              WHEN EXISTS (SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
                           WHERE i.indrelid = ?::regclass AND a.attname = col.column_name AND i.indisunique) THEN 'UNI'
              WHEN EXISTS (SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
                           WHERE i.indrelid = ?::regclass AND a.attname = col.column_name) THEN 'MUL'
              ELSE '' END AS "Key",
         col.column_default AS "Default", CASE WHEN col.is_identity = 'YES' THEN 'autonumérico' ELSE '' END AS "Extra",
         COALESCE(col_description(?::regclass, col.ordinal_position::int), '') AS "Comment"
       FROM information_schema.columns col
       WHERE col.table_schema = 'public' AND col.table_name = ? ORDER BY col.ordinal_position`,
      [t.name, t.name, t.name, t.name, t.name],
    ),
    // Mismas columnas que SHOW INDEX
    t.kind === "BASE TABLE" ? query(
      `SELECT ic.relname AS "Key_name", a.attname AS "Column_name", CASE WHEN i.indisunique THEN 0 ELSE 1 END AS "Non_unique"
       FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
       JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum, n) ON true
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
       WHERE i.indrelid = ?::regclass ORDER BY ic.relname, k.n`,
      [t.name],
    ) : Promise.resolve([]),
    queryList<Record<string, unknown>>(`SELECT * FROM "${t.name}" ${t.kind === "BASE TABLE" && (await hasId(t.name)) ? "ORDER BY id DESC" : ""} LIMIT 20`),
  ]);
  return NextResponse.json({
    table: t,
    columns,
    indexes,
    sample: sample.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, HIDDEN.has(k) ? "••••••" : Buffer.isBuffer(v) ? `[archivo ${Math.ceil(v.length / 1024)} KB]` : v]))),
  });
}

async function hasId(table: string) {
  return (await query("SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? AND column_name = 'id'", [table])).length > 0;
}
