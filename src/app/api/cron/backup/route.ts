import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { runBackup } from "@/lib/backup";

/** Respaldo automático de la base, una vez al día (Vercel lo llama con «Authorization: Bearer CRON_SECRET», ver vercel.json). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const r = await runBackup();
    await query("INSERT INTO dev_actions(user_id, action, target, detail) VALUES (NULL, 'Respaldo automático', ?, ?)",
      [r.name, `${r.tables} tablas · ${r.rows.toLocaleString("es-PE")} filas · ${(r.bytes / 1048576).toFixed(1)} MB`]).catch(() => {});
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    await query("INSERT INTO dev_actions(user_id, action, target, detail) VALUES (NULL, 'Respaldo automático falló', NULL, ?)", [(e as Error).message.slice(0, 300)]).catch(() => {});
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
