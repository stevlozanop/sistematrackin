import { PortalLogin } from "../portal";

/** /honda/clientes: entrada de los clientes del consorcio (SORSA, CREDIVARGAS…). */
export default async function ConsortiumClientsLogin({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PortalLogin slug={slug} audience="clients" />;
}
