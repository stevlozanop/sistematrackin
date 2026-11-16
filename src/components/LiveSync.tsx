"use client";
import { useEffect } from "react";
import { DATA_EVENT } from "@/components/UploadCenter";

/**
 * Tiempo real para todos: pregunta si cambió algo en los datos (otra persona guardó, cargó o eliminó).
 * Si cambió, avisa a la pantalla abierta (evento «trackin:data») y esta se recarga sola.
 * Ritmo según el uso, para no cargar el servidor ni el equipo: cada 5 s mientras se usa la pantalla y cada 30 s si
 * nadie la toca hace más de 1 min; al volver a moverse o a la pestaña revisa al instante. Con la pestaña oculta, nada.
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
        // Sesión cerrada por The Iceberg Labs: al login · Mantenimiento: recargar para mostrar el aviso
        if (r.status === 401) {
          const e = await r.json().catch(() => null);
          if (e?.closed) { window.location.replace("/login?cerrada=1"); return; }
        }
        if (r.status === 503) { window.location.reload(); return; }
        // Licencia suspendida o vencida mientras usaba el sistema: recargar para mostrar la pantalla de bloqueo
        if (r.status === 403) {
          const e = await r.json().catch(() => null);
          if (e?.license) { window.location.reload(); return; }
        }
        const j = r.ok ? await r.json() : null;
        if (alive && j) {
          if (!silent && last !== null && j.v !== last) window.dispatchEvent(new CustomEvent(DATA_EVENT, { detail: "remote" }));
          last = j.v;
        }
      } catch { /* sin conexión: se reintenta en la siguiente vuelta */ }
      busy = false;
    };
    check(true);
    let lastUse = Date.now(), lastCheck = Date.now();
    const tick = () => {
      const idle = Date.now() - lastUse > 60_000;
      if (Date.now() - lastCheck >= (idle ? 30_000 : 5000)) { lastCheck = Date.now(); check(); }
    };
    const t = setInterval(tick, 1000);
    // Volver a usar la pantalla tras estar quieta: revisar ya (como mucho una vez por segundo)
    const onUse = () => {
      const wasIdle = Date.now() - lastUse > 60_000;
      lastUse = Date.now();
      if (wasIdle) { lastCheck = Date.now(); check(); }
    };
    const uses = ["pointermove", "keydown", "scroll", "touchstart"] as const;
    for (const ev of uses) window.addEventListener(ev, onUse, { passive: true, capture: true });
    const onVis = () => { if (!document.hidden) { lastUse = Date.now(); lastCheck = Date.now(); check(); } };
    document.addEventListener("visibilitychange", onVis);
    // Un cambio hecho aquí mismo: la pantalla ya se recargó; solo actualizar el número para no recargar dos veces
    const onLocal = (e: Event) => { if ((e as CustomEvent).detail !== "remote") setTimeout(() => check(true), 800); };
    window.addEventListener(DATA_EVENT, onLocal);
    return () => {
      alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener(DATA_EVENT, onLocal);
      for (const ev of uses) window.removeEventListener(ev, onUse, { capture: true });
    };
  }, []);
  return null;
}
