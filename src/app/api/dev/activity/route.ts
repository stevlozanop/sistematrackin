import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { feed } from "@/lib/dev-feed";

/** Consola The Iceberg Labs · Interacciones: GET ?kind=all|view|auth|fail|event|import&user=ID&dev=1&limit=200 */
export async function GET(req: Request) {
  const { err } = await guard(["dev"]);
  if (err) return err;
  const sp = new URL(req.url).searchParams;
  const kind = ["all", "view", "auth", "login", "fail", "logout", "event", "import"].includes(sp.get("kind") ?? "") ? sp.get("kind")! : "all";
  const rows = await feed({
    kind, userId: Number(sp.get("user")) || 0, withDev: sp.get("dev") === "1",
    limit: Math.min(500, Math.max(20, Number(sp.get("limit")) || 200)), days: 30,
  });
  return NextResponse.json({ rows });
}
