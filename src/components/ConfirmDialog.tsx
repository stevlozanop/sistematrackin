"use client";
import { useState } from "react";
import { Button, Modal } from "@heroui/react";
import { AlertTriangle, Trash2 } from "lucide-react";

/**
 * Confirmación del sistema (en vez de la ventana del navegador): mismo diseño y colores de la empresa.
 * Para acciones que borran o deshacen algo: título, explicación, Cancelar y el botón de confirmar en rojo.
 */
export function ConfirmDialog({
  open, title, children, confirmLabel = "Sí, eliminar", busy = false, onConfirm, onCancel, requireText,
}: {
  open: boolean; title: string; children: React.ReactNode; confirmLabel?: string; busy?: boolean;
  onConfirm: () => void; onCancel: () => void;
  /** Palabra que hay que escribir para poder confirmar (para lo que no se puede deshacer, ej. «ELIMINAR») */
  requireText?: string;
}) {
  const [typed, setTyped] = useState("");
  const ready = !requireText || typed.trim().toUpperCase() === requireText.toUpperCase();
  const cancel = () => { setTyped(""); onCancel(); };
  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={(o) => !o && !busy && cancel()}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger aria-label="Cerrar" />
            <Modal.Header className="flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sb-late-soft text-sb-late"><AlertTriangle className="h-4 w-4" /></span>
              <Modal.Heading>{title}</Modal.Heading>
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
            <Modal.Footer>
              <Button variant="secondary" className="rounded-full" isDisabled={busy} onPress={cancel}>Cancelar</Button>
              <Button variant="danger" className="rounded-full" isDisabled={busy || !ready} onPress={() => { onConfirm(); setTyped(""); }}>
                <Trash2 className="h-3.5 w-3.5" /> {busy ? "Eliminando…" : confirmLabel}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
