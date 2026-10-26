import { NextResponse } from "next/server";
import { query, run } from "@/lib/db";
import { EVERYONE, guard } from "@/lib/guard";
import { canManage, myCompany } from "@/lib/companies";

/**
 * Logo (foto de perfil) de una empresa, guardado en la base.
 * GET    ?id=  -> la imagen (pública: menú, barra superior y entrada propia /honda)
 * PUT    ?id=  { dataUrl } -> cambia el logo (The Iceberg Labs: todas · supervisor: su empresa y sus consorcios ·
 *                            cuenta de solo lectura: el de su propia empresa)
 * DELETE ?id=  -> quita el logo
 * La pantalla reduce la imagen a 256 px antes de enviarla.
 */
const TYPES = new Set(["image/webp", "image/png", "image/jpeg"]);
const MAX_BYTES = 300 * 1024;

async function allowed(s: Parameters<typeof canManage>[0], id: number) {
  if (await canManage(s, id, true)) return true;
  return s.role === "viewer" && (await myCompany(s)) === id;
}

// GET es público: el logo también se muestra en la entrada propia de cada consorcio (/honda), antes de iniciar sesión
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  const [c] = await query<{ logo: Buffer | null; logo_type: string | null }>("SELECT logo, logo_type FROM companies WHERE id=?", [id]);
  if (!c?.logo) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(c.logo), {
    headers: {
      "Content-Type": c.logo_type ?? "image/png",
      // La URL lleva ?v=<fecha de cambio>: el navegador puede guardarla mucho tiempo y se renueva sola al cambiar el logo
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

export async function PUT(req: Request) {
  const { s, err } = await guard(EVERYONE);
  if (err) return err;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!(await allowed(s, id))) return NextResponse.json({ error: "No puedes cambiar el logo de esa empresa" }, { status: 403 });
  const { dataUrl } = await req.json().catch(() => ({}));
  const m = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ""));
  if (!m || !TYPES.has(m[1])) return NextResponse.json({ error: "Sube una imagen PNG, JPG o WEBP" }, { status: 400 });
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "La imagen es muy pesada (máx. 300 KB)" }, { status: 400 });
  await run("UPDATE companies SET logo=?, logo_type=?, logo_updated=NOW() WHERE id=?", [bytes, m[1], id]);
  const [c] = await query<{ v: string }>("SELECT UNIX_TIMESTAMP(logo_updated) v FROM companies WHERE id=?", [id]);
  return NextResponse.json({ ok: true, v: c?.v });
}

export async function DELETE(req: Request) {
  const { s, err } = await guard(EVERYONE);
  if (err) return err;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!(await allowed(s, id))) return NextResponse.json({ error: "No puedes cambiar el logo de esa empresa" }, { status: 403 });
  await run("UPDATE companies SET logo=NULL, logo_type=NULL, logo_updated=NULL WHERE id=?", [id]);
  return NextResponse.json({ ok: true });
}
