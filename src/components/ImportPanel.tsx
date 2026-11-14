"use client";
import { useState } from "react";
import { Button, Chip, toast } from "@heroui/react";
import { FilePlus2, Save, X } from "lucide-react";
import { Card, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { fmtDate, type Site } from "@/lib/hsp";
import { applyRoutes, dedupe, type DistrictRoute, type UnitRow } from "@/lib/excel-parse";
import { GZIP_JSON, gzipJson } from "@/lib/gzip-json";

export type Preview = {
  name: string;
  rows: UnitRow[]; // filas leídas en el navegador; se envían al guardar
  format: "HSP" | "FACT";
  duplicates: number;
  /** Varios Excel a la vez: filas de cada uno (la suma, sin repetidos, es rows.length). */
  files?: { name: string; rows: number; added: number }[];
  sites: Record<Site, { total: number; created: number; updated: number }>;
  sample: {
    site: Site; chassis: string; motor: string | null; material: string | null; category: string | null;
    dealer: string | null; zone: string | null; billing: string | null; delivered: string | null; exists: boolean;
  }[];
  saved: boolean;
};

const KEYS_CHUNK = 20000; // chasis por consulta en la vista previa
const SAVE_CHUNK = 5000; // filas por envío al guardar (lo mismo que acepta /api/import)

async function post(body: unknown) {
  const r = await fetch("/api/import", { method: "POST", headers: { "Content-Type": GZIP_JSON }, body: await gzipJson(body) });
  const j = await r.json().catch(() => ({ error: "Error del servidor" }));
  if (!r.ok) throw new Error(j.error ?? "Error del servidor");
  return j;
}

/** Lee el Excel en un worker del navegador (no congela la pantalla). */
export async function parseInBrowser(file: File) {
  const buf = await file.arrayBuffer();
  return new Promise<{ format: "HSP" | "FACT"; duplicates: number; rows: UnitRow[] }>((resolve, reject) => {
    const w = new Worker(new URL("../lib/excel-worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e) => {
      w.terminate();
      if (e.data.ok) resolve(e.data);
      else reject(new Error(e.data.error));
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "No se pudo leer el Excel")); };
    w.postMessage(buf, [buf]);
  });
}

/** Lee el Excel en el navegador y arma la vista previa (no guarda nada). Si falla, avisa y devuelve null. */
export async function readExcel(file: File): Promise<Preview | null> {
  try {
    return await readUnitsExcel(file);
  } catch (e) {
    toast.danger((e as Error).message);
    return null;
  }
}

/** Mensaje del lector cuando el archivo no es HSP-OFICIAL ni facturación. */
export const isUnknownExcel = (e: unknown) => /No se reconoce el Excel/.test((e as Error)?.message ?? "");

/** Igual que readExcel, pero lanza el error (el botón único decide qué hacer con un archivo que no es de unidades). */
export async function readUnitsExcel(input: File | File[]): Promise<Preview> {
  {
    // Varios Excel (uno viejo y uno nuevo, o varios días): del más antiguo al más nuevo, así las fechas nuevas ganan
    const files = (Array.isArray(input) ? [...input] : [input]).sort((a, b) => a.lastModified - b.lastModified);
    let routes: DistrictRoute[] | null = null;
    const all: UnitRow[] = [], per: { name: string; rows: number; added: number }[] = [];
    const seen = new Set<string>();
    let duplicates = 0, fact = 0;
    for (const file of files) {
      const parsed = await parseInBrowser(file);
      duplicates += parsed.duplicates;
      // Facturación: la ruta sale del distrito (lista de Yurimaguas; el resto, Pucallpa)
      if (parsed.format === "FACT") {
        fact++;
        routes ??= (await post({ step: "routes" })).routes as DistrictRoute[];
        applyRoutes(parsed.rows, routes);
      }
      // Cuántas motos trae este archivo que no estaban en los anteriores
      let added = 0;
      for (const r of parsed.rows) { const k = `${r.site}|${r.chassis.toUpperCase()}`; if (!seen.has(k)) { seen.add(k); added++; } }
      per.push({ name: file.name, rows: parsed.rows.length, added });
      all.push(...parsed.rows);
    }
    const rows = files.length > 1 ? dedupe(all) : all;
    duplicates += all.length - rows.length;
    const format: Preview["format"] = fact === files.length ? "FACT" : "HSP";
    const file = { name: files.length > 1 ? `${files.length} archivos` : files[0].name };
    const exists = new Set<string>();
    for (let i = 0; i < rows.length; i += KEYS_CHUNK) {
      const keys = rows.slice(i, i + KEYS_CHUNK).map((r) => ({ site: r.site, chassis: r.chassis }));
      for (const k of (await post({ step: "check", keys })).exists as string[]) exists.add(k);
    }
    const has = (r: UnitRow) => exists.has(`${r.site}|${r.chassis.toUpperCase()}`);
    const bySite = (site: Site) => {
      const list = rows.filter((r) => r.site === site);
      const upd = list.filter(has).length;
      return { total: list.length, created: list.length - upd, updated: upd };
    };
    return {
      name: file.name, rows, format, duplicates, saved: false, files: files.length > 1 ? per : undefined,
      sites: { PCL: bySite("PCL"), YUR: bySite("YUR") },
      sample: rows.slice(0, 200).map((r) => ({
        site: r.site, chassis: r.chassis, motor: r.fields.motor, material: r.fields.material, category: r.fields.category,
        dealer: r.dealer, zone: r.site === "PCL" ? r.fields.department : r.fields.route ?? r.fields.district,
        billing: r.billing_date, delivered: r.dates.d_entrega ?? null, exists: has(r),
      })),
    };
  }
}

