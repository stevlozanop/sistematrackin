import { NextResponse } from "next/server";
import { query, run } from "@/lib/db";
import { guard, SUPER } from "@/lib/guard";

export async function GET() {
  const { err } = await guard();
  if (err) return err;
  return NextResponse.json(
    await query(
      `SELECT d.id, d.name, d.department, d.district, d.coast,
         SUM(u.site='PCL') AS pcl, SUM(u.site='YUR') AS yur,
         SUM(u.d_entrega IS NULL AND u.id IS NOT NULL) AS pending
       FROM dealers d LEFT JOIN units u ON u.dealer_id = d.id
       GROUP BY d.id ORDER BY d.department, d.name`,
    ),
  );
}

/** PATCH { id, coast } — marca si el dealer va por Ruta Lima (pasos 5.1 y 5.2). */
export async function PATCH(req: Request) {
  const { err } = await guard(SUPER);
  if (err) return err;
  const { id, coast } = await req.json().catch(() => ({}));
  await run("UPDATE dealers SET coast=? WHERE id=?", [coast ? 1 : 0, Number(id)]);
  return NextResponse.json({ ok: true });
}
