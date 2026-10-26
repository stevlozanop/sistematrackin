import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getStages } from "@/lib/guard";
import { query } from "@/lib/db";
import { brandCompany, ownCompany } from "@/lib/companies";
import { themeCss } from "@/lib/theme";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  // El encargado solo ve los módulos (PCL / YUR) donde tiene etapas asignadas
  const sites = s.role === "operator" ? [...new Set((await getStages(s.id)).map((st) => st.site))] : ["PCL", "YUR"];
  // Primera vez: la guía del sistema se abre sola
  // Marca del menú (logo de la transportista) y empresa propia (avatar de la barra): se leen de la base en cada carga
  const [[u], brand, own] = await Promise.all([
    query<{ guide_seen: number }>("SELECT guide_seen FROM users WHERE id=?", [s.id]),
    brandCompany(s.id, s.role),
    ownCompany(s.id),
  ]);
  // Tema: SWM Labs en blanco y negro; las demás cuentas con el color de su empresa
  const swm = s.role === "dev";
  return (
    <>
    <style dangerouslySetInnerHTML={{ __html: themeCss(brand?.color ?? null, swm) }} />
    <AppShell name={s.name} role={s.role} sites={sites} firstGuide={!!u && !Number(u.guide_seen)} brand={brand} own={own} swm={swm}>
      {children}
    </AppShell>
    </>
  );
}
