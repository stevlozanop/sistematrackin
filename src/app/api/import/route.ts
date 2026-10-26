import { NextResponse } from "next/server";
import { queryList, tx } from "@/lib/db";
import { guard } from "@/lib/guard";
import { DATE_FIELDS, isSite } from "@/lib/hsp";
import { existing, saveRows, TEXT_FIELDS, type UnitRow } from "@/lib/importer";
import { fillDealerClients } from "@/lib/clients";
import { readJson } from "@/lib/gzip-json";

export const maxDuration = 300;

/** Máximo de filas por envío (el navegador manda el Excel en bloques). */
const CHUNK = 5000;

const str = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s ? s.slice(0, max) : null;
};
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Las filas llegan del navegador: se vuelven a limpiar antes de tocar la base. */
function clean(raw: unknown): UnitRow | null {
  const r = raw as Partial<UnitRow> | null;
  const chassis = str(r?.chassis, 40);
  if (!r || !isSite(r.site) || !chassis) return null;
  const fields = {} as UnitRow["fields"];
  for (const f of TEXT_FIELDS) fields[f] = str(r.fields?.[f], f === "observation" ? 500 : 120);
  const dates: UnitRow["dates"] = {};
  for (const d of DATE_FIELDS) if (r.dates && d in r.dates) dates[d] = day(r.dates[d]);
  return { site: r.site, chassis, dealer: str(r.dealer, 160), fields, billing_date: day(r.billing_date), dates };
}

/**
 * El navegador lee el Excel y llama en tres pasos (JSON, o JSON con gzip para los bloques grandes):
 * 1. { step: "check", keys: [{ site, chassis }] } → cuántas unidades ya existen (vista previa, no guarda nada).
 * 2. { step: "save", rows: [...] } → guarda un bloque de hasta 5000 filas.
 * 3. { step: "finish" } → asigna su cliente (SORSA, CREDIVARGAS…) a las tiendas nuevas.
 */
export async function POST(req: Request) {
  const { err } = await guard(["admin"]); // cargar el Excel: solo la empresa (The Iceberg Labs no opera)
  if (err) return err;

  const body = await readJson<{ step?: string; keys?: unknown[]; rows?: unknown[] }>(req);
  try {
    if (body?.step === "check") {
      const keys = (body.keys ?? [])
        .map((k) => k as { site?: unknown; chassis?: unknown })
        .filter((k): k is { site: "PCL" | "YUR"; chassis: string } => isSite(k.site) && typeof k.chassis === "string");
      const found = await existing(queryList, keys);
      return NextResponse.json({ exists: [...found] });
    }

    if (body?.step === "save") {
      const rows = (body.rows ?? []).slice(0, CHUNK).map(clean).filter((r): r is UnitRow => !!r);
      if (!rows.length) return NextResponse.json({ error: "El bloque no trae filas válidas" }, { status: 400 });
      return NextResponse.json(await tx((c) => saveRows(c, rows)));
    }

    if (body?.step === "finish") {
      await fillDealerClients();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  } catch (e) {
    console.error("[import]", e);
    return NextResponse.json({ error: "Error del servidor al procesar el Excel" }, { status: 500 });
  }
}
