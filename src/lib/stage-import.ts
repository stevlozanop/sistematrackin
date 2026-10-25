import * as XLSX from "xlsx";
import type { DateField, Site } from "./hsp";
import { MAP, norm, sheetRows, text, toIso } from "./importer";

/** Excel de un encargado: solo las fechas de sus etapas. */

export type StageRow = {
  line: number;
  chassis: string;
  dates: Partial<Record<DateField, string>>;
  reason: string | null;
  carrier: string | null;
};

/** Nombre sin número de paso ni (in)/(out): "4. Entrega almacén (in)" -> "entrega almacen". */
const bareLabel = (label: string) => norm(label.replace(/^\d+(\.\d+)?\.\s*/, "").replace(/\s*\((in|out)\)\s*$/i, ""));

/**
 * Lee un Excel con "Número Chasis" y una columna por etapa (la plantilla del sistema o el mismo HSP-OFICIAL).
 * Solo toma las columnas de las etapas que se pasan; lo demás se ignora.
 */
export function parseStageWorkbook(buf: Buffer, stages: { site: Site; field: DateField }[], labels: Record<string, string>) {
  const wb = XLSX.read(buf, { type: "buffer", dense: true });
  for (const name of wb.SheetNames) {
    const { header, rows } = sheetRows(wb.Sheets[name]);
    const chassisIdx = header.findIndex((h) => h === "numero chasis" || h === "chasis" || h.includes("chasis"));
    if (chassisIdx < 0) continue;

    // Columna de cada etapa: por su nombre en el sistema o por el encabezado del HSP-OFICIAL
    const cols = new Map<DateField, number>();
    for (const st of stages) {
      const names = new Set<string>([
        norm(labels[`${st.site}|${st.field}`] ?? ""),
        bareLabel(labels[`${st.site}|${st.field}`] ?? ""),
        ...(((MAP[st.site] as Record<string, readonly string[]>)[st.field]) ?? []),
      ]);
      const i = header.findIndex((h) => names.has(h) || names.has(bareLabel(h)));
      if (i >= 0) cols.set(st.field, i);
    }
    if (!cols.size) continue;
    const find = (...names: string[]) => header.findIndex((h) => names.includes(h));
    const reasonIdx = find("motivo de demora", "motivo", "detalle", "demora");
    const carrierIdx = find("empresa de transporte", "tramo final", "transportista", "empresa");

    const out: StageRow[] = [];
    rows.forEach((r, i) => {
      const chassis = text(r[chassisIdx], 40);
      if (!chassis) return;
      const dates: StageRow["dates"] = {};
      for (const [field, idx] of cols) { const d = toIso(r[idx]); if (d) dates[field] = d; }
      if (!Object.keys(dates).length) return;
      out.push({
        line: i + 2, chassis, dates,
        reason: reasonIdx >= 0 ? text(r[reasonIdx], 60)?.toUpperCase() ?? null : null,
        carrier: carrierIdx >= 0 ? text(r[carrierIdx], 120)?.toUpperCase() ?? null : null,
      });
    });
    return { sheet: name, columns: [...cols.keys()], rows: out };
  }
  return null;
}
