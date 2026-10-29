import { NextResponse } from "next/server";
import { queryList } from "@/lib/db";
import { guard } from "@/lib/guard";

/** Tiempo real: número que sube con cada cambio de datos. Las pantallas lo consultan y se recargan si cambió. */
export async function GET() {
  const { err } = await guard(["dev", "admin", "operator", "viewer", "dealer"]);
  if (err) return err;
  const [r] = await queryList<{ v: number }>("SELECT v FROM data_version WHERE id = 1").catch(() => [{ v: 0 }]);
  return NextResponse.json({ v: Number(r?.v ?? 0) }, { headers: { "Cache-Control": "no-store" } });
}
