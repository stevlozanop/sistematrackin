import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { Role } from "./workflow";

export type Session = { id: number; name: string; email: string; role: Role };

function secret() {
  if (process.env.AUTH_SECRET) return new TextEncoder().encode(process.env.AUTH_SECRET);
  // En Vercel no se puede escribir en disco: la clave tiene que venir en las variables del proyecto
  if (process.env.VERCEL) throw new Error("Falta la variable AUTH_SECRET en Vercel");
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
  return verifySession((await cookies()).get("session")?.value);
}

/** Valida el token de sesión (también lo usa src/proxy.ts, que no tiene acceso a cookies()). */
export async function verifySession(t?: string): Promise<Session | null> {
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
