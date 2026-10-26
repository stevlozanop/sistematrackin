import { NextResponse } from "next/server";
import { query, run } from "@/lib/db";
import { guard, READ, SUPER } from "@/lib/guard";

export async function GET() {
  const { err } = await guard(READ);
  if (err) return err;
  return NextResponse.json(
    await query(
      `SELECT d.id, d.name, d.department, d.district, d.coast, d.client,
         SUM(u.site='PCL') AS pcl, SUM(u.site='YUR') AS yur,
         SUM(u.d_entrega IS NULL AND u.id IS NOT NULL) AS pending
       FROM dealers d LEFT JOIN units u ON u.dealer_id = d.id
       GROUP BY d.id ORDER BY d.department, d.name`,
    ),
  );
}

/**
 * PATCH { id, coast } — marca si el dealer va por Ruta Lima (pasos 5.1 y 5.2).
 * PATCH { id, client } — cambia el cliente de Honda al que pertenece la tienda (sus cuentas ven todas sus tiendas).
 */
export async function PATCH(req: Request) {
  const { err } = await guard(SUPER);
  if (err) return err;
  const { id, coast, client } = await req.json().catch(() => ({}));
  if (client !== undefined) {
    const name = String(client ?? "").trim().toUpperCase().slice(0, 120);
    if (!name) return NextResponse.json({ error: "Escribe el nombre del cliente" }, { status: 400 });
    await run("UPDATE dealers SET client=? WHERE id=?", [name, Number(id)]);
    return NextResponse.json({ ok: true, client: name });
  }
  await run("UPDATE dealers SET coast=? WHERE id=?", [coast ? 1 : 0, Number(id)]);
  return NextResponse.json({ ok: true });
}
