import { NextResponse } from "next/server";
import { queryList, tx } from "@/lib/db";
import { guard } from "@/lib/guard";
import { dedupe, existing, parseWorkbook, saveRows, stash, takeStash } from "@/lib/importer";
import { fillDealerClients } from "@/lib/clients";

export const maxDuration = 300;

/**
 * Paso 1 (multipart con "file"): lee el Excel y devuelve una vista previa + token. No guarda nada.
 * Paso 2 (JSON { token }): guarda en la base de datos lo leído en el paso 1.
 */
export async function POST(req: Request) {
  const { err } = await guard(["admin"]); // cargar el Excel: solo la empresa (The Iceberg Labs no opera)
  if (err) return err;

  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const { token } = await req.json().catch(() => ({}));
      const p = takeStash(String(token ?? ""));
      if (!p) return NextResponse.json({ error: "La vista previa expiró. Vuelve a cargar el Excel." }, { status: 400 });
      const res = await tx((c) => saveRows(c, p.rows));
      await fillDealerClients(); // las tiendas nuevas quedan con su cliente (SORSA, CREDIVARGAS…)
      return NextResponse.json(res);
    }

    const file = (await req.formData().catch(() => null))?.get("file"); // sin formulario = sin archivo
    if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });

    let parsed;
    try {
      parsed = parseWorkbook(Buffer.from(await file.arrayBuffer()));
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    const all = parsed.rows;
    const rows = dedupe(all);
    const ex = await existing(queryList, rows);

    const bySite = (site: string) => {
      const list = rows.filter((r) => r.site === site);
      const upd = list.filter((r) => ex.has(`${r.site}|${r.chassis}`)).length;
      return { total: list.length, created: list.length - upd, updated: upd };
    };
    const token = stash({ rows, format: parsed.format, name: file.name });

    return NextResponse.json({
      token,
      format: parsed.format,
      duplicates: all.length - rows.length,
      sites: { PCL: bySite("PCL"), YUR: bySite("YUR") },
      sample: rows.slice(0, 200).map((r) => ({
        site: r.site,
        chassis: r.chassis,
        motor: r.fields.motor,
        material: r.fields.material,
        category: r.fields.category,
        dealer: r.dealer,
        zone: r.site === "PCL" ? r.fields.department : r.fields.route,
        billing: r.billing_date,
        delivered: r.dates.d_entrega ?? null,
        exists: ex.has(`${r.site}|${r.chassis}`),
      })),
    });
  } catch (e) {
    console.error("[import]", e);
    return NextResponse.json({ error: "Error del servidor al procesar el Excel" }, { status: 500 });
  }
}
