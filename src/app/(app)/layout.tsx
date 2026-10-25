import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getStages } from "@/lib/guard";
import { query } from "@/lib/db";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  // El encargado solo ve los módulos (PCL / YUR) donde tiene etapas asignadas
  const sites = s.role === "operator" ? [...new Set((await getStages(s.id)).map((st) => st.site))] : ["PCL", "YUR"];
  // Primera vez: la guía del sistema se abre sola
  const [u] = await query<{ guide_seen: number }>("SELECT guide_seen FROM users WHERE id=?", [s.id]);
  return (
    <AppShell name={s.name} role={s.role} sites={sites} firstGuide={!!u && !Number(u.guide_seen)}>
      {children}
    </AppShell>
  );
}
