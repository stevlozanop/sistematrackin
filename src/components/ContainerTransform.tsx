"use client";
import { useEffect } from "react";

/**
 * Ventanas que nacen del botón que las abrió («container transform», como Stepbro Tasks y la guía de Material):
 * - La ventana arranca EXACTAMENTE con el tamaño, posición, color, redondez y sombra del botón, y crece en su sitio
 *   (anclada a la esquina del botón, corrida solo lo justo para caber). Es un solo bloque: nada vuela por separado.
 * - Curva: arranque rápido y asentado muy suave en 0,7 s (la de Stepbro, muestreada punto a punto).
 * - Color, redondez y sombra pasan del botón a la ventana en los primeros 0,3 s.
 * - El botón se oculta mientras se transforma; su texto se queda en su lugar y se desvanece.
 * - Al cerrar, la ventana vuelve a encogerse dentro del botón y el botón reaparece.
 * Aplica a todos los modales (HeroUI: .modal__container / .modal__dialog) y respeta «reducir movimiento».
 */

/** Curva de Stepbro: M0,0 C0.308,0.19 0.107,0.633 0.288,0.866 C0.382,0.987 0.656,1 1,1 → easing CSS linear() */
function sampleEase() {
  const segs: [number, number][][] = [
    [[0, 0], [0.308, 0.19], [0.107, 0.633], [0.288, 0.866]],
    [[0.288, 0.866], [0.382, 0.987], [0.656, 1], [1, 1]],
  ];
  const pts: [number, number][] = [];
  for (const [a, b, c, d] of segs) {
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, u = 1 - t;
      const x = u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0];
      const y = u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1];
      if (!pts.length || x > pts[pts.length - 1][0]) pts.push([x, y]);
    }
  }
  return `linear(${pts.map(([x, y]) => `${y.toFixed(4)} ${(x * 100).toFixed(2)}%`).join(", ")})`;
}
const FALLBACK = "cubic-bezier(0.2, 0.85, 0.25, 1)";
const OPEN_MS = 700, STYLE_MS = 300, CLOSE_MS = 420;
const CLOSE_EASE = "cubic-bezier(0.4, 0, 0.6, 1)";

type Box = { left: number; top: number; width: number; height: number };
const boxOf = (el: Element): Box => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
/** Redondez real (una píldora «9999px» es la mitad de su alto) */
const roundOf = (el: Element, b: Box) => `${Math.min(parseFloat(getComputedStyle(el).borderRadius) || 0, b.height / 2, b.width / 2)}px`;

/** Fondo visible del botón (si es transparente, el de la ventana) */
function paintOf(el: Element, fallback: string) {
  const cs = getComputedStyle(el);
  const c = cs.backgroundColor;
  const color = c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent" ? c : fallback;
  return { color, image: cs.backgroundImage && cs.backgroundImage !== "none" ? cs.backgroundImage : "none" };
}

/** La ventana se queda pegada a la esquina superior izquierda del botón y crece hacia abajo y a la derecha; si no cabe, se corre lo justo */
const MARGIN = 12;
function anchor(dialog: HTMLElement, btn: Box) {
  const nat = dialog.getBoundingClientRect();
  const w = Math.min(nat.width, innerWidth - MARGIN * 2);
  const h = Math.min(nat.height, innerHeight - MARGIN * 2);
  const left = Math.max(MARGIN, Math.min(btn.left, innerWidth - w - MARGIN));
  const top = Math.max(MARGIN, Math.min(btn.top, innerHeight - h - MARGIN));
  Object.assign(dialog.style, {
    position: "fixed", margin: "0", width: `${w}px`, maxWidth: `${innerWidth - MARGIN * 2}px`,
    left: `${left}px`, top: `${top}px`, right: "", bottom: "", maxHeight: `${innerHeight - top - MARGIN}px`,
  });
}

