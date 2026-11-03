"use client";
import { useState } from "react";
import { Button, Modal } from "@heroui/react";
import { AlertTriangle, Trash2 } from "lucide-react";

/**
 * Confirmación del sistema (en vez de la ventana del navegador): mismo diseño y colores de la empresa.
 * Para acciones que borran o deshacen algo: título, explicación, Cancelar y el botón de confirmar en rojo.
 */
export function ConfirmDialog({
  open, title, children, confirmLabel = "Sí, eliminar", busy = false, onConfirm, onCancel, requireText, busyLabel = "Eliminando…", tone = "danger",
}: {
  open: boolean; title: string; children: React.ReactNode; confirmLabel?: string; busy?: boolean;
  onConfirm: () => void; onCancel: () => void;
  /** Palabra que hay que escribir para poder confirmar (para lo que no se puede deshacer, ej. «ELIMINAR») */
  requireText?: string;
  /** Texto mientras trabaja y color del botón (danger = rojo con papelera; primary = color de la empresa, sin papelera) */
  busyLabel?: string;
  tone?: "danger" | "primary";
}) {
  const [typed, setTyped] = useState("");
  const ready = !requireText || typed.trim().toUpperCase() === requireText.toUpperCase();
  const cancel = () => { setTyped(""); onCancel(); };
  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={(o) => !o && !busy && cancel()}>
        <Modal.Container className="p-2 sm:p-10">
          <Modal.Dialog className="w-full p-4 sm:p-6">
            <Modal.CloseTrigger aria-label="Cerrar" />
            <Modal.Header className="flex flex-row items-center gap-3 pr-10">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone === "danger" ? "bg-sb-late-soft text-sb-late" : "bg-sb-primary-soft text-sb-primary"}`}><AlertTriangle className="h-[18px] w-[18px]" /></span>
              <Modal.Heading className="text-base font-semibold tracking-tight">{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3 p-1 text-sm text-sb-on-surface-variant">
              <div>{children}</div>
              {requireText && (
                <label className="flex flex-col gap-1 text-xs">
                  Para confirmar, escribe <b className="text-sb-on-surface">{requireText}</b>
                  <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy}
                    className="h-10 rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm uppercase text-sb-on-surface outline-none focus:border-sb-late" />
                </label>
              )}
            </Modal.Body>
            <Modal.Footer className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
              <Button variant="secondary" className="rounded-full" isDisabled={busy} onPress={cancel}>Cancelar</Button>
              <Button variant={tone === "danger" ? "danger" : "primary"} className="rounded-full" isDisabled={busy || !ready} onPress={() => { onConfirm(); setTyped(""); }}>
                {tone === "danger" && <Trash2 className="h-3.5 w-3.5" />} {busy ? busyLabel : confirmLabel}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
