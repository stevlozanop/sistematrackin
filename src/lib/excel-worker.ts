/// <reference lib="webworker" />
import { dedupe, parseWorkbook } from "./excel-parse";

/** Lee el Excel fuera de la pantalla (un HSP-OFICIAL de 30 MB tarda varios segundos y congelaría la página). */
self.onmessage = (e: MessageEvent<ArrayBuffer>) => {
  try {
    const parsed = parseWorkbook(new Uint8Array(e.data));
    const rows = dedupe(parsed.rows);
    self.postMessage({ ok: true, format: parsed.format, duplicates: parsed.rows.length - rows.length, rows });
  } catch (err) {
    self.postMessage({ ok: false, error: (err as Error).message || "No se pudo leer el Excel" });
  }
};
