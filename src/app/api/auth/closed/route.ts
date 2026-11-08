import { NextResponse } from "next/server";

/** Sesión cerrada por The Iceberg Labs: borra la cookie y lleva al login con el aviso */
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/login?cerrada=1", req.url));
  res.cookies.delete("session");
  return res;
}
