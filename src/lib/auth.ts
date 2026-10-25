import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type Session = { id: number; name: string; email: string; role: "dev" | "admin" | "operator" };

function secret() {
  if (process.env.AUTH_SECRET) return new TextEncoder().encode(process.env.AUTH_SECRET);
  const f = path.join(process.cwd(), "data", ".secret");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  return new TextEncoder().encode(fs.readFileSync(f, "utf8"));
}

export async function createSession(s: Session) {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret());
  (await cookies()).set("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<Session | null> {
  const t = (await cookies()).get("session")?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function clearSession() {
  (await cookies()).delete("session");
}
