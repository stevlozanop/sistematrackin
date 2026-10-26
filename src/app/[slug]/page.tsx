import { PortalLogin } from "./portal";

/** /honda: entrada del equipo del consorcio (su cuenta principal y sus empleados). */
export default async function ConsortiumLogin({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PortalLogin slug={slug} audience="staff" />;
}
