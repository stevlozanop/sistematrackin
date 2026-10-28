"use client";
import { useRef, useState } from "react";
import { Modal, toast } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { FileSpreadsheet, Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import { ImportPanel, isUnknownExcel, readUnitsExcel, saveExcel, type Preview } from "@/components/ImportPanel";
import { StagePreview, type StagePreviewData } from "@/components/StageImport";

/**
 * Botón único «Subir Excel»: el sistema reconoce el archivo y lo lleva a donde corresponde.
 * - Facturación (FACT HSP-DATA / PCL-FACT): crea las unidades en IQT-Port y separa Yurimaguas / Pucallpa por distrito.
 * - HSP-OFICIAL (hojas PCL y YUR): crea y actualiza todo, con sus fechas.
 * - Fechas de una etapa (plantilla del encargado): registra solo las etapas de quien lo sube.
 * Quién: la empresa (Leyva) y el consorcio (Honda) suben unidades; el encargado con permiso, sus fechas.
 * Al guardar avisa a la pantalla abierta (evento «trackin:data») para que se actualice sola.
 */
export type UploadMode = "units" | "stage";

export const DATA_EVENT = "trackin:data";
export const notifyData = () => window.dispatchEvent(new Event(DATA_EVENT));

const EASE = [0.22, 1, 0.36, 1] as const;

export function UploadCenter({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: UploadMode }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [units, setUnits] = useState<Preview | null>(null);
  const [stage, setStage] = useState<StagePreviewData | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  const reset = () => { setUnits(null); setStage(null); setProgress(0); };
  const close = () => { if (saving) return; reset(); onClose(); };

  async function stageFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/import/stage", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    if (!r.ok) throw new Error(j.error);
    setStage(j);
  }

  async function read(file: File) {
    reset();
    setReading(file.name);
    try {
      if (mode === "stage") {
        // El encargado solo registra fechas de sus etapas (plantilla o el mismo HSP con su columna)
        if (file.size > 4_000_000) throw new Error("El archivo es muy grande para fechas de etapa: usa la plantilla de «Mi trabajo» (solo tus unidades).");
        await stageFile(file);
      } else {
        try {
          setUnits(await readUnitsExcel(file));
        } catch (e) {
          if (!isUnknownExcel(e)) throw e;
          throw new Error("No se reconoce el Excel. Sube la facturación (FACT HSP-DATA / PCL-FACT, con «Número Chasis» y «Nombre Tienda») o el HSP-OFICIAL (hojas PCL y YUR).");
        }
      }
    } catch (e) {
      toast.danger((e as Error).message);
    }
    setReading(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function saveUnits() {
    if (!units || units.saved) return;
    setSaving(true); setProgress(0);
    try {
      const j = await saveExcel(units.rows, setProgress);
      setUnits((p) => p && { ...p, saved: true });
      toast.success("Excel guardado: todo el sistema ya está actualizado", { description: `${j.created.toLocaleString()} nuevas, ${j.updated.toLocaleString()} actualizadas` });
      notifyData();
    } catch (e) {
      toast.danger((e as Error).message, { description: "Lo que alcanzó a guardarse se queda. Vuelve a subir el Excel para completar el resto." });
    }
    setSaving(false);
  }

  async function saveStage() {
    if (!stage || stage.saved) return;
    setSaving(true);
    const r = await fetch("/api/import/stage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: stage.token }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setSaving(false);
    if (!r.ok) return toast.danger(j.error);
    setStage((p) => p && { ...p, saved: true });
    toast.success(`${j.dates} fechas registradas en ${j.units} unidades`, { description: "Quedan bloqueadas y pasan a la siguiente etapa." });
    notifyData();
  }

  const hasPreview = !!units || !!stage;
  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={(o) => !o && close()}>
        <Modal.Container size={hasPreview ? "lg" : "md"} scroll="inside">
          <Modal.Dialog className={cn(hasPreview && "sm:max-w-5xl")}>
            <Modal.CloseTrigger aria-label="Cerrar" />
            <Modal.Header className="flex flex-col gap-1">
              <Modal.Heading>Subir Excel</Modal.Heading>
              <p className="text-xs text-sb-on-surface-variant">
                {mode === "stage"
                  ? "Sube la plantilla con las fechas de tus etapas. El sistema registra solo lo que te toca."
                  : "Sube la facturación o el HSP-OFICIAL. El sistema reconoce el archivo y lo distribuye: ruta por distrito, estado y plazos."}
              </p>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
              {!hasPreview && (
                <motion.button type="button" disabled={!!reading}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) read(f); }}
                  animate={{ scale: drag ? 1.02 : 1 }} transition={{ duration: 0.2, ease: EASE }}
                  className={cn("flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-200",
                    drag ? "border-sb-primary bg-sb-primary-soft" : "border-sb-outline-variant hover:border-sb-primary hover:bg-sb-surface-container-low")}>
                  <motion.span animate={reading ? { y: [0, -6, 0] } : { y: 0 }} transition={reading ? { repeat: Infinity, duration: 0.9 } : {}}
                    className="grid h-14 w-14 place-items-center rounded-2xl bg-sb-primary text-sb-on-primary">
                    {reading ? <FileSpreadsheet className="h-7 w-7" /> : <Upload className="h-7 w-7" />}
                  </motion.span>
                  <span className="text-sm font-semibold">{reading ? `Leyendo ${reading}…` : "Arrastra el Excel aquí o haz clic para elegirlo"}</span>
                  <span className="max-w-md text-[11px] text-sb-on-surface-variant">
                    {mode === "stage"
                      ? "Plantilla de «Mi trabajo» (Número Chasis + la columna de tu etapa)."
                      : "Facturación (FACT HSP-DATA / PCL-FACT) → unidades nuevas en IQT-Port, Yurimaguas o Pucallpa según el distrito · HSP-OFICIAL → crea y actualiza con sus fechas."}
                  </span>
                </motion.button>
              )}
              <AnimatePresence mode="wait">
                {units && (
                  <motion.div key="units" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                    <ImportPanel preview={units} saving={saving} progress={progress} onSave={saveUnits} onClose={reset} />
                  </motion.div>
                )}
                {stage && (
                  <motion.div key="stage" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                    <StagePreview preview={stage} saving={saving} onSave={saveStage} onClose={reset} />
                  </motion.div>
                )}
              </AnimatePresence>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
