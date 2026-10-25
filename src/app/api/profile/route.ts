import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query, run } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { getScope, guard } from "@/lib/guard";

/** Perfil del usuario actual: datos, área, etapas y resumen de su actividad. */
export async function GET() {
  const { s, err } = await guard();
  if (err) return err;
  const [[u], scope, [act]] = await Promise.all([
    query<{ name: string; email: string; role: string; created_at: string; last_seen: string | null }>(
      "SELECT name, email, role, DATE_FORMAT(created_at,'%Y-%m-%d') created_at, DATE_FORMAT(last_seen,'%Y-%m-%d %H:%i') last_seen FROM users WHERE id=?",
      [s.id],
    ),
    getScope(s.id),
    query<{ total: number; today: number; week: number; last: string | null }>(
      `SELECT COUNT(*) total, SUM(at >= CURDATE()) today, SUM(at >= CURDATE() - INTERVAL 6 DAY) week,
         DATE_FORMAT(MAX(at),'%Y-%m-%d %H:%i') last
       FROM unit_events WHERE user_id=?`,
      [s.id],
    ),
  ]);
  if (!u) return NextResponse.json({ error: "No existe" }, { status: 404 });
  return NextResponse.json({
    ...u, id: s.id, area: scope.area, carrier: scope.carrier, canImport: scope.canImport, stages: scope.stages,
    activity: { total: Number(act?.total ?? 0), today: Number(act?.today ?? 0), week: Number(act?.week ?? 0), last: act?.last ?? null },
  });
}

/** PATCH { name } cambia el nombre · PATCH { current, password } cambia la contraseña. */
export async function PATCH(req: Request) {
  const { s, err } = await guard();
  if (err) return err;
  const b = await req.json().catch(() => ({}));

  if (b.name !== undefined) {
    const name = String(b.name).trim().slice(0, 120);
    if (name.length < 2) return NextResponse.json({ error: "Escribe tu nombre" }, { status: 400 });
    await run("UPDATE users SET name=? WHERE id=?", [name, s.id]);
    await createSession({ ...s, name }); // el nombre también va en la sesión (barra superior)
    return NextResponse.json({ ok: true });
  }

  const password = String(b.password ?? "");
  if (password.length < 8) return NextResponse.json({ error: "La nueva contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  const [u] = await query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id=?", [s.id]);
  if (!u || !bcrypt.compareSync(String(b.current ?? ""), u.password_hash)) {
    return NextResponse.json({ error: "La contraseña actual no es correcta" }, { status: 400 });
  }
  await run("UPDATE users SET password_hash=? WHERE id=?", [bcrypt.hashSync(password, 10), s.id]);
  return NextResponse.json({ ok: true });
}
