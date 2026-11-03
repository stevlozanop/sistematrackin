"use client";
import { Modal } from "@heroui/react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Marco común de los modales del sistema (mismo diseño que el editor de licencias):
 * ícono con el color de la empresa, título y subtítulo, contenido que entra suave, y pie con un resumen
 * en vivo a la izquierda y los botones a la derecha. Anchos según lo que hay adentro.
 */
const WIDTH = { sm: "sm:max-w-[440px]", md: "sm:max-w-[600px]", lg: "sm:max-w-[800px]", xl: "sm:max-w-[960px]" } as const;

export function Sheet({
  open, onClose, size = "md", icon: Icon, title, sub, tone = "primary", summary, footer, children, busy = false, onSubmit, bodyClassName,
}: {
  open: boolean; onClose: () => void; size?: keyof typeof WIDTH; icon: LucideIcon; title: React.ReactNode; sub?: React.ReactNode;
  /** primary = color de la empresa · danger = acciones que borran o quitan acceso */
  tone?: "primary" | "danger";
  summary?: React.ReactNode; footer?: React.ReactNode; children?: React.ReactNode; busy?: boolean;
  /** Si se pasa, el contenido va dentro de un formulario (Enter envía) */
  onSubmit?: (e: React.FormEvent) => void;
  bodyClassName?: string;
}) {
  const inner = (
    <>
      <Modal.CloseTrigger aria-label="Cerrar" />
      <Modal.Header className="flex flex-row items-center gap-3 pr-10">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tone === "danger" ? "bg-sb-late-soft text-sb-late" : "bg-sb-primary-soft text-sb-primary")}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 text-left">
          <Modal.Heading className="truncate text-base font-semibold tracking-tight">{title}</Modal.Heading>
          {sub && <p className="mt-0.5 text-[11px] leading-snug text-sb-on-surface-variant">{sub}</p>}
        </div>
      </Modal.Header>
      <Modal.Body className={cn("p-1", bodyClassName)}>
        <div className="flex flex-col gap-4">{children}</div>
      </Modal.Body>
      {(footer || summary) && (
        <Modal.Footer className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          {summary ? (
            <p className="min-w-0 text-xs text-sb-on-surface-variant sm:mr-auto">{summary}</p>
          ) : <span className="hidden sm:mr-auto sm:block" />}
          {/* En el celular los botones ocupan todo el ancho (más fáciles de tocar) */}
          {footer && <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap [&>*]:flex-1 sm:[&>*]:flex-none">{footer}</div>}
        </Modal.Footer>
      )}
    </>
  );
  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={(o) => !o && !busy && onClose()}>
        <Modal.Container size="lg" scroll="inside" className="p-2 sm:p-10">
          <Modal.Dialog className={cn("w-full p-4 sm:p-6", WIDTH[size])}>
            {onSubmit ? <form onSubmit={onSubmit} className="contents">{inner}</form> : inner}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/** Título de una sección dentro de un modal */
export const SheetSection = ({ title, hint, children, className }: { title: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <section className={cn("flex flex-col gap-2", className)}>
    <div>
      <h4 className="text-xs font-semibold">{title}</h4>
      {hint && <p className="text-[11px] text-sb-on-surface-variant">{hint}</p>}
    </div>
    {children}
  </section>
);
