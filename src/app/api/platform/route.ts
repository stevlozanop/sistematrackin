import { NextResponse } from "next/server";
import { maintenanceText, readPlatform } from "@/lib/platform";

/** Estado público de la plataforma (la pantalla de mantenimiento pregunta aquí si ya volvió) */
export async function GET() {
  const p = await readPlatform();
  return NextResponse.json({ maintenance: p.maintenance, message: p.maintenance ? maintenanceText(p) : null, until: p.until }, { headers: { "Cache-Control": "no-store" } });
}
