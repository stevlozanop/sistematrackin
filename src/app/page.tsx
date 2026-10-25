import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const s = await getSession();
  // El encargado entra directo a su trabajo; supervisores y super admin al dashboard
  redirect(!s ? "/login" : s.role === "operator" ? "/my" : "/dashboard");
}
