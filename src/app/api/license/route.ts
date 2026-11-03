import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { licenseMessage, licenseOfUser } from "@/lib/license";

/** GET: estado de la licencia de quien consulta (no pasa por guard: la pantalla de bloqueo la usa para saber cuándo vuelve) */
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (s.role === "dev") return NextResponse.json({ status: "active" });
  const l = await licenseOfUser(s.id);
  return NextResponse.json({ status: l.status, company: l.company, expiresAt: l.expiresAt, daysLeft: l.daysLeft, message: l.status === "active" ? null : licenseMessage(l) }, { headers: { "Cache-Control": "no-store" } });
}
