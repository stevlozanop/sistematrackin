/**
 * Motos (2W) y motokares (3W) siempre con el mismo color y nombre en todo el sistema, para no confundirlos:
 * motos = color de la empresa · motokares = ámbar.
 */
export const W2 = "var(--sb-primary)";
export const W3 = "#e2922a";
const num = (v: number) => Number(v ?? 0).toLocaleString("es-PE");
const word = (v: number, k: "w2" | "w3", short?: boolean) => (k === "w2" ? (v === 1 ? "moto" : "motos") : short ? "motok." : v === 1 ? "motokar" : "motokares");

/** Pastilla con la cantidad y el tipo, en su color: «28 motos» / «33 motokares» */
export function Kind({ v, k, short }: { v: number; k: "w2" | "w3"; short?: boolean }) {
  const c = k === "w2" ? W2 : W3;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
      style={{ background: `color-mix(in oklab, ${c} 14%, transparent)`, color: c }}>
      <i className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {num(v)} {word(v, k, short)}
    </span>
  );
}

/** Texto corto en línea: «2 motos · 1 motok.» (cada parte en su color; los ceros no se muestran) */
export function KindText({ w2, w3, className }: { w2: number; w3: number; className?: string }) {
  const a = Number(w2) || 0, b = Number(w3) || 0;
  return (
    <span className={className}>
      {(a > 0 || b === 0) && <span className="font-semibold tabular-nums" style={{ color: W2 }}>{num(a)} {word(a, "w2")}</span>}
      {a > 0 && b > 0 && <span className="opacity-50"> · </span>}
      {b > 0 && <span className="font-semibold tabular-nums" style={{ color: W3 }}>{num(b)} {word(b, "w3", true)}</span>}
    </span>
  );
}