/** Guarda las filas en bloques. onProgress recibe de 0 a 1. */
export async function saveExcel(rows: UnitRow[], onProgress: (p: number) => void, name?: string) {
  let created = 0, updated = 0, skipped = 0;
  // La carga queda registrada (qué archivo, quién, cuándo) para poder eliminar lo que guardó
  const { batchId } = await post({ step: "begin", name });
  for (let i = 0; i < rows.length; i += SAVE_CHUNK) {
    const j = await post({ step: "save", rows: rows.slice(i, i + SAVE_CHUNK), batchId });
    created += j.created; updated += j.updated; skipped += Number(j.skipped ?? 0);
    onProgress(Math.min(1, (i + SAVE_CHUNK) / rows.length));
  }
  await post({ step: "finish", batchId });
  return { created, updated, skipped };
}

export function ImportPanel({
  preview, saving, progress = 0, onSave, onClose, onAdd, onDropAdd, adding,
}: {
  preview: Preview; saving: boolean; progress?: number; onSave: () => void; onClose: () => void;
  /** Sumar otro Excel a esta vista previa (botón o arrastrándolo encima). */
  onAdd?: () => void; onDropAdd?: (files: File[]) => void; adding?: string | null;
}) {
  const total = preview.sites.PCL.total + preview.sites.YUR.total;
  const [over, setOver] = useState(false);
  return (
    <Card className={`sb-anim-table-in relative flex flex-col overflow-hidden transition-shadow duration-200 ${over ? "ring-2 ring-sb-primary" : ""}`}
      onDragOver={onDropAdd && !saving ? (e) => { e.preventDefault(); setOver(true); } : undefined}
      onDragLeave={() => setOver(false)}
      onDrop={onDropAdd && !saving ? (e) => { e.preventDefault(); setOver(false); onDropAdd([...(e.dataTransfer.files ?? [])].slice(0, 20)); } : undefined}>
      {(over || adding) && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-sb-surface/85 text-sm font-semibold text-sb-primary backdrop-blur-[2px]">
          {adding ? `Leyendo ${adding}…` : "Suelta el Excel para sumarlo"}
        </div>
      )}
      <div className="flex items-start justify-between gap-3 border-b border-sb-outline-variant/40 px-4 py-3">
        <div>
          <div className="text-sm font-semibold">
            Vista previa · {preview.name}{" "}
            <span className="font-normal text-sb-on-surface-variant/70">({preview.format === "HSP" ? "HSP-OFICIAL" : "PCL-FACT facturación"})</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-sb-on-surface-variant/80">
            {(["PCL", "YUR"] as const).filter((s) => preview.sites[s].total).map((s) => (
              <span key={s}>
                <b className="text-sb-on-surface">{s}</b>: {preview.sites[s].total.toLocaleString()} unidades · {preview.sites[s].created.toLocaleString()} nuevas · {preview.sites[s].updated.toLocaleString()} se actualizarán
              </span>
            ))}
            {preview.duplicates > 0 && !preview.files && <span>{preview.duplicates.toLocaleString()} chasis repetidos se juntaron en uno (gana el dato más nuevo; una celda vacía no borra nada)</span>}
          </div>
          {preview.files && (() => {
            const files = preview.files;
            const sum = files.reduce((t, f) => t + f.rows, 0), rep = sum - total;
            return (
              <div className="mt-2 flex flex-col gap-1.5 text-[11px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  {files.map((f, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-sb-on-surface-variant/60">+</span>}
                      <span className="max-w-[14rem] truncate rounded-full bg-sb-surface-container px-2 py-0.5" title={f.name}>
                        {f.name} · <b>{f.rows.toLocaleString()}</b>
                      </span>
                    </span>
                  ))}
                  {rep > 0 && <><span className="text-sb-on-surface-variant/60">−</span>
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300">{rep.toLocaleString()} repetidas</span></>}
                  <span className="text-sb-on-surface-variant/60">=</span>
                  <span className="rounded-full bg-sb-primary-soft px-2 py-0.5 font-semibold text-sb-primary">{total.toLocaleString()} unidades</span>
                </div>
                {files.map((f, i) => i > 0 && f.added < f.rows && (
                  <span key={i} className="text-sb-on-surface-variant/80">
                    {f.added === 0
                      ? <>Las <b>{f.rows.toLocaleString()}</b> de «{f.name}» ya estaban en el otro archivo: no suma motos nuevas, solo actualiza sus datos.</>
                      : <>«{f.name}» suma <b>{f.added.toLocaleString()}</b> motos nuevas; las otras {(f.rows - f.added).toLocaleString()} ya estaban en el otro archivo.</>}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
        <button onClick={onClose} disabled={saving} aria-label="Cerrar vista previa" className="rounded-full p-1.5 opacity-50 hover:bg-sb-surface-container hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="scroll-hidden max-h-80 overflow-auto">
        <Table>
          <Thead>
            <Th>Módulo</Th><Th>Chasis / Motor</Th><Th>Modelo</Th><Th>Dealer</Th><Th>Zona</Th><Th>F. facturación</Th><Th>Entrega</Th><Th>Acción</Th>
          </Thead>
          <tbody>
            {preview.sample.map((r, i) => (
              <Tr key={`${r.site}-${r.chassis}-${i}`}>
                <Td>{r.site}</Td>
                <Td><div className="font-mono font-medium">{r.chassis}</div><div className="font-mono text-[10px] text-muted">{r.motor}</div></Td>
                <Td><div>{r.material}</div><div className="text-[10px] text-muted">{r.category}</div></Td>
                <Td className="max-w-[14rem] truncate">{r.dealer}</Td>
                <Td>{r.zone}</Td>
                <Td>{fmtDate(r.billing) || "—"}</Td>
                <Td>{fmtDate(r.delivered) || "—"}</Td>
                <Td><Chip size="sm" variant="soft" color={r.exists ? "default" : "accent"}>{r.exists ? "Actualizar" : "Nueva"}</Chip></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sb-outline-variant/40 px-4 py-3">
        <span className="text-[11px] text-sb-on-surface-variant/70">
          {total > preview.sample.length ? `Mostrando ${preview.sample.length} de ${total.toLocaleString()} filas.` : `${total} filas.`}
          {preview.format === "FACT" && " La facturación no borra las fechas que ya estén registradas."}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {onAdd && (
            <Button size="sm" variant="secondary" className="rounded-full" isDisabled={saving || !!adding} onPress={onAdd}>
              <FilePlus2 className="h-3.5 w-3.5" /> {preview.saved ? "Subir otro Excel" : "Agregar otro Excel"}
            </Button>
          )}
          {!preview.saved && (
            <Button size="sm" variant="secondary" className="rounded-full" isDisabled={saving} onPress={onClose}>Cancelar</Button>
          )}
          <Button
            size="sm"
            variant="primary"
            className={`rounded-full transition-opacity duration-300 ${preview.saved ? "pointer-events-none opacity-30" : ""}`}
            isDisabled={saving || preview.saved || !total}
            onPress={onSave}
          >
            <Save className="h-3.5 w-3.5" /> {preview.saved ? "Guardado ✓" : saving ? `Guardando… ${Math.round(progress * 100)}%` : "Guardar"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