/** Copia del botón en su lugar exacto: su texto no salta mientras la ventana crece */
function faceOf(src: HTMLElement, b: Box) {
  const f = src.cloneNode(true) as HTMLElement;
  f.removeAttribute("id");
  Object.assign(f.style, { position: "fixed", zIndex: "2147483001", left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px`, margin: "0", transform: "none", visibility: "visible", pointerEvents: "none", boxShadow: "none", background: "transparent", animation: "none" });
  document.body.appendChild(f);
  return f;
}

/** Transformación que pone la ventana (caja «to») encima del botón (caja «from»), con origen arriba a la izquierda */
const flip = (from: Box, to: Box) => `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;

export function ContainerTransform() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const EASE = CSS.supports("animation-timing-function", "linear(0, 1)") ? sampleEase() : FALLBACK;
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
      if (!from.width || !dialog.getBoundingClientRect().width || from.width > innerWidth * 0.7 || from.top + from.height < 0) return;
      anchor(dialog, from);
      const to = boxOf(dialog);
      origin.set(container, src);
      container.dataset.ct = "";
      const dcs = getComputedStyle(dialog);
      const paint = paintOf(src, dcs.backgroundColor);
      const srcShadow = getComputedStyle(src).boxShadow;

      // El botón se oculta: es él quien se transforma. Su texto queda en su sitio y se desvanece.
      src.style.visibility = "hidden";
      const face = faceOf(src, from);
      face.animate([{ opacity: 1 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }], { duration: STYLE_MS + 100, easing: "linear", fill: "forwards" }).onfinish = () => face.remove();

      // Un solo bloque: la ventana arranca con la caja, el color, la redondez y la sombra del botón
      dialog.style.transformOrigin = "0 0";
      dialog.animate([{ transform: flip(from, to) }, { transform: "none" }], { duration: OPEN_MS, easing: EASE });
      dialog.animate(
        [
          { backgroundColor: paint.color, backgroundImage: paint.image, borderRadius: roundOf(src, from), boxShadow: srcShadow === "none" ? dcs.boxShadow : srcShadow },
          { backgroundColor: dcs.backgroundColor, backgroundImage: "none", borderRadius: dcs.borderRadius, boxShadow: dcs.boxShadow },
        ],
        { duration: STYLE_MS, easing: EASE },
      );
      // El contenido viaja dentro del bloque y aparece mientras el color cambia
      for (const child of Array.from(dialog.children) as HTMLElement[]) {
        child.animate([{ opacity: 0 }, { opacity: 1 }], { duration: STYLE_MS, delay: 60, easing: "linear", fill: "backwards" });
      }
      setTimeout(() => { src.style.visibility = ""; dialog.style.transformOrigin = ""; }, OPEN_MS);
    };

    const close = (container: HTMLElement) => {
      const dialog = container.querySelector<HTMLElement>(".modal__dialog");
      const src = origin.get(container);
      if (!dialog || !src?.isConnected) return;
      const from = boxOf(dialog), to = boxOf(src);
      if (!to.width || to.top + to.height < 0 || to.top > innerHeight) return;
      const dcs = getComputedStyle(dialog);
      const paint = paintOf(src, dcs.backgroundColor);
      src.style.visibility = "hidden";
      dialog.style.transformOrigin = "0 0";
      for (const child of Array.from(dialog.children) as HTMLElement[]) child.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS * 0.4, fill: "forwards" });
      dialog.animate(
        [
          { transform: "none", backgroundColor: dcs.backgroundColor, borderRadius: dcs.borderRadius },
          { transform: flip(to, from), backgroundColor: paint.color, backgroundImage: paint.image, borderRadius: roundOf(src, to) },
        ],
        { duration: CLOSE_MS, easing: CLOSE_EASE, fill: "forwards" },
      );
      const face = faceOf(src, to);
      face.style.opacity = "0";
      face.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CLOSE_MS * 0.35, delay: CLOSE_MS * 0.65, fill: "forwards" });
      setTimeout(() => { src.style.visibility = ""; face.remove(); }, CLOSE_MS + 20);
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
