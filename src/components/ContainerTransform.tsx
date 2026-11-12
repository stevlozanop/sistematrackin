"use client";
import { useEffect } from "react";

/**
 * «Container transform» (Material Design): cada ventana nace del botón o tarjeta que la abrió, como UN solo bloque
 * que crece por un camino simple; su contenido aparece con un fundido corto, sin piezas volando por separado.
 * Al cerrarse, vuelve a encogerse hacia ese mismo elemento si sigue en pantalla.
 * Funciona para todos los modales (HeroUI Modal: .modal__container / .modal__dialog) sin tocar cada pantalla.
 */
const EMPHASIZED = "cubic-bezier(0.2, 0, 0, 1)";
const DECEL = "cubic-bezier(0.05, 0.7, 0.1, 1)";

export function ContainerTransform() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let source: { el: Element; at: number } | null = null;
    const origin = new WeakMap<Element, Element>();

    // El elemento que se tocó justo antes de abrir la ventana
    const down = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest("button, a, [role=button], [role=row], tr, .sb-card");
      if (el && !el.closest(".modal__container")) source = { el, at: Date.now() };
    };
    const key = (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && document.activeElement && !document.activeElement.closest(".modal__container")) source = { el: document.activeElement, at: Date.now() };
    };

    const grow = (container: HTMLElement) => {
      const dialog = container.querySelector<HTMLElement>(".modal__dialog");
      const src = source && Date.now() - source.at < 1500 && source.el.isConnected ? source.el : null;
      if (!dialog || !src) return;
      const from = src.getBoundingClientRect(), to = dialog.getBoundingClientRect();
      if (!from.width || !to.width || from.width > innerWidth * 0.7) return;
      origin.set(container, src);
      container.dataset.ct = "";
      const radius = getComputedStyle(src).borderRadius || "16px";
      const dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2);
      dialog.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})`, borderRadius: radius, opacity: 0.4 },
          { transform: "none", borderRadius: getComputedStyle(dialog).borderRadius, opacity: 1 },
        ],
        { duration: 420, easing: EMPHASIZED },
      );
      // El contenido no se deforma: aparece cuando el bloque ya casi llegó
      for (const child of Array.from(dialog.children) as HTMLElement[]) {
        child.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 170, easing: DECEL, fill: "backwards" });
      }
    };

    const shrink = (container: HTMLElement) => {
      const dialog = container.querySelector<HTMLElement>(".modal__dialog");
      const src = origin.get(container);
      if (!dialog || !src?.isConnected) return;
      const from = dialog.getBoundingClientRect(), to = src.getBoundingClientRect();
      if (!to.width || to.bottom < 0 || to.top > innerHeight) return;
      const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
      dialog.animate(
        [{ transform: "none", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width}, ${to.height / from.height})`, borderRadius: getComputedStyle(src).borderRadius || "16px", opacity: 0 }],
        { duration: 220, easing: "cubic-bezier(0.3, 0, 0.8, 0.15)", fill: "forwards" },
      );
    };

    // Las ventanas que entran y salen (HeroUI marca data-entering / data-exiting en el contenedor)
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "childList") {
          for (const n of Array.from(m.addedNodes)) {
            if (!(n instanceof HTMLElement)) continue;
            const c = n.matches(".modal__container") ? n : n.querySelector<HTMLElement>(".modal__container");
            if (c) grow(c);
          }
        } else if (m.type === "attributes" && m.attributeName === "data-exiting") {
          const c = m.target as HTMLElement;
          if (c.matches(".modal__container") && c.dataset.exiting === "true" && "ct" in c.dataset) shrink(c);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-exiting"] });
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => { mo.disconnect(); document.removeEventListener("pointerdown", down, true); document.removeEventListener("keydown", key, true); };
  }, []);
  return null;
}
