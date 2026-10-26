import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { portalBySlug } from "@/lib/companies";
import { DEFAULT_COLOR, isColor } from "@/lib/theme";
import { LoginForm } from "@/components/LoginForm";

/** Entrada propia de un consorcio (ej. /honda y /honda/clientes), con su nombre, logo y color. */
export async function PortalLogin({ slug, audience }: { slug: string; audience: "staff" | "clients" }) {
  const c = await portalBySlug(slug);
  if (!c) notFound();
  if (await getSession()) redirect("/"); // ya inició sesión: a su pantalla
  return (
    <LoginForm brand={{
      slug: slug.toLowerCase(), name: c.name, code: c.code, audience,
      color: isColor(c.color) ? c.color : DEFAULT_COLOR,
      logo: c.v ? `/api/companies/logo?id=${c.id}&v=${c.v}` : null,
    }} />
  );
}
