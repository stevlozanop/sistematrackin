import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const s = await getSession();
  // El encargado entra directo a su trabajo; el dealer a su portal; el resto al dashboard
  redirect(!s ? "/login" : s.role === "operator" ? "/my" : s.role === "dealer" ? "/portal/resumen" : "/dashboard");
}
