import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth";

/**
 * Pantallas por tipo de cuenta (las APIs además validan el rol con guard()).
 * - dealer: solo su portal y su perfil.
 * - viewer (solo lectura, Honda): ve todo menos las pantallas de administración y de encargados.
 */
const DEALER_PAGES = ["/portal", "/profile"];
const VIEWER_BLOCKED = ["/admins", "/companies", "/settings", "/dealers", "/my", "/portal"];
const STAFF_BLOCKED = ["/portal"];

const starts = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(p + "/"));

export async function proxy(req: NextRequest) {
  const s = await verifySession(req.cookies.get("session")?.value);
  if (!s) return NextResponse.next(); // sin sesión: cada página lo manda al login
  const path = req.nextUrl.pathname;
  const go = (to: string) => NextResponse.redirect(new URL(to, req.url));
  if (s.role === "dealer") return starts(path, DEALER_PAGES) ? NextResponse.next() : go("/portal");
  if (s.role === "viewer") return starts(path, VIEWER_BLOCKED) ? go("/dashboard") : NextResponse.next();
  if (starts(path, STAFF_BLOCKED)) return go("/");
  if (s.role === "operator" && starts(path, ["/companies"])) return go("/"); // Empresas / consorcios: SWM Labs y supervisores
  if (s.role !== "dev" && starts(path, ["/dev"])) return go("/"); // Consola SWM Labs: solo dev
  return NextResponse.next();
}

export const config = {
  // Solo páginas: no las APIs, ni los archivos de Next, ni el login
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
};
