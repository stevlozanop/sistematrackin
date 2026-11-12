import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { logDev } from "@/lib/platform";
import { query } from "@/lib/db";
import { backupTarget, listBackups, readBackup, runBackup } from "@/lib/backup";

/**
 * Respaldos de la base (solo The Iceberg Labs):
 * GET → lista y el último resultado · GET ?file=respaldo-… → descarga · POST → respaldar ahora.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { s, err } = await guard(["dev"]);
  if (err) return err;
  const file = new URL(req.url).searchParams.get("file");
  if (file) {
    const buf = await readBackup(file);
    if (!buf) return NextResponse.json({ error: "Ese respaldo no existe" }, { status: 404 });
    await logDev(s.id, "Descargó un respaldo completo", file);
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="${file}"` } });
  }
  const [files, [last]] = await Promise.all([
    listBackups().catch(() => []),
    query<{ action: string; detail: string | null; at: string }>(
      "SELECT action, detail, DATE_FORMAT(at, '%Y-%m-%d %H:%i') at FROM dev_actions WHERE action IN ('Respaldo automático', 'Respaldo automático falló', 'Respaldó la base') ORDER BY id DESC LIMIT 1"),
  ]);
  return NextResponse.json({ target: backupTarget(), files, last: last ?? null });
}

export async function POST() {
  const { s, err } = await guard(["dev"]);
  if (err) return err;
  try {
    const r = await runBackup();
    await logDev(s.id, "Respaldó la base", r.name, `${r.tables} tablas · ${r.rows.toLocaleString("es-PE")} filas · ${(r.bytes / 1048576).toFixed(1)} MB`);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
