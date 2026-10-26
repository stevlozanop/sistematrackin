/**
 * Tema de colores por cuenta.
 * - SWM Labs (dev): blanco y negro.
 * - Cuentas de una empresa: el color de su empresa (Leyva verde, Honda rojo…).
 * Se genera como CSS que redefine los tokens --sb-* y los de HeroUI (--accent, --focus).
 */
export const DEFAULT_COLOR = "#078a04"; // verde Consorcio Leyva (con contraste para texto blanco)

/** Colores sugeridos al crear una empresa. */
export const PRESETS = [
  { name: "Verde Leyva", color: "#078a04" },
  { name: "Rojo Honda", color: "#cc0000" },
  { name: "Azul Yamaha", color: "#1b3fa0" },
  { name: "Naranja", color: "#c2410c" },
  { name: "Morado", color: "#6d28d9" },
  { name: "Negro", color: "#18181b" },
];

export const isColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** Luminancia relativa (WCAG) para decidir si el texto encima va blanco o negro. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Texto blanco si da contraste AA (4.5:1); si no, casi negro. */
export const onColor = (hex: string) => (1.05 / (luminance(hex) + 0.05) >= 4.5 ? "#ffffff" : "#161618");

export function themeCss(color: string | null, swm: boolean) {
  if (swm) {
    return `:root{--sb-primary:#161618;--sb-on-primary:#fff;--sb-primary-soft:color-mix(in oklab,#161618 8%,transparent);--accent:#161618;--accent-foreground:#fff;--focus:#161618;--page-bg:#f5f5f5}
html.dark{--sb-primary:#fff;--sb-on-primary:#0a0a0b;--sb-primary-soft:color-mix(in oklab,#fff 12%,transparent);--accent:#fff;--accent-foreground:#0a0a0b;--focus:#fff;--page-bg:#000}`;
  }
  const c = isColor(color) ? color.toLowerCase() : DEFAULT_COLOR;
  const on = onColor(c);
  // En modo oscuro el color se aclara para que se lea sobre fondo negro
  const dark = `color-mix(in oklab,${c} 62%,#fff)`;
  return `:root{--sb-primary:${c};--sb-on-primary:${on};--sb-primary-soft:color-mix(in oklab,${c} 12%,transparent);--accent:${c};--accent-foreground:${on};--focus:${c};--page-bg:color-mix(in oklab,${c} 4%,#f5f5f5)}
html.dark{--sb-primary:${dark};--sb-on-primary:#0a0a0b;--sb-primary-soft:color-mix(in oklab,${dark} 16%,transparent);--accent:${dark};--accent-foreground:#0a0a0b;--focus:${dark};--page-bg:#000}`;
}
