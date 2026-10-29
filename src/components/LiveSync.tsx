"use client";
import { useEffect } from "react";
import { DATA_EVENT } from "@/components/UploadCenter";

/**
 * Tiempo real para todos: cada 3 s pregunta si cambió algo en los datos (otra persona guardó, cargó o eliminó).
 * Si cambió, avisa a la pantalla abierta (evento «trackin:data») y esta se recarga sola.
 * Solo mientras la pestaña está a la vista; al volver a ella revisa al instante.
 */
export function LiveSync() {
  useEffect(() => {
    let last: number | null = null;
    let busy = false;
    let alive = true;
    const check = async (silent = false) => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const r = await fetch("/api/data-version", { cache: "no-store" });
        const j = r.ok ? await r.json() : null;
        if (alive && j) {
          if (!silent && last !== null && j.v !== last) window.dispatchEvent(new CustomEvent(DATA_EVENT, { detail: "remote" }));
          last = j.v;
        }
      } catch { /* sin conexión: se reintenta en la siguiente vuelta */ }
      busy = false;
    };
    check(true);
    const t = setInterval(() => check(), 3000);
    const onVis = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", onVis);
    // Un cambio hecho aquí mismo: la pantalla ya se recargó; solo actualizar el número para no recargar dos veces
    const onLocal = (e: Event) => { if ((e as CustomEvent).detail !== "remote") setTimeout(() => check(true), 800); };
    window.addEventListener(DATA_EVENT, onLocal);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener(DATA_EVENT, onLocal); };
  }, []);
  return null;
}
