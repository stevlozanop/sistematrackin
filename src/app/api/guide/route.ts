import { NextResponse } from "next/server";
import { run } from "@/lib/db";
import { EVERYONE, guard } from "@/lib/guard";

/** Marca la guía del sistema como vista: ya no se abre sola al entrar. */
export async function POST() {
  const { s, err } = await guard(EVERYONE);
  if (err) return err;
  await run("UPDATE users SET guide_seen=1 WHERE id=?", [s.id]);
  return NextResponse.json({ ok: true });
}
