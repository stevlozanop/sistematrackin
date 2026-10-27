import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const s = await getSession();
  // El encargado entra directo a su trabajo; el dealer a su portal; Honda a su tablero; el resto al dashboard
  redirect(!s ? "/login" : s.role === "operator" ? "/my" : s.role === "dealer" ? "/portal/resumen" : s.role === "viewer" ? "/board" : "/dashboard");
}
