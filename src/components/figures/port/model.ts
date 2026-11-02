/**
 * Modelo del muelle de Iquitos: todo lo que se mueve en la figura sale de aquí, en función del tiempo.
 * Pasos del sistema: 1 IQT-Port (cajas en el muelle) → 1.1 Embarque (la grúa las sube a la chata)
 * → 2 Tránsito fluvial (la chata zarpa). Luego llega una chata nueva y otro lote de cajas.
 */

/** Cajas CKD por chata en la figura */
export const CRATES = 4;
/** Posición x de cada caja en el muelle y de cada lugar en la cubierta de la chata */
export const QUAY_X = [-105, -70, -35, 0];
export const DECK_X = [-95, -60, -25, 10];
/** Fila de cajas en el muelle y fila de lugares en la chata (eje y) */
export const QUAY_Y = -90;
export const DECK_Y = 40;
/** Alturas: muelle, cubierta de la chata, caja y altura de viaje del gancho */
export const QUAY_TOP = 0;
export const DECK_TOP = -4;
export const CRATE_H = 18;
export const TRAVEL = 70;
/** Hasta dónde sale la chata al zarpar */
export const SAIL_TO = 560;

const HOLD = 1.6; // cajas esperando en el muelle
const CYCLE = 3.6; // una caja: bajar, enganchar, subir, llevar, soltar
const CAST = 1.0; // soltar amarras
const SAIL = 4.6; // zarpe
const ENTER = 4.0; // llega la chata nueva
const LOAD = CRATES * CYCLE;
export const LOOP = HOLD + LOAD + CAST + SAIL + ENTER;

export type Step = "1" | "1.1" | "2";

