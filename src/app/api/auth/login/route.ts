import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { createSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  try {
    const [u] = await query<{
      id: number;
      name: string;
      email: string;
      password_hash: string;
      role: "dev" | "admin";
    }>("SELECT * FROM users WHERE email = ?", [
      String(email ?? "")
        .trim()
        .toLowerCase(),
    ]);
    if (!u || !bcrypt.compareSync(String(password ?? ""), u.password_hash)) {
      return NextResponse.json(
        { error: "Correo o contraseña incorrectos" },
        { status: 401 },
      );
    }
    await createSession({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[login]", e);
    return NextResponse.json(
      { error: "Error del servidor, intenta de nuevo" },
      { status: 500 },
    );
  }
}
