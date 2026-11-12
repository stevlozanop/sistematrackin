"use client";
import { useEffect } from "react";

/**
 * Las ventanas se abren con «container transform» (Material Design, como explica el video): el botón que tocaste
 * SE CONVIERTE en la ventana. Un solo contenedor con el color y la forma del botón crece en línea recta hasta el
 * lugar de la ventana (el botón se oculta mientras tanto); el texto del botón se desvanece y el contenido de la
 * ventana aparece en su sitio con un fundido: nada se mueve por separado. Al cerrar, el contenedor se encoge,
 * recupera el color y el texto del botón y vuelve a ser el botón. Aplica a todos los modales; respeta «reducir movimiento».
 */
// Reglas de Material «container transform» (el video): un solo contenedor se mueve por un camino recto, con la curva
// «emphasized» (sin rebote); el contenido NO se mueve por su cuenta: el del botón se desvanece y el de la ventana aparece
// (fundido cruzado). Nada vuela por separado.
const OPEN_EASE = "cubic-bezier(0.2, 0, 0, 1)";        // emphasized
const CLOSE_EASE = "cubic-bezier(0.3, 0, 0.8, 0.15)";  // emphasized accelerate
const FADE_EASE = "cubic-bezier(0.05, 0.7, 0.1, 1)";
const OPEN_MS = 400, CLOSE_MS = 300, CONTENT_MS = 210;

type Box = { left: number; top: number; width: number; height: number };
const boxOf = (el: Element): Box => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
/** Redondez real del botón (una píldora «9999px» es en realidad la mitad de su alto): así pasa de píldora a tarjeta sin óvalos */
const roundOf = (el: Element, b: Box) => `${Math.min(parseFloat(getComputedStyle(el).borderRadius) || 0, b.height / 2, b.width / 2)}px`;
const px = (b: Box) => ({ left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });

