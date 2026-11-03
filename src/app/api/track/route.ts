import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { trackPage } from "@/lib/activity";

/** POST { path }: la pantalla que se acaba de abrir (para la consola The Iceberg Labs) */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return new NextResponse(null, { status: 204 });
  const body = await req.json().catch(() => ({}));
  const path = String(body.path ?? "");
  if (path.startsWith("/")) trackPage(s.id, path);
  return new NextResponse(null, { status: 204 });
}
