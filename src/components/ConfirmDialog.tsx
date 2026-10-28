"use client";
import { Button, Modal } from "@heroui/react";
import { AlertTriangle, Trash2 } from "lucide-react";

/**
 * Confirmación del sistema (en vez de la ventana del navegador): mismo diseño y colores de la empresa.
 * Para acciones que borran o deshacen algo: título, explicación, Cancelar y el botón de confirmar en rojo.
 */
export function ConfirmDialog({
  open, title, children, confirmLabel = "Sí, eliminar", busy = false, onConfirm, onCancel,
}: {
  open: boolean; title: string; children: React.ReactNode; confirmLabel?: string; busy?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={(o) => !o && !busy && onCancel()}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger aria-label="Cerrar" />
            <Modal.Header className="flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sb-late-soft text-sb-late"><AlertTriangle className="h-4 w-4" /></span>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="p-1 text-sm text-sb-on-surface-variant">{children}</Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" className="rounded-full" isDisabled={busy} onPress={onCancel}>Cancelar</Button>
              <Button variant="danger" className="rounded-full" isDisabled={busy} onPress={onConfirm}>
                <Trash2 className="h-3.5 w-3.5" /> {busy ? "Eliminando…" : confirmLabel}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
