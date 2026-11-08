"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Contenedor que se desliza de lado (tablas anchas) y lo avisa: degradado en el borde y «Desliza →»
 * mientras quede contenido a la derecha. Al llegar al final, el aviso desaparece.
 */
export function XScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", read); ro.disconnect(); };
  }, []);
  return (
    <div className={cn("relative min-w-0", className)}>
      <div ref={box} className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">{children}</div>
      <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-sb-surface to-transparent transition-opacity", edge.left ? "opacity-100" : "opacity-0")} />
      <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-sb-surface to-transparent transition-opacity", edge.right ? "opacity-100" : "opacity-0")} />
      {edge.right && !edge.left && (
        <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-0.5 rounded-full bg-sb-on-surface px-2 py-0.5 text-[10px] font-semibold text-sb-surface shadow md:hidden">
          Desliza <ChevronRight className="h-3 w-3" />
        </span>
      )}
    </div>
  );
}
