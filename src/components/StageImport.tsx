"use client";
import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { Download, Save, X } from "lucide-react";
import { Card } from "@/components/ui";
import { SITE_INFO, fmtDate, type DateField, type Site } from "@/lib/hsp";
import type { Stage } from "@/lib/workflow";

export type StagePreviewData = {
  token: string; name: string; columns: string[]; rows: number; units: number; dates: number; skipped: number;
  summary: Record<string, number>;
  skippedSample: { line: number; chassis: string; reason: string }[];
  sample: { chassis: string; site: Site; changes: Partial<Record<DateField, string>> }[];
  saved?: boolean;
};

const label = (site: Site, f: DateField) => SITE_INFO[site].dates.find((d) => d.key === f)?.label ?? f;

/** Plantilla del encargado: Excel con los chasis que esperan sus etapas. Se llena y se sube con «Subir Excel» del menú. */
export function StageImport({ stages }: { stages: Stage[] }) {
  const [busy, setBusy] = useState(false);

  /** Plantilla .xlsx con los chasis que esperan sus etapas (hasta 200 por etapa, primero los más urgentes). */
  async function template() {
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const needsCarrier = stages.some((s) => s.site === "PCL" && s.field === "d_despacho");
      const header = ["Número Chasis", "Módulo", ...stages.map((s) => label(s.site, s.field)), "Motivo de demora", ...(needsCarrier ? ["Empresa de transporte"] : [])];
      const rows: (string | null)[][] = [header];
      for (const st of stages) {
        const r = await fetch(`/api/units?site=${st.site}&pending=${st.field}&size=200&sort=days_left&dir=asc`);
        const j = await r.json();
        for (const u of j.rows ?? []) rows.push([u.chassis, st.site, ...stages.map(() => null), u.delay_reason ?? null, ...(needsCarrier ? [u.carrier ?? null] : [])]);
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = header.map((h) => ({ wch: Math.max(14, h.length + 2) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Registro");
      XLSX.writeFile(wb, `plantilla-${stages.map((s) => s.field.replace("d_", "")).join("-")}.xlsx`);
      toast.success("Plantilla descargada", { description: "Escribe la fecha en la columna de tu etapa (dd/mm/aaaa) y súbela con «Subir Excel» del menú." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" className="rounded-full" isDisabled={busy} onPress={template}>
        <Download className="h-3.5 w-3.5" /> Descargar plantilla
      </Button>
      <span className="self-center text-[11px] text-sb-on-surface-variant">Llénala y súbela con el botón <b>«Subir Excel»</b> del menú.</span>
    </div>
  );
}

/** Vista previa de un Excel de fechas de etapa (lo que se registrará y lo que no). */
export function StagePreview({ preview, saving, onSave, onClose, className }: {
  preview: StagePreviewData; saving: boolean; onSave: () => void; onClose: () => void; className?: string;
}) {
  return (
      <Card className={`flex flex-col overflow-hidden ${className ?? ""}`}>
        <div className="flex items-start justify-between gap-3 border-b border-sb-outline-variant/40 px-4 py-3">
          <div className="text-sm">
            <div className="font-semibold">Vista previa · {preview.name}</div>
            <div className="mt-1 text-xs text-sb-on-surface-variant">
              {preview.rows} filas con fecha · <b className="text-sb-ontime">{preview.dates} fechas se registrarán</b> en {preview.units} unidades
              {preview.skipped > 0 && <> · <b className="text-sb-late">{preview.skipped} no se registrarán</b></>}
            </div>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Cerrar vista previa" className="rounded-full p-1.5 opacity-50 hover:bg-sb-surface-container hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
        {preview.skipped > 0 && (
          <div className="border-b border-sb-outline-variant/40 bg-sb-late-soft px-4 py-2.5 text-xs">
            <b>Por qué no se registran algunas:</b>
            <ul className="mt-1 list-disc pl-5">
              {Object.entries(preview.summary).map(([reason, n]) => <li key={reason}>{reason}: {n}</li>)}
            </ul>
            <details className="mt-1">
              <summary className="cursor-pointer underline underline-offset-2">Ver filas</summary>
              <ul className="scroll-hidden mt-1 max-h-40 overflow-auto">
                {preview.skippedSample.map((s) => <li key={`${s.line}-${s.chassis}`}>Fila {s.line} · <span className="font-mono">{s.chassis}</span> · {s.reason}</li>)}
              </ul>
            </details>
          </div>
        )}
        <ul className="scroll-hidden max-h-64 divide-y divide-sb-outline-variant/25 overflow-auto text-xs">
          {preview.sample.map((u) => (
            <li key={u.chassis} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2">
              <span className="font-mono font-semibold">{u.chassis}</span>
              {Object.entries(u.changes).map(([f, v]) => <span key={f} className="text-sb-on-surface-variant">{label(u.site, f as DateField)}: <b className="text-sb-on-surface">{fmtDate(v)}</b></span>)}
            </li>
          ))}
          {!preview.sample.length && <li className="px-4 py-6 text-center text-sb-on-surface-variant/60">No hay fechas válidas para registrar.</li>}
        </ul>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-sb-outline-variant/40 px-4 py-3">
          {!preview.saved && <Button size="sm" variant="secondary" className="rounded-full" isDisabled={saving} onPress={onClose}>Cancelar</Button>}
          <Button size="sm" variant="primary"
            className={`rounded-full transition-opacity duration-300 ${preview.saved ? "pointer-events-none opacity-30" : ""}`}
            isDisabled={saving || preview.saved || !preview.dates} onPress={onSave}>
            <Save className="h-3.5 w-3.5" /> {preview.saved ? "Guardado ✓" : saving ? "Guardando…" : `Guardar ${preview.dates} fechas`}
          </Button>
        </div>
      </Card>
  );
}
