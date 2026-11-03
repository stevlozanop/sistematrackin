import { NextResponse } from "next/server";
import { clearSession, getSession } from "@/lib/auth";
import { authEvent } from "@/lib/activity";

export async function POST() {
  const s = await getSession();
  if (s) await authEvent("logout", s.id, s.email);
  await clearSession();
  return NextResponse.json({ ok: true });
}
