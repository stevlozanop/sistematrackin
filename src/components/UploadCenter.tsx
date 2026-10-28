"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Modal, toast } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { FileSpreadsheet, History, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import { ImportPanel, isUnknownExcel, parseInBrowser, readUnitsExcel, saveExcel, type Preview } from "@/components/ImportPanel";
import { SITE_INFO, type DateField, type Site } from "@/lib/hsp";
import { StagePreview, type StagePreviewData } from "@/components/StageImport";
import { ConfirmDialog } from "@/components/ConfirmDialog";

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

type Batch = {
  id: number; kind: "units" | "stage" | "wipe"; file_name: string | null; created_at: string; created: number; updated: number; dates: number;
  undone_at: string | null; user_name: string | null; undone_by_name: string | null; mine: number; remaining: number;
};

/** Cargas guardadas: cada Excel subido, con el botón para eliminar lo que guardó. */
function SavedBatches() {
  const [data, setData] = useState<{ batches: Batch[]; canUndoAll: boolean; sites: Record<string, number> } | null>(null);
  // Vaciar datos (solo la empresa): rutas elegidas y confirmación escrita
  const [wipeSites, setWipeSites] = useState<string[]>([]);
  const [wipeAsk, setWipeAsk] = useState(false);
  const [wiping, setWiping] = useState(false);
  async function wipe() {
    setWiping(true);
    const r = await fetch("/api/import/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "wipe", sites: wipeSites, confirm: "ELIMINAR" }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setWiping(false); setWipeAsk(false);
    if (!r.ok) return toast.danger(j.error);
    toast.success(`Datos vaciados: ${j.sites.join(" y ")}`, { description: `${Number(j.deleted).toLocaleString()} unidades borradas` });
    setWipeSites([]);
    notifyData();
    setTick((x) => x + 1);
  }
  const [busy, setBusy] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch("/api/import/batches").then((r) => r.json()).then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [tick]);

  // Carga que se va a eliminar (se confirma en el modal del sistema)
  const [ask, setAsk] = useState<Batch | null>(null);

  async function undo(b: Batch) {
    setBusy(b.id);
    const r = await fetch("/api/import/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setBusy(null);
    if (!r.ok) return toast.danger(j.error);
    toast.success("Carga eliminada", {
      description: j.kind === "units"
        ? `${j.deleted.toLocaleString()} unidades borradas${j.kept ? ` · ${j.kept.toLocaleString()} se quedan porque ya tienen registros` : ""}`
        : `${j.undone.toLocaleString()} fechas devueltas a como estaban${j.kept ? ` · ${j.kept.toLocaleString()} se quedan porque ya hubo registros después` : ""}`,
      timeout: 8000,
    });
    notifyData();
    setAsk(null);
    setTick((x) => x + 1);
  }

  if (!data) return <p className="py-8 text-center text-sm text-sb-on-surface-variant">Cargando…</p>;
  const wipeCount = wipeSites.reduce((t, x) => t + (data.sites?.[x] ?? 0), 0);
  return (
    <div className="flex flex-col gap-4">
    {!data.batches.length && <p className="py-6 text-center text-sm text-sb-on-surface-variant">Todavía no hay cargas guardadas.</p>}
    {data.batches.length > 0 && (
    <ul className="flex flex-col divide-y divide-sb-outline-variant/30 rounded-xl border border-sb-outline-variant/40">
      <AnimatePresence initial={false}>
        {data.batches.map((b) => {
          const can = b.kind !== "wipe" && !b.undone_at && (data.canUndoAll || Number(b.mine));
          return (
            <motion.li key={b.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE }}
              className={cn("flex flex-wrap items-center justify-between gap-3 px-3 py-2.5", b.undone_at && "opacity-60")}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{b.file_name ?? "(sin nombre)"}</p>
                <p className="text-[11px] text-sb-on-surface-variant">
                  {b.kind === "units" ? "Unidades" : b.kind === "stage" ? "Fechas de etapa" : "Vaciado"} · {b.user_name ?? "—"} · {b.created_at}
                  {" · "}
                  {b.kind === "units" ? `${Number(b.created).toLocaleString()} nuevas, ${Number(b.updated).toLocaleString()} actualizadas`
                    : b.kind === "stage" ? `${Number(b.dates).toLocaleString()} fechas en ${Number(b.updated).toLocaleString()} unidades`
                    : `${Number(b.created).toLocaleString()} unidades borradas`}
                </p>
                {b.undone_at && <p className="text-[11px] font-medium text-sb-late">Eliminada por {b.undone_by_name ?? "—"} · {b.undone_at}</p>}
              </div>
              {can && (
                <Button size="sm" variant="secondary" className="rounded-full" isDisabled={busy === b.id} onPress={() => setAsk(b)}>
                  <Trash2 className="h-3.5 w-3.5" /> {busy === b.id ? "Eliminando…" : "Eliminar lo cargado"}
                </Button>
              )}
            </motion.li>
          );
        })}
      </AnimatePresence>
      <ConfirmDialog open={!!ask} title="¿Eliminar lo cargado?" confirmLabel="Sí, eliminar lo cargado" busy={!!ask && busy === ask.id}
        onCancel={() => setAsk(null)} onConfirm={() => ask && undo(ask)}>
        {ask && (ask.kind === "units" ? (
          <>Se borrarán las <b className="text-sb-on-surface">{Number(ask.created).toLocaleString()} unidades nuevas</b> que creó <b className="text-sb-on-surface">«{ask.file_name ?? "este Excel"}»</b> y que todavía nadie trabajó.
            Las que ya tienen registros de los encargados (embarque, zarpe, etc.) <b className="text-sb-on-surface">se quedan</b>.</>
        ) : (
          <>Las <b className="text-sb-on-surface">{Number(ask.dates).toLocaleString()} fechas</b> que registró <b className="text-sb-on-surface">«{ask.file_name ?? "este Excel"}»</b> vuelven a como estaban,
            salvo en las unidades donde alguien ya registró algo después.</>
        ))}
      </ConfirmDialog>
    </ul>
    )}

    {/* Vaciar datos: solo la empresa. Borra todas las unidades de la ruta elegida */}
    {data.canUndoAll && (
      <div className="flex flex-col gap-3 rounded-xl border border-sb-late/40 bg-sb-late-soft/40 p-3">
        <div>
          <p className="text-sm font-semibold text-sb-late">Vaciar datos</p>
          <p className="text-[11px] text-sb-on-surface-variant">Borra todas las unidades de la ruta, con sus fechas, motivos e historial. No se puede deshacer: después hay que volver a subir el Excel.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["PCL", "YUR"] as const).map((x) => {
            const on = wipeSites.includes(x);
            return (
              <button key={x} type="button" onClick={() => setWipeSites((w) => (on ? w.filter((y) => y !== x) : [...w, x]))}
                className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-200", on ? "border-sb-late bg-sb-late text-white" : "border-sb-outline-variant text-sb-on-surface-variant hover:text-sb-on-surface")}>
                {x === "PCL" ? "PCL · Pucallpa" : "YUR · Yurimaguas"} ({(data.sites?.[x] ?? 0).toLocaleString()})
              </button>
            );
          })}
          <Button size="sm" variant="danger" className="ml-auto rounded-full" isDisabled={!wipeSites.length || !wipeCount} onPress={() => setWipeAsk(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Vaciar…
          </Button>
        </div>
      </div>
    )}
    <ConfirmDialog open={wipeAsk} title={`¿Vaciar ${wipeSites.join(" y ")}?`} confirmLabel="Sí, vaciar" busy={wiping} requireText="ELIMINAR"
      onCancel={() => setWipeAsk(false)} onConfirm={wipe}>
      Se borrarán <b className="text-sb-on-surface">{wipeCount.toLocaleString()} unidades</b> de {wipeSites.map((x) => (x === "PCL" ? "Pucallpa" : "Yurimaguas")).join(" y ")},
      con sus fechas, motivos de demora, contenedores e historial. <b className="text-sb-on-surface">No se puede deshacer.</b>
    </ConfirmDialog>
    </div>
  );
}

