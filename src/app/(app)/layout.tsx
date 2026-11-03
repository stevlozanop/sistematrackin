import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getStages } from "@/lib/guard";
import { query } from "@/lib/db";
import { brandCompany, ownCompany } from "@/lib/companies";
import { themeCss } from "@/lib/theme";
import { AppShell } from "@/components/AppShell";
import { LicenseWall } from "@/components/LicenseWall";
import { licenseMessage, licenseOfUser } from "@/lib/license";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  // Licencia de su empresa: si está suspendida o vencida, no ve nada del sistema (The Iceberg Labs siempre entra)
  const lic = s.role === "dev" ? null : await licenseOfUser(s.id);
  if (lic && lic.status !== "active") return <LicenseWall company={lic.company} message={licenseMessage(lic)} status={lic.status} />;
  // Aviso a la empresa cuando faltan 15 días o menos para que venza
  const notice = lic && lic.daysLeft !== null && lic.daysLeft <= 15 && (s.role === "admin" || s.role === "viewer") ? { company: lic.company ?? "", days: lic.daysLeft, date: lic.expiresAt ?? "" } : null;
  // El encargado solo ve los módulos (PCL / YUR) donde tiene etapas asignadas
  const stages = s.role === "operator" ? await getStages(s.id) : [];
  const sites = s.role === "operator" ? [...new Set(stages.map((st) => st.site))] : ["PCL", "YUR"];
  const fields = [...new Set(stages.map((st) => st.field))];
  // Primera vez: la guía del sistema se abre sola
  // Marca del menú (logo de la transportista) y empresa propia (avatar de la barra): se leen de la base en cada carga
  const [[u], brand, own] = await Promise.all([
    query<{ guide_seen: number; can_import: number }>("SELECT guide_seen, can_import FROM users WHERE id=?", [s.id]),
    brandCompany(s.id, s.role),
    ownCompany(s.id),
  ]);
  const isOwner = !!own && (await query("SELECT 1 FROM companies WHERE owner_id=?", [s.id])).length > 0;
  // Tema: The Iceberg Labs en blanco y negro; las demás cuentas con el color de su empresa
  const swm = s.role === "dev";
  // Botón único «Subir Excel»: la empresa y el consorcio suben unidades; el encargado con permiso, las fechas de su etapa
  const upload = s.role === "admin" || s.role === "viewer" ? "units" : s.role === "operator" ? "stage" : null;
  return (
    <>
    <style dangerouslySetInnerHTML={{ __html: themeCss(brand?.color ?? null, swm) }} />
    <AppShell name={s.name} role={s.role} sites={sites} fields={fields} firstGuide={!!u && !Number(u.guide_seen)} brand={brand} own={own} swm={swm} isOwner={isOwner} upload={upload} licenseNotice={notice}>
      {children}
    </AppShell>
    </>
  );
}
