import { NextResponse } from "next/server";
import { queryList, tx } from "@/lib/db";
import { guard } from "@/lib/guard";
import { DATE_FIELDS, isSite } from "@/lib/hsp";
import { existing, movable, saveRows, TEXT_FIELDS, type UnitRow } from "@/lib/importer";
import { fillDealerClients } from "@/lib/clients";
import { readJson } from "@/lib/gzip-json";
import { clientConsortiumOf } from "@/lib/companies";
import { notifyNewUnits, pushLater } from "@/lib/push";

export const maxDuration = 300;

/** Máximo de filas por envío (el navegador manda el Excel en bloques). */
const CHUNK = 5000;

/**
 * Carga del personal de un consorcio: solo motos de su consorcio. Se descartan las filas cuyo dealer es de otro consorcio
 * o cuyo chasis ya existe a nombre de una tienda de otro consorcio (así Yamaha nunca pisa las motos de Honda).
 */
async function onlyOwn(rows: UnitRow[], cid: number) {
  const names = [...new Set(rows.map((r) => r.dealer?.slice(0, 160)).filter(Boolean) as string[])];
  const otherDealers = new Set<string>();
  for (let i = 0; i < names.length; i += 1000) {
    const found = await queryList<{ name: string }>("SELECT name FROM dealers WHERE name IN (?) AND company_id IS NOT NULL AND company_id <> ?", [names.slice(i, i + 1000), cid]);
    for (const d of found) otherDealers.add(d.name.toUpperCase());
  }
  const otherUnits = new Set<string>();
  for (const site of ["PCL", "YUR"] as const) {
    const list = rows.filter((r) => r.site === site).map((r) => r.chassis);
    for (let i = 0; i < list.length; i += 1000) {
      const found = await queryList<{ chassis: string }>(
        `SELECT u.chassis FROM units u JOIN dealers d ON d.id = u.dealer_id
          WHERE u.site = ? AND u.chassis IN (?) AND d.company_id IS NOT NULL AND d.company_id <> ?`, [site, list.slice(i, i + 1000), cid]);
      for (const u of found) otherUnits.add(`${site}|${u.chassis.toUpperCase()}`);
    }
  }
  const keep = rows.filter((r) => !(r.dealer && otherDealers.has(r.dealer.slice(0, 160).toUpperCase())) && !otherUnits.has(`${r.site}|${r.chassis.toUpperCase()}`));
  return { keep, skipped: rows.length - keep.length, names };
}

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
 * 0. { step: "begin", name } → crea la carga (lote) y devuelve batchId; save la usa para poder eliminarla después.
 * 3. { step: "finish" } → asigna su cliente (SORSA, CREDIVARGAS…) a las tiendas nuevas.
 * { step: "routes" } → rutas por distrito, para que el navegador ponga la ruta a la facturación.
 */
export async function POST(req: Request) {
  // Cargar el Excel: la empresa (Leyva) y el consorcio (Honda, desde su Tablero). The Iceberg Labs no opera.
  const { s, err } = await guard(["admin", "viewer"]);
  if (err) return err;
  if (s.role === "viewer" && !(await clientConsortiumOf(s))) return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 });

  const body = await readJson<{ step?: string; keys?: unknown[]; rows?: unknown[]; name?: string; batchId?: number }>(req);
  try {
    if (body?.step === "begin") {
      const [b] = await queryList<{ id: number }>(
        "INSERT INTO import_batches(kind, file_name, user_id) VALUES ('units', ?, ?) RETURNING id", [String(body.name ?? "").slice(0, 200) || null, s.id],
      );
      return NextResponse.json({ batchId: b.id });
    }

    if (body?.step === "routes") {
      const routes = await queryList("SELECT district, department, site, days FROM district_routes ORDER BY district");
      return NextResponse.json({ routes });
    }

    if (body?.step === "check") {
      const keys = (body.keys ?? [])
        .map((k) => k as { site?: unknown; chassis?: unknown })
        .filter((k): k is { site: "PCL" | "YUR"; chassis: string } => isSite(k.site) && typeof k.chassis === "string");
      const found = await existing(queryList, keys);
      // Las que están en la otra ruta sin ninguna fecha registrada se moverán: cuentan como «se actualizarán»
      for (const k of await movable(queryList, keys)) found.add(k);
      return NextResponse.json({ exists: [...found] });
    }

    if (body?.step === "save") {
      let rows = (body.rows ?? []).slice(0, CHUNK).map(clean).filter((r): r is UnitRow => !!r);
      if (!rows.length) return NextResponse.json({ error: "El bloque no trae filas válidas" }, { status: 400 });
      // Personal de un consorcio: solo sus motos; las tiendas nuevas quedan a nombre de su consorcio
      const cid = s.role === "viewer" ? await clientConsortiumOf(s) : null;
      let skipped = 0;
      if (cid) {
        const own = await onlyOwn(rows, cid);
        rows = own.keep; skipped = own.skipped;
        if (!rows.length) return NextResponse.json({ created: 0, updated: 0, skipped });
      }
      const batchId = Number(body.batchId) || null;
      const [own] = batchId ? await queryList<{ id: number }>("SELECT id FROM import_batches WHERE id = ? AND user_id = ? AND undone_at IS NULL", [batchId, s.id]) : [];
      const res = await tx(async (c) => {
        const r = await saveRows(c, rows, own ? batchId : null);
        if (cid) {
          const names = [...new Set(rows.map((x) => x.dealer?.slice(0, 160)).filter(Boolean) as string[])];
          if (names.length) await c.query("UPDATE dealers SET company_id = ? WHERE company_id IS NULL AND name IN (?)", [cid, names]);
        }
        if (own) await c.query("UPDATE import_batches SET created = created + ?, updated = updated + ? WHERE id = ?", [r.created, r.updated, batchId]);
        return r;
      });
      return NextResponse.json({ ...res, skipped });
    }

    if (body?.step === "finish") {
      await fillDealerClients();
      const batchId = Number(body.batchId) || 0;
      if (batchId) {
        const [b] = await queryList<{ created: number }>("SELECT created FROM import_batches WHERE id = ? AND user_id = ?", [batchId, s.id]);
        if (Number(b?.created) > 0) pushLater(() => notifyNewUnits(Number(b.created), s.id));
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  } catch (e) {
    console.error("[import]", e);
    return NextResponse.json({ error: "Error del servidor al procesar el Excel" }, { status: 500 });
  }
}
