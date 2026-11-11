"use client";
import { useEffect } from "react";

/**
 * Las ventanas (modales) nacen del botón que se tocó: al abrir, la ventana sale con el tamaño y el lugar
 * exactos de ese botón y se expande hasta su sitio; al cerrar, se encoge de vuelta hacia el botón.
 * Funciona para todos los modales del sistema sin tocarlos (mira cuándo aparece una ventana en la página).
 */
type Origin = { el: Element; rect: DOMRect; radius: string; at: number };

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const OPEN_MS = 520, CLOSE_MS = 280;

function flip(from: DOMRect, to: DOMRect) {
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const sx = Math.max(0.04, from.width / to.width), sy = Math.max(0.04, from.height / to.height);
  return `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
}

export function ModalMorph() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let origin: Origin | null = null;
    const owners = new WeakMap<Element, Origin>();

    // El último botón tocado (lo que abre la ventana)
    const down = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.("button, a, [role=button], [role=menuitem], [role=option], tr");
      if (!el || el.closest(".modal__dialog")) { if (!el) origin = null; return; }
      origin = { el, rect: el.getBoundingClientRect(), radius: getComputedStyle(el).borderRadius || "16px", at: Date.now() };
    };

    const open = (dialog: HTMLElement) => {
      const o = origin && Date.now() - origin.at < 1500 ? origin : null;
      origin = null;
      requestAnimationFrame(() => {
        const to = dialog.getBoundingClientRect();
        if (!to.width) return;
        if (o) owners.set(dialog, o);
        const from = o ? (o.el.isConnected ? o.el.getBoundingClientRect() : o.rect) : null;
        dialog.animate(
          from
            ? [
                { transform: flip(from, to), borderRadius: o!.radius, opacity: 0.35, filter: "blur(2px)" },
                { opacity: 1, filter: "blur(0)", offset: 0.45 },
                { transform: "none", borderRadius: "28px", opacity: 1, filter: "blur(0)" },
              ]
            : [{ transform: "scale(0.96)", opacity: 0 }, { transform: "none", opacity: 1 }],
          { duration: from ? OPEN_MS : 260, easing: EASE },
        );
      });
    };

    const close = (dialog: HTMLElement) => {
      const o = owners.get(dialog);
      const to = dialog.getBoundingClientRect();
      const from = o?.el.isConnected ? o.el.getBoundingClientRect() : null;
      dialog.animate(
        from && to.width
          ? [{ transform: "none", opacity: 1 }, { transform: flip(from, to), borderRadius: o!.radius, opacity: 0 }]
          : [{ transform: "none", opacity: 1 }, { transform: "scale(0.97)", opacity: 0 }],
        { duration: CLOSE_MS, easing: "cubic-bezier(0.4, 0, 0.6, 1)", fill: "forwards" },
      );
    };

    const seen = new WeakSet<Element>();
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "attributes") {
          const c = m.target as HTMLElement;
          if (c.classList.contains("modal__container") && c.getAttribute("data-exiting") === "true") {
            const d = c.querySelector<HTMLElement>(".modal__dialog");
            if (d) close(d);
          }
          continue;
        }
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          const ds = n.matches(".modal__dialog") ? [n] : [...n.querySelectorAll<HTMLElement>(".modal__dialog")];
          for (const d of ds) if (!seen.has(d)) { seen.add(d); open(d); }
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-exiting"] });
    document.addEventListener("pointerdown", down, true);
    return () => { mo.disconnect(); document.removeEventListener("pointerdown", down, true); };
  }, []);
  return null;
}