/** Fondo visible de un elemento (si es transparente, el de la ventana) */
function paintOf(el: Element, fallback: string) {
  const cs = getComputedStyle(el);
  if (cs.backgroundImage && cs.backgroundImage !== "none") return { image: cs.backgroundImage, color: cs.backgroundColor };
  const c = cs.backgroundColor;
  return { image: "none", color: c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent" ? c : fallback };
}

/** La pieza que se transforma: una caja fija por encima de todo */
function ghost(from: Box, paint: { image: string; color: string }, radius: string, shadow: string) {
  const g = document.createElement("div");
  Object.assign(g.style, {
    position: "fixed", zIndex: "2147483000", pointerEvents: "none", ...px(from),
    backgroundColor: paint.color, backgroundImage: paint.image, borderRadius: radius, boxShadow: shadow, overflow: "hidden",
  });
  document.body.appendChild(g);
  return g;
}

/**
 * La ventana se queda donde está el botón (no viaja al centro): se pega a una esquina del botón y crece hacia donde
 * hay espacio. Botón a la derecha → crece hacia la izquierda; botón abajo → crece hacia arriba. Nunca se sale de la pantalla.
 */
const MARGIN = 12;
function anchor(dialog: HTMLElement, btn: Box) {
  const nat = dialog.getBoundingClientRect();
  const w = Math.min(nat.width, innerWidth - MARGIN * 2);
  const h = Math.min(nat.height, innerHeight - MARGIN * 2);
  const st = dialog.style;
  Object.assign(st, { position: "fixed", margin: "0", width: `${w}px`, maxWidth: `${innerWidth - MARGIN * 2}px`, left: "", right: "", top: "", bottom: "" });
  // Horizontal: alinea con el borde del botón del lado donde hay más espacio
  const right = btn.left + btn.width / 2 > innerWidth / 2;
  if (right) st.right = `${Math.max(MARGIN, Math.min(innerWidth - (btn.left + btn.width), innerWidth - w - MARGIN))}px`;
  else st.left = `${Math.max(MARGIN, Math.min(btn.left, innerWidth - w - MARGIN))}px`;
  // Vertical: empieza en el botón y crece hacia abajo; si el botón está en la mitad de abajo, crece hacia arriba
  const up = btn.top + btn.height / 2 > innerHeight / 2;
  // Si no cabe completa desde el botón, se corre lo justo para entrar entera (sigue lo más cerca posible del botón)
  if (up) {
    const bottom = Math.max(MARGIN, Math.min(innerHeight - (btn.top + btn.height), innerHeight - h - MARGIN));
    st.bottom = `${bottom}px`;
    st.maxHeight = `${innerHeight - bottom - MARGIN}px`;
  } else {
    const top = Math.max(MARGIN, Math.min(btn.top, innerHeight - h - MARGIN));
    st.top = `${top}px`;
    st.maxHeight = `${innerHeight - top - MARGIN}px`;
  }
}

export function ContainerTransform() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let source: { el: HTMLElement; at: number } | null = null;
    const origin = new WeakMap<Element, HTMLElement>();

    const pick = (el: Element | null) => {
      const t = el?.closest<HTMLElement>("button, a, [role=button], [role=row], tr, .sb-card");
      if (t && !t.closest(".modal__container")) source = { el: t, at: Date.now() };
    };
    const down = (e: PointerEvent) => pick(e.target as Element | null);
    const key = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") pick(document.activeElement); };

    const open = (container: HTMLElement) => {
      const dialog = container.querySelector<HTMLElement>(".modal__dialog");
      const src = source && Date.now() - source.at < 1500 && source.el.isConnected ? source.el : null;
      source = null;
      if (!dialog || !src) return;
      const from = boxOf(src);
      const natural = boxOf(dialog);
      if (!from.width || !natural.width || from.width > innerWidth * 0.7 || from.top + from.height < 0) return;
      anchor(dialog, from);
      const to = boxOf(dialog);
      origin.set(container, src);
      container.dataset.ct = "";
      const dcs = getComputedStyle(dialog);
      const surface = dcs.backgroundColor || "#fff";
      const g = ghost(from, paintOf(src, surface), roundOf(src, from), "0 8px 32px -8px rgba(0,0,0,.35)");
      // La pieza lleva el texto e ícono del botón, que se desvanecen al empezar a crecer (como el «+» del botón Opciones)
      const face = document.createElement("div");
      const scs = getComputedStyle(src);
      Object.assign(face.style, { position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", gap: scs.gap, color: scs.color, font: scs.font, whiteSpace: "nowrap" });
      face.innerHTML = src.innerHTML;
      g.appendChild(face);
      face.animate([{ opacity: 1 }, { opacity: 0 }], { duration: OPEN_MS * 0.3, easing: "linear", fill: "forwards" });
      src.style.visibility = "hidden";
      // La ventana real espera invisible mientras la pieza crece
      dialog.animate([{ opacity: 0 }, { opacity: 0 }], { duration: OPEN_MS * 0.7, fill: "backwards" });
      const morph = g.animate(
        [
          { ...px(from), borderRadius: roundOf(src, from), offset: 0 },
          { ...px(to), borderRadius: dcs.borderRadius, backgroundColor: surface, backgroundImage: "none", offset: 1 },
        ],
        { duration: OPEN_MS, easing: OPEN_EASE, fill: "forwards" },
      );
      // El contenido de la ventana aparece en su sitio, solo con un fundido, cuando el contenedor ya casi llegó
      dialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CONTENT_MS, delay: OPEN_MS * 0.6, easing: FADE_EASE, fill: "backwards" });
      morph.onfinish = () => { g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" }).onfinish = () => g.remove(); src.style.visibility = ""; };
      // Si la ventana se cierra antes de terminar, no dejar nada colgado
      setTimeout(() => { if (g.isConnected && !container.isConnected) { g.remove(); src.style.visibility = ""; } }, OPEN_MS + 400);
    };

    const close = (container: HTMLElement) => {
      const dialog = container.querySelector<HTMLElement>(".modal__dialog");
      const src = origin.get(container);
      if (!dialog || !src?.isConnected) return;
      const from = boxOf(dialog), to = boxOf(src);
      if (!to.width || to.top + to.height < 0 || to.top > innerHeight) return;
      const dcs = getComputedStyle(dialog);
      src.style.visibility = "hidden";
      const g = ghost(from, { image: "none", color: dcs.backgroundColor || "#fff" }, dcs.borderRadius, "0 8px 32px -8px rgba(0,0,0,.35)");
      // El contenido se va primero; luego la tarjeta se encoge y vuelve a ser el botón
      dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS * 0.3, easing: "linear", fill: "forwards" });
      const paint = paintOf(src, dcs.backgroundColor);
      const morph = g.animate(
        [
          { ...px(from), borderRadius: dcs.borderRadius, backgroundColor: dcs.backgroundColor },
          { ...px(to), borderRadius: roundOf(src, to), backgroundColor: paint.color },
        ],
        { duration: CLOSE_MS, easing: CLOSE_EASE, fill: "forwards" },
      );
      const face = document.createElement("div");
      const scs = getComputedStyle(src);
      Object.assign(face.style, { position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", gap: scs.gap, color: scs.color, font: scs.font, whiteSpace: "nowrap", opacity: "0" });
      face.innerHTML = src.innerHTML;
      g.appendChild(face);
      face.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CLOSE_MS * 0.4, delay: CLOSE_MS * 0.6, fill: "forwards" });
      morph.onfinish = () => { src.style.visibility = ""; g.remove(); };
    };

    // Las ventanas que entran y salen (HeroUI marca data-exiting en el contenedor al cerrarse)
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "childList") {
          for (const n of Array.from(m.addedNodes)) {
            if (!(n instanceof HTMLElement)) continue;
            const c = n.matches(".modal__container") ? n : n.querySelector<HTMLElement>(".modal__container");
            if (c) open(c);
          }
        } else if (m.attributeName === "data-exiting") {
          const c = m.target as HTMLElement;
          if (c.matches(".modal__container") && c.dataset.exiting === "true" && "ct" in c.dataset) close(c);
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
