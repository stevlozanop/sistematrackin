"use client";
import { useEffect, useRef } from "react";

/**
 * En celular las tablas se ven como tarjetas: cada celda muestra su título de columna al lado (data-label).
 * Este componente copia el texto de cada encabezado a las celdas de su columna, también cuando la tabla cambia.
 */
export function TableLabels({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const apply = () => {
      const heads = [...el.querySelectorAll("thead th")].map((th) => (th.textContent ?? "").trim());
      el.querySelectorAll("tbody tr").forEach((tr) => {
        let col = 0;
        for (const td of tr.children) {
          const label = heads[col] ?? "";
          if (td.getAttribute("data-label") !== label) td.setAttribute("data-label", label);
          col += Number(td.getAttribute("colspan") ?? 1);
        }
      });
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return <div ref={box} className={`sb-stack overflow-x-auto ${className}`}>{children}</div>;
}
