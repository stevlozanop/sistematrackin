/**
 * Plano de estiba de una nave: cada lugar es bahía (proa → popa) × fila (izquierda → derecha) × nivel (abajo → arriba).
 * Se usa en el servidor (validar y ubicar) y en la pantalla (nombres de los lugares).
 */
export type VesselKind = "chata" | "motonave";
export type Vessel = { bays: number; rows: number; tiers: number; kind?: VesselKind };
export type Slot = { bay: number; row: number; tier: number };

export const DEFAULT_VESSEL: Vessel = { bays: 4, rows: 3, tiers: 2, kind: "chata" };

/**
 * Tamaño inicial según el tipo de nave (como en las fotos del puerto de Iquitos):
 * - chata (KIARA): barcaza plana con empujador, contenedores en filas largas → 6 × 2 × 2
 * - motonave (HENRY): barco de pasajeros, pocos contenedores en la cubierta de proa → 2 × 2 × 2
 * Las HENRY son motonaves; las demás, chatas, hasta que la empresa diga otra cosa.
 */
export const kindOf = (name: string): VesselKind => (/^\s*HENRY/i.test(name) ? "motonave" : "chata");
export const defaultVessel = (name: string): Vessel => (kindOf(name) === "motonave" ? { bays: 2, rows: 2, tiers: 2, kind: "motonave" } : { bays: 6, rows: 2, tiers: 2, kind: "chata" });
export const KIND_LABEL: Record<VesselKind, string> = { chata: "Chata con empujador", motonave: "Motonave" };

export const bayName = (b: number, v: Vessel) => (v.bays > 1 && b === 1 ? "Proa" : v.bays > 1 && b === v.bays ? "Popa" : `Bahía ${b}`);
export const rowName = (r: number, v: Vessel) =>
  v.rows === 1 ? "Centro" : v.rows === 2 ? (r === 1 ? "Izquierda" : "Derecha")
  : v.rows === 3 ? (["Izquierda", "Centro", "Derecha"][r - 1] ?? `Fila ${r}`) : `Fila ${r}`;
export const tierName = (t: number, v: Vessel) => (v.tiers === 1 ? "Único" : t === 1 ? "Abajo" : t === v.tiers ? "Arriba" : v.tiers === 3 ? "Medio" : `Nivel ${t}`);
export const slotName = (s: Slot, v: Vessel) => `${bayName(s.bay, v)} · ${rowName(s.row, v)} · ${tierName(s.tier, v)}`;

export const inside = (s: Slot, v: Vessel) => s.bay >= 1 && s.bay <= v.bays && s.row >= 1 && s.row <= v.rows && s.tier >= 1 && s.tier <= v.tiers;
export const same = (a: Slot, b: Slot) => a.bay === b.bay && a.row === b.row && a.tier === b.tier;

/** ¿El plano respeta la gravedad? Ningún contenedor puede quedar encima de un lugar vacío. */
export function floating(placed: Slot[]): Slot | null {
  for (const s of placed) {
    if (s.tier > 1 && !placed.some((o) => o.bay === s.bay && o.row === s.row && o.tier === s.tier - 1)) return s;
  }
  return null;
}

/** Próximo lugar libre: de abajo hacia arriba, de proa a popa, de izquierda a derecha */
export function nextFree(placed: Slot[], v: Vessel): Slot | null {
  for (let tier = 1; tier <= v.tiers; tier++)
    for (let bay = 1; bay <= v.bays; bay++)
      for (let row = 1; row <= v.rows; row++) {
        const s = { bay, row, tier };
        if (placed.some((o) => same(o, s))) continue;
        if (tier > 1 && !placed.some((o) => o.bay === bay && o.row === row && o.tier === tier - 1)) continue;
        return s;
      }
  return null;
}

/** Color del contenedor (como los reales: naranja, azul, verde, mostaza, rojo, gris), fijo por su código */
const BOX_COLORS = ["#c8692a", "#2f6fb0", "#2f8a73", "#c9a227", "#a33b36", "#5b6b7a", "#3f7f3a"];
export function boxColor(code: string) {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BOX_COLORS[h % BOX_COLORS.length];
}
