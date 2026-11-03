"use client";
import { motion } from "framer-motion";
import { Modal } from "@heroui/react";
import { Sparkles, type LucideIcon } from "lucide-react";
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
        <motion.span initial={{ scale: 0.6, rotate: -10, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 320, damping: 18 }}
          className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tone === "danger" ? "bg-sb-late-soft text-sb-late" : "bg-sb-primary text-sb-on-primary")}>
          <Icon className="h-[18px] w-[18px]" />
        </motion.span>
        <div className="min-w-0 text-left">
          <Modal.Heading className="truncate text-base font-semibold tracking-tight">{title}</Modal.Heading>
          {sub && <p className="mt-0.5 text-[11px] leading-snug text-sb-on-surface-variant">{sub}</p>}
        </div>
      </Modal.Header>
      <Modal.Body className={cn("p-1", bodyClassName)}>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05, ease: [0.32, 0.72, 0, 1] }} className="flex flex-col gap-4">
          {children}
        </motion.div>
      </Modal.Body>
      {(footer || summary) && (
        <Modal.Footer className="flex flex-wrap items-center gap-3">
          {summary ? (
            <p className="mr-auto flex min-w-0 items-center gap-1.5 text-[11px] text-sb-on-surface-variant">
              <Sparkles className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0">{summary}</span>
            </p>
          ) : <span className="mr-auto" />}
          {footer}
        </Modal.Footer>
      )}
    </>
  );
  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={(o) => !o && !busy && onClose()}>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog className={cn("w-full", WIDTH[size])}>
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
