import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getStages } from "@/lib/guard";

/** Un encargado solo entra al módulo (PCL / YUR) donde tiene etapas; si no, vuelve a «Mi trabajo». */
export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ site: string }> }) {
  const [s, { site }] = await Promise.all([getSession(), params]);
  if (s?.role === "operator") {
    const stages = await getStages(s.id);
    if (!stages.some((st) => st.site === site.toUpperCase())) redirect("/my");
  }
  return children;
}