export function UploadCenter({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: UploadMode }) {
  const [tab, setTab] = useState<"upload" | "history">("upload");
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

  /**
   * Encargado: si sube el archivo completo (HSP-OFICIAL), su navegador toma solo las columnas de sus etapas y de su ruta
   * y envía ese Excel pequeño. La plantilla de «Mi trabajo» (u otro Excel con sus columnas) se envía tal cual.
   */
  async function stageFromAnyFile(file: File) {
    let parsed: Awaited<ReturnType<typeof parseInBrowser>> | null = null;
    try {
      parsed = await parseInBrowser(file);
    } catch (e) {
      if (!isUnknownExcel(e)) throw e; // no es HSP ni facturación: es la plantilla u otro Excel con sus columnas
    }
    if (!parsed) {
      if (file.size > 4_000_000) throw new Error("El archivo es muy grande. Usa la plantilla de «Mi trabajo» (solo tus unidades).");
      return stageFile(file);
    }
    if (parsed.format === "FACT") throw new Error("Es la facturación: la sube la empresa. No trae fechas de tu etapa.");
    const me = await fetch("/api/me").then((r) => r.json()) as { stages: { site: Site; field: DateField }[] };
    const mine = me.stages ?? [];
    const label = (st: { site: Site; field: DateField }) => SITE_INFO[st.site].dates.find((d) => d.key === st.field)?.label ?? st.field;
    const fields = [...new Map(mine.map((st) => [st.field, st])).values()];
    const header = ["Número Chasis", ...fields.map(label), "Motivo de demora"];
    const rows = parsed.rows
      .filter((r) => mine.some((st) => st.site === r.site && r.dates[st.field]))
      .map((r) => [r.chassis, ...fields.map((st) => (r.site === st.site || mine.some((m) => m.site === r.site && m.field === st.field) ? r.dates[st.field] ?? null : null)), r.fields.delay_reason]);
    if (!rows.length) throw new Error(`Este archivo no trae fechas de tus etapas (${mine.map(label).join(", ")}).`);
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Registro");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return stageFile(new File([out], file.name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }

  async function read(file: File) {
    reset();
    setReading(file.name);
    try {
      if (mode === "stage") {
        // El encargado solo registra fechas de sus etapas (plantilla o el archivo completo: se toma solo lo suyo)
        await stageFromAnyFile(file);
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
      const j = await saveExcel(units.rows, setProgress, units.name);
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
                  ? "Sube tu plantilla o el archivo completo. El sistema toma solo las fechas de tus etapas y las registra con las reglas de siempre."
                  : "Sube la facturación o el HSP-OFICIAL. El sistema reconoce el archivo y lo distribuye: ruta por distrito, estado y plazos."}
              </p>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              {/* Subir un Excel · ver las cargas guardadas y eliminar lo que guardó una */}
              <div className="flex w-fit rounded-full bg-sb-surface-container p-1">
                {([["upload", "Subir", Upload], ["history", "Cargas guardadas", History]] as const).map(([k, t, Icon]) => (
                  <button key={k} type="button" onClick={() => setTab(k)}
                    className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200", tab === k ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
                    <Icon className="h-3.5 w-3.5" />{t}
                  </button>
                ))}
              </div>
              {tab === "history" ? <SavedBatches /> : (<>
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
                      ? "La plantilla de «Mi trabajo» o el HSP-OFICIAL completo: se toman solo las fechas de tus etapas."
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
              {(units?.saved || stage?.saved) && (
                <p className="text-[11px] text-sb-on-surface-variant">¿Te equivocaste de archivo? En <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setTab("history")}>Cargas guardadas</button> puedes eliminar lo que se guardó.</p>
              )}
              </>)}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
