import * as XLSX from "xlsx";
import { query } from "@/lib/db";
import { SECRET_COLUMN } from "@/lib/platform";
import { guard } from "@/lib/guard";
import { logDev } from "@/lib/platform";

/**
 * Respaldo de una tabla en Excel (solo dev), antes de una operación delicada.
 * Las columnas con contraseñas, llaves o tokens salen ocultas. Máximo 100 000 filas.
 */
const SECRET = SECRET_COLUMN;

export async function GET(req: Request) {
  const { s, err } = await guard(["dev"]);
  if (err) return err;
  const table = new URL(req.url).searchParams.get("table") ?? "";
  const [t] = await query<{ name: string }>("SELECT relname AS name FROM pg_stat_user_tables WHERE schemaname = 'public' AND relname = ?", [table]);
  if (!t) return Response.json({ error: "Esa tabla no existe" }, { status: 404 });
  const rows = await query<Record<string, unknown>>(`SELECT * FROM "public"."${t.name.replace(/"/g, '""')}" LIMIT 100000`);
  const clean = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, SECRET.test(k) && v != null ? "•••• oculto" : v instanceof Date ? v.toISOString().slice(0, 19).replace("T", " ") : v])));
  const ws = XLSX.utils.json_to_sheet(clean.length ? clean : [{ vacía: "Esta tabla no tiene filas" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t.name.slice(0, 31));
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  await logDev(s.id, "Descargó un respaldo", t.name, `${rows.length} filas`);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="respaldo-${t.name}-${day}.xlsx"`,
    },
  });
}