export interface Pose {
  /** Grúa pórtico: posición sobre los rieles (x), carro sobre la pluma (y) y gancho (z, parte baja del spreader) */
  gantry: number;
  trolley: number;
  hook: number;
  /** Caja que va colgada del gancho (-1 = ninguna) y la que se está atendiendo (se resalta) */
  hanging: number;
  active: number;
  /** Opacidad de cada caja del muelle y de cada caja a bordo */
  quay: number[];
  deck: number[];
  /** Chata: desplazamiento por el río y opacidad; amarras */
  barge: number;
  bargeAlpha: number;
  lines: number;
  step: Step;
  /** Cajas a bordo (para la lectura) */
  aboard: number;
  phase: "hold" | "load" | "sail" | "enter";
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => { const u = clamp(t); return u * u * (3 - 2 * u); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const span = (u: number, a: number, b: number) => smooth((u - a) / (b - a));

/** Orden: el muelle se recoge de derecha a izquierda y la chata se llena de izquierda a derecha (así el pintado nunca se cruza) */
const pickOf = (i: number) => CRATES - 1 - i;

function loading(u: number, i: number, base: Pose): Pose {
  const q = pickOf(i);
  const fromX = i === 0 ? QUAY_X[q] : DECK_X[i - 1];
  const fromY = i === 0 ? QUAY_Y : DECK_Y;
  const quayLift = QUAY_TOP + CRATE_H;
  const deckLift = DECK_TOP + CRATE_H;
  let gantry = QUAY_X[q], trolley = QUAY_Y, hook = TRAVEL, hanging = -1;
  const quay = [...base.quay], deck = [...base.deck];
  for (let k = 0; k < i; k++) { quay[pickOf(k)] = 0; deck[k] = 1; }
  if (u < 0.16) {
    const s = span(u, 0, 0.16);
    gantry = mix(fromX, QUAY_X[q], s); trolley = mix(fromY, QUAY_Y, s);
  } else if (u < 0.3) hook = mix(TRAVEL, quayLift, span(u, 0.16, 0.3));
  else if (u < 0.36) hook = quayLift;
  else if (u < 0.5) { hook = mix(quayLift, TRAVEL, span(u, 0.36, 0.5)); hanging = i; }
  else if (u < 0.72) {
    const s = span(u, 0.5, 0.72);
    gantry = mix(QUAY_X[q], DECK_X[i], s); trolley = mix(QUAY_Y, DECK_Y, s); hanging = i;
  } else if (u < 0.86) { gantry = DECK_X[i]; trolley = DECK_Y; hook = mix(TRAVEL, deckLift, span(u, 0.72, 0.86)); hanging = i; }
  else if (u < 0.92) { gantry = DECK_X[i]; trolley = DECK_Y; hook = deckLift; }
  else { gantry = DECK_X[i]; trolley = DECK_Y; hook = mix(deckLift, TRAVEL, span(u, 0.92, 1)); }
  if (u >= 0.36) quay[q] = 0;
  if (u >= 0.86) deck[i] = 1;
  return { ...base, gantry, trolley, hook, hanging, active: i, quay, deck, aboard: deck.filter((v) => v > 0.5).length, step: "1.1", phase: "load" };
}

export function poseAt(time: number): Pose {
  const t = ((time % LOOP) + LOOP) % LOOP;
  const rest: Pose = {
    gantry: QUAY_X[pickOf(0)], trolley: QUAY_Y, hook: TRAVEL, hanging: -1, active: -1,
    quay: Array(CRATES).fill(1), deck: Array(CRATES).fill(0), barge: 0, bargeAlpha: 1, lines: 1,
    step: "1", aboard: 0, phase: "hold",
  };
  if (t < HOLD) return rest;
  let u = t - HOLD;
  if (u < LOAD) return loading((u % CYCLE) / CYCLE, Math.floor(u / CYCLE), rest);
  u -= LOAD;
  const full: Pose = { ...rest, quay: Array(CRATES).fill(0), deck: Array(CRATES).fill(1), aboard: CRATES, gantry: DECK_X[CRATES - 1], trolley: DECK_Y };
  if (u < CAST + SAIL) {
    // Soltar amarras y zarpar; el carro vuelve atrás sobre el muelle
    const back = span(u, 0, CAST + 1.2);
    const go = clamp((u - CAST) / SAIL);
    const barge = SAIL_TO * go * go;
    return {
      ...full, step: "2", phase: "sail",
      lines: 1 - span(u, 0, CAST * 0.8),
      trolley: mix(DECK_Y, QUAY_Y, back), gantry: mix(DECK_X[CRATES - 1], QUAY_X[pickOf(0)], back),
      barge, bargeAlpha: 1 - span(barge, SAIL_TO * 0.45, SAIL_TO * 0.9),
    };
  }
  u -= CAST + SAIL;
  // Chata nueva entra desde aguas arriba; llega otro lote de cajas al muelle
  const s = clamp(u / (ENTER - 0.6));
  const e = 1 - (1 - s) * (1 - s);
  const barge = -SAIL_TO * (1 - e);
  return {
    ...rest, step: "1", phase: "enter",
    barge, bargeAlpha: 1 - span(-barge, SAIL_TO * 0.45, SAIL_TO * 0.9),
    lines: span(u, ENTER - 0.8, ENTER),
    quay: QUAY_X.map((_, k) => span(u, 0.4 + k * 0.45, 1.2 + k * 0.45)),
  };
}

/** Texto de la lectura (esquina inferior derecha de la tarjeta) */
export function readoutOf(p: Pose): string {
  if (p.phase === "load") return `1.1 · Embarque · ${p.aboard} de ${CRATES} cajas a bordo`;
  if (p.phase === "sail") return "2 · Tránsito fluvial · zarpe IQT";
  if (p.phase === "enter") return "1 · IQT-Port · llega otra chata";
  return `1 · IQT-Port · ${CRATES} cajas CKD en muelle`;
}

/** Texto para lectores de pantalla */
export function spokenOf(p: Pose): string {
  if (p.phase === "load") return `Paso 1.1, Embarque: la grúa sube las cajas a la chata, ${p.aboard} de ${CRATES} a bordo`;
  if (p.phase === "sail") return "Paso 2, Tránsito fluvial: la chata zarpa de Iquitos con las cajas";
  return `Paso 1, IQT-Port: ${CRATES} cajas CKD esperan en el muelle de Iquitos`;
}
