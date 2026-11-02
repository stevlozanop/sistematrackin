import * as k from "@/components/iso/iso-kit";
import type { Plan, Point3 } from "@/components/iso/iso-kit";
import { CRATE_H, DECK_TOP, DECK_X, DECK_Y, QUAY_TOP, QUAY_X, QUAY_Y } from "./model";
import {
  BOGIE_TOP, BOOM_BACK, BOOM_TIP, GIRDER_H, GIRDER_TOP, GIRDER_X, GIRDER_Z, HULL, LEG, LEG_X, P, PORTAL_Z,
  QUAY, QUAY_FRONT, RAIL_BACK, RAIL_FRONT, TUG, WATER_Z, at,
} from "./view";

/**
 * Toda la geometría fija de la figura, calculada una vez (en el servidor) como texto SVG.
 * Las piezas que se mueven se dibujan en su posición de reposo y la parte "live" las traslada.
 */

const solid = (paths: k.SolidPaths, style: k.SolidStyle = {}) => k.solidSvg(paths, style);
const line = (d: string, tone: k.LineTone = "lo", extra: Partial<k.LineStyle> = {}) => k.lineSvg(d, { tone, ...extra });
const dots = (points: k.Point3[], tone: k.Tone = "mid", size = 0.45) => k.dotsSvg(points.map((p) => at(p)), { tone, size });
const slab = (plan: Plan, z: number, h: number, steps = 3, bevel = 0) => k.slabOf(plan, z, h, P, steps, bevel);
const cyl = (x: number, y: number, r: number, z: number, h: number, steps = 20, bevel = 0) => k.cylinder(x, y, r, z, h, P, steps, bevel);
const seg = (a: Point3, b: Point3) => k.segment(a, b, P);
/** Ordena de atrás hacia adelante (lo más lejano primero) */
const byDepth = <T>(items: [Point3, T][]) => items.sort((a, b) => k.depthOf(a[0], P) - k.depthOf(b[0], P)).map(([, v]) => v);

/* ---------- Agua (río Amazonas / Itaya frente al muelle) ---------- */
const WATER: Plan = { x: -760, y: QUAY_FRONT, w: 1520, d: 420, r: 0 };
function water() {
  const plane = `<path class="port-water" d="${slab(WATER, WATER_Z, 0).top}"/>`;
  // Ondas: líneas cortas a lo largo del río que se desvanecen en ambos extremos (nunca cortan en seco)
  const ripples: string[] = [];
  const rows = [8, 22, 36, 84, 102, 120, 142, 168, 196];
  rows.forEach((y, i) => {
    const xs = [-260 + ((i * 53) % 90), -60 + ((i * 37) % 70), 130 + ((i * 41) % 80)];
    for (const [j, x0] of xs.entries()) {
      if (y < 80 && x0 > -200 && x0 < 80) continue; // bajo la chata no se ven
      const len = 34 + ((i + j) % 3) * 16;
      ripples.push(k.fadeLineSvg([at([x0, y, WATER_Z]), at([x0 + len, y, WATER_Z])], { fade: [10, 10], tone: "faint" }));
    }
  });
  return { plane, ripples: ripples.join("") };
}

/* ---------- Muelle de concreto con rieles de grúa, bitas y defensas ---------- */
function quay() {
  const out: string[] = [];
  const front = QUAY_FRONT;
  // Juntas verticales del frente, de borde a borde
  const joints = [-152, -112, -72, -32, 8, 48, 88].map((x) => seg([x, front, WATER_Z], [x, front, QUAY_TOP])).join("");
  out.push(solid(slab(QUAY, WATER_Z, QUAY_TOP - WATER_Z, 3, 1.2), { tone: "mid", inner: line(joints, "faint") + line(k.sideSeam(QUAY, WATER_Z + 4, P, 3), "faint") }));
  out.push(line(k.planOutline(k.insetPlan(QUAY, 4), QUAY_TOP, P, 3), "faint"));
  // Juntas de dilatación del piso, de la ranura trasera al bordillo
  out.push(line([-110, -20, 70].map((x) => k.lineOnTop([x, QUAY.y + 4], [x, front - 6], QUAY_TOP, P)).join(""), "faint"));
  // Bordillo del borde del muelle
  out.push(solid(slab({ x: QUAY.x, y: front - 6, w: QUAY.w, d: 6, r: 0 }, QUAY_TOP, 1.2, 2, 0.4), { tone: "lo" }));
  // Regla de recorrido de la grúa (marcas cada 5, mayor cada 25)
  const strip: Plan = { x: QUAY.x + 10, y: RAIL_FRONT - 13, w: QUAY.w - 20, d: 5, r: 0.8 };
  const ticks = k.topTicks(strip.x + 3, strip.x + strip.w - 3, 5, 5, strip.y + 0.6, QUAY_TOP + 0.5, [2, 3.6], P);
  out.push(solid(slab(strip, QUAY_TOP, 0.5, 2), { tone: "lo", crease: "none" }) + line(ticks.minor, "lo") + line(ticks.major, "mid"));
  // Rieles con sus grapas
  for (const y of [RAIL_BACK, RAIL_FRONT]) {
    out.push(solid(slab({ x: QUAY.x + 6, y: y - 1.5, w: QUAY.w - 12, d: 3, r: 0.6 }, QUAY_TOP, 1.5, 2), { tone: "mid" }));
    const clips: Point3[] = [];
    for (let x = QUAY.x + 14; x < QUAY.x + QUAY.w - 10; x += 16) clips.push([x, y - 2.6, QUAY_TOP], [x, y + 2.6, QUAY_TOP]);
    out.push(dots(clips, "lo", 0.45));
  }
  // Postes de luz en las esquinas de atrás
  for (const x of [QUAY.x + 16, QUAY.x + QUAY.w - 16]) {
    out.push(solid(cyl(x, QUAY.y + 12, 3, QUAY_TOP, 1.4, 16), { tone: "lo" }));
    out.push(solid(cyl(x, QUAY.y + 12, 1.2, QUAY_TOP + 1.4, 56, 12), { tone: "mid", crease: "none" }));
    out.push(solid(slab({ x: x - 3, y: QUAY.y + 9, w: 10, d: 6, r: 1 }, QUAY_TOP + 57.4, 2.4, 2), { tone: "mid" }));
  }
  return out.join("");
}

/** Lo que está en el borde del muelle, delante de los rieles: bitas, defensas y escaleras */
function quayEdge() {
  const out: string[] = [];
  const front = QUAY_FRONT;
  for (const x of [-160, -118, -40, 22, 90]) {
    out.push(solid(cyl(x, -44, 2.6, QUAY_TOP, 5.4, 16), { tone: "mid", inner: line(k.sideArc(x, -44, 2.6, QUAY_TOP + 2, P, 16), "faint") }));
    out.push(solid(cyl(x, -44, 3.6, QUAY_TOP + 5.4, 1.4, 20, 0.4), { tone: "mid" }));
  }
  // Defensas de caucho en la cara del muelle, con sus pernos
  for (const x of [-172, -130, -78, -10, 52, 100]) {
    out.push(solid(slab({ x: x - 5, y: front, w: 10, d: 3.5, r: 1.2 }, WATER_Z + 2, 10, 3, 0.4), { tone: "lo" }));
    out.push(dots([[x - 2.6, front + 3.5, WATER_Z + 9.5], [x + 2.6, front + 3.5, WATER_Z + 9.5]], "mid", 0.4));
  }
  // Escaleras de gato en el frente
  for (const x of [-145, 75]) {
    const y = front + 0.4;
    const rails = seg([x - 2.5, y, WATER_Z], [x - 2.5, y, QUAY_TOP]) + seg([x + 2.5, y, WATER_Z], [x + 2.5, y, QUAY_TOP]);
    let rungs = "";
    for (let z = WATER_Z + 2; z < QUAY_TOP; z += 3) rungs += seg([x - 2.5, y, z], [x + 2.5, y, z]);
    out.push(line(rails, "mid") + line(rungs, "lo"));
  }
  // Placa grabada en el frente
  out.push(k.faceTextSvg(k.sideMatrix([-112, front], WATER_Z + 7, P, "left"), "MUELLE IQT", { size: 4.2, tone: "lo" }));
  return out.join("");
}

/* ---------- Caja CKD de madera (con patines), en reposo en (0, 0, 0) ---------- */
function crate(cx = 0, cy = 0, z = 0, lit = false) {
  const body: Plan = { x: cx - 14, y: cy - 11, w: 28, d: 22, r: 0.6 };
  const top = z + CRATE_H;
  const skids = [cy - 9.5, cy + 5.5].map((y) => solid(slab({ x: cx - 14, y, w: 28, d: 4, r: 0.4 }, z, 2, 2), { tone: "lo" })).join("");
  // Listones: dos bandas que rodean las esquinas y tablas verticales de borde a borde
  const bands = k.sideSeam(body, z + 7.4, P, 2) + k.sideSeam(body, z + 12.6, P, 2);
  const battens = [cx - 7, cx, cx + 7].map((x) => seg([x, cy + 11, z + 2], [x, cy + 11, top])).join("")
    + [cy - 4, cy + 4].map((y) => seg([cx + 14, y, z + 2], [cx + 14, y, top])).join("");
  const boards = [cy - 3.7, cy + 3.7].map((y) => k.lineOnTop([cx - 14, y], [cx + 14, y], top, P)).join("");
  const inner = line(bands + battens, lit ? "mid" : "lo") + line(boards, "faint");
  return skids + solid(slab(body, z + 2, CRATE_H - 2, 2, 0.5), { tone: "hi", lit, inner, crease: "lo" });
}

/* ---------- Grúa pórtico (en x = 0; se traslada por los rieles) ---------- */
/** Una pata con su carro de ruedas sobre el riel (sx = -1 izquierda, 1 derecha) */
function leg(sx: number, y: number, ladder: boolean) {
  const x = sx * LEG_X;
  let out = solid(slab({ x: x - 10, y: y - 4, w: 20, d: 8, r: 1 }, 1.5, BOGIE_TOP - 1.5, 2, 0.4), { tone: "lo" })
    + line([x - 5, x + 5].map((wx) => k.sideRing([wx, y + 4, 3.8], 1.7, "y", P, 16)).join(""), "mid");
  let inner = "";
  if (ladder) {
    // Escalera en la cara frontal de la pata
    const fy = y + LEG / 2;
    let rungs = "";
    for (let z = BOGIE_TOP + 4; z < PORTAL_Z - 1; z += 4) rungs += seg([x - 1.8, fy, z], [x + 1.8, fy, z]);
    inner = line(seg([x - 1.8, fy, BOGIE_TOP], [x - 1.8, fy, PORTAL_Z]) + seg([x + 1.8, fy, BOGIE_TOP], [x + 1.8, fy, PORTAL_Z]), "lo") + line(rungs, "faint");
  }
  out += solid(slab({ x: x - LEG / 2, y: y - LEG / 2, w: LEG, d: LEG, r: 0.5 }, BOGIE_TOP, PORTAL_Z - BOGIE_TOP, 2, 0.4), { tone: "mid", inner });
  return out;
}
/** Arriostres en X entre las patas de atrás (las cajas nunca pasan por ahí) */
function braces() {
  const xi = LEG_X - LEG / 2;
  return line(seg([-xi, RAIL_BACK, 24], [xi, RAIL_BACK, 92]) + seg([xi, RAIL_BACK, 24], [-xi, RAIL_BACK, 92]), "lo")
    + dots([[-xi, RAIL_BACK, 24], [xi, RAIL_BACK, 92], [xi, RAIL_BACK, 24], [-xi, RAIL_BACK, 92]], "mid", 0.6);
}

/** Viga de la pluma sobre las patas (sx = -1 izquierda, 1 derecha); la derecha lleva pasamanos y la cabina */
function girder(sx: number) {
  const x = sx * GIRDER_X;
  const plan: Plan = { x: x - 3, y: BOOM_BACK, w: 6, d: BOOM_TIP - BOOM_BACK, r: 0.5 };
  // Juntas donde la viga apoya en las patas
  const seats = [RAIL_BACK, RAIL_FRONT].map((y) => seg([x + 3, y - 3, GIRDER_Z], [x + 3, y - 3, GIRDER_TOP]) + seg([x + 3, y + 3, GIRDER_Z], [x + 3, y + 3, GIRDER_TOP])).join("");
  let out = solid(slab(plan, GIRDER_Z, GIRDER_H, 2, 0.4), { tone: "mid", inner: line(seats, "faint") });
  if (sx > 0) {
    const hx = x + 1.5;
    const ys: number[] = [];
    for (let y = -126; y <= 64; y += 19) ys.push(y);
    let posts = "";
    for (const y of ys) posts += seg([hx, y, GIRDER_TOP], [hx, y, GIRDER_TOP + 6]);
    out += line(posts + seg([hx, ys[0], GIRDER_TOP + 6], [hx, ys[ys.length - 1], GIRDER_TOP + 6]), "lo");
    // Cabina del operador colgada bajo la viga
    const cab: Plan = { x: x - 7, y: -45, w: 14, d: 12, r: 1.6 };
    out = solid(slab({ x: x - 2, y: -41, w: 4, d: 4, r: 0.4 }, GIRDER_Z - 6, 6, 2), { tone: "lo" })
      + solid(slab(cab, GIRDER_Z - 19, 13, 3, 0.5), { tone: "mid", inner: line(k.sideSeam(cab, GIRDER_Z - 10, P, 3) + k.sideSeam(cab, GIRDER_Z - 15, P, 3), "lo") })
      + out;
  }
  return out;
}
const tie = (y: number) => solid(slab({ x: -GIRDER_X + 3, y, w: GIRDER_X * 2 - 6, d: 6, r: 0.5 }, GIRDER_Z + 1.5, 5, 2), { tone: "lo" });

/** Sala de máquinas atrás de la pluma, sobre las vigas */
function house() {
  const plan: Plan = { x: -28, y: BOOM_BACK, w: 56, d: 22, r: 2 };
  const fy = BOOM_BACK + 22;
  const door = k.pathOf([at([10, fy, GIRDER_TOP]), at([10, fy, GIRDER_TOP + 13]), at([18, fy, GIRDER_TOP + 13]), at([18, fy, GIRDER_TOP])]);
  const vents = [-20, -14, -8].map((x) => k.pathOf([at([x, fy, GIRDER_TOP + 8]), at([x, fy, GIRDER_TOP + 14]), at([x + 3, fy, GIRDER_TOP + 14]), at([x + 3, fy, GIRDER_TOP + 8])], true)).join("");
  return solid(slab(plan, GIRDER_TOP, 18, 3, 0.6), { tone: "mid", inner: line(door, "lo") + line(vents, "faint") + line(k.sideSeam(plan, GIRDER_TOP + 4, P, 3), "faint") })
    + solid(slab(k.insetPlan(plan, -1.2), GIRDER_TOP + 18, 1.6, 3, 0.4), { tone: "lo" });
}

/** Carro sobre las vigas (en y = 0) */
function trolley() {
  const plan: Plan = { x: -GIRDER_X - 4, y: -8, w: GIRDER_X * 2 + 8, d: 16, r: 1.2 };
  return solid(slab(plan, GIRDER_TOP, 6, 2, 0.5), { tone: "mid", inner: line(k.sideSeam(plan, GIRDER_TOP + 2.5, P, 2), "faint") })
    + solid(slab({ x: -9, y: -5, w: 18, d: 10, r: 1 }, GIRDER_TOP + 6, 3, 2), { tone: "lo" })
    + dots([[-GIRDER_X - 2, 8, GIRDER_TOP + 1.4], [-GIRDER_X + 6, 8, GIRDER_TOP + 1.4], [GIRDER_X - 6, 8, GIRDER_TOP + 1.4], [GIRDER_X + 2, 8, GIRDER_TOP + 1.4]], "mid", 0.5);
}

/** Motón entre las vigas, colgado del carro: de aquí bajan los cables */
export const HEAD_Z = GIRDER_Z + 2;
function headblock() {
  return solid(slab({ x: -8, y: -6, w: 16, d: 12, r: 1 }, HEAD_Z, GIRDER_TOP - HEAD_Z, 2, 0.4), { tone: "lo" });
}

/** Spreader (en z = 0 su parte baja) con sus seguros en las esquinas */
export const SPREADER_H = 3;
function spreader() {
  const plan: Plan = { x: -16, y: -12.5, w: 32, d: 25, r: 0.8 };
  return solid(slab(plan, 0, SPREADER_H, 2, 0.4), { tone: "mid" })
    + dots(k.corners(plan, 2.2).map(([x, y]) => [x, y, SPREADER_H] as Point3), "hi", 0.55);
}

/* ---------- Chata y remolcador (en reposo junto al muelle) ---------- */
function tug() {
  const out: string[] = [];
  // Remolcador de empuje (detrás de la chata, del lado aguas arriba)
  const tugDeck = WATER_Z + 10;
  const tires = [-157, -145].map((x) => k.sideRing([x, TUG.y + TUG.d, WATER_Z + 5], 2.8, "y", P, 18) + k.sideRing([x, TUG.y + TUG.d, WATER_Z + 5], 1.3, "y", P, 12)).join("");
  out.push(solid(slab(TUG, WATER_Z, tugDeck - WATER_Z, 8, 0.8), { tone: "mid", inner: line(k.sideSeam(TUG, WATER_Z + 3.5, P, 8), "faint") + line(tires, "lo") }));
  for (const y of [26, 50]) out.push(solid(slab({ x: TUG.x + TUG.w - 6, y, w: HULL.x - (TUG.x + TUG.w - 6), d: 6, r: 0.6 }, WATER_Z + 3, 7, 2), { tone: "lo" }));
  const house: Plan = { x: -172, y: 27, w: 32, d: 26, r: 3 };
  const stacks = byDepth([[-168, 34], [-168, 46]].map(([x, y]) => [[x, y, 0] as Point3, solid(cyl(x, y, 2.3, tugDeck + 10, 12, 16), { tone: "lo", inner: line(k.sideArc(x, y, 2.3, tugDeck + 19, P, 12), "faint") })]));
  out.push(solid(slab(house, tugDeck, 10, 3, 0.5), { tone: "mid", inner: line(k.sideSeam(house, tugDeck + 5, P, 3), "faint") }));
  out.push(stacks.join(""));
  const wheel: Plan = { x: -160, y: 30, w: 22, d: 20, r: 2 };
  out.push(solid(slab(wheel, tugDeck + 10, 11, 3, 0.4), { tone: "mid", inner: line(k.sideSeam(wheel, tugDeck + 17.5, P, 3) + k.sideSeam(wheel, tugDeck + 14, P, 3), "lo") }));
  out.push(solid(slab(k.insetPlan(wheel, -1.5), tugDeck + 21, 1.5, 3, 0.4), { tone: "lo" }));
  out.push(solid(cyl(-149, 40, 0.8, tugDeck + 22.5, 14, 10), { tone: "mid", crease: "none" }));
  out.push(solid(cyl(-149, 40, 1.5, tugDeck + 36.5, 1.6, 12), { tone: "hi" }));
  return out.join("");
}

function hull() {
  const out: string[] = [];
  // Casco de la chata
  const plates = [-90, -60, -30, 0, 30].map((x) => seg([x, HULL.y + HULL.d, WATER_Z], [x, HULL.y + HULL.d, DECK_TOP])).join("");
  out.push(solid(slab(HULL, WATER_Z, DECK_TOP - WATER_Z, 8, 1), {
    tone: "mid",
    inner: line(k.sideSeam(HULL, WATER_Z + 3.5, P, 8), "faint") + line(k.sideSeam(HULL, DECK_TOP - 3, P, 8), "lo") + line(plates, "faint"),
  }));
  out.push(line(k.planOutline(k.insetPlan(HULL, 3), DECK_TOP, P, 8), "lo"));
  out.push(line(DECK_X.map((x) => k.planOutline({ x: x - 16, y: DECK_Y - 13, w: 32, d: 26, r: 1 }, DECK_TOP, P, 2)).join(""), "faint"));
  // Bitas de amarre
  for (const x of [-100, 40]) {
    out.push(solid(slab({ x: x - 5, y: 15.5, w: 10, d: 4, r: 0.6 }, DECK_TOP, 0.8, 2), { tone: "lo" }));
    for (const dx of [-2.6, 2.6]) out.push(solid(cyl(x + dx, 17.5, 1.4, DECK_TOP + 0.8, 3.6, 12), { tone: "mid" }));
  }
  return out.join("");
}

/** Amarras: de las bitas del muelle a las de la chata */
export const MOORING: [Point3, Point3][] = [
  [[-118, -44, QUAY_TOP + 6.8], [-100, 17.5, DECK_TOP + 4.4]],
  [[22, -44, QUAY_TOP + 6.8], [40, 17.5, DECK_TOP + 4.4]],
];

const W = water();
/** Piezas fijas, en orden: el agua y el muelle van primero, la pluma de la grúa al final */
export const ART = {
  water: W.plane + W.ripples,
  quay: quay(),
  house: house(),
  trolley: trolley(),
};
/**
 * Piezas que se ordenan en cada cuadro (de atrás hacia adelante, según su caja en el mundo):
 * patas de la grúa, cajas, borde del muelle, chata, amarras y lo que cuelga del carro.
 */
export const ITEMS: { id: string; html: string }[] = [
  { id: "legBL", html: leg(-1, RAIL_BACK, false) },
  { id: "braces", html: braces() },
  { id: "legBR", html: leg(1, RAIL_BACK, false) },
  ...QUAY_X.map((x, i) => ({ id: `quay${i}`, html: crate(x, QUAY_Y, QUAY_TOP) })),
  { id: "legFL", html: leg(-1, RAIL_FRONT, false) },
  { id: "legFR", html: leg(1, RAIL_FRONT, true) },
  { id: "edge", html: quayEdge() },
  { id: "tug", html: tug() },
  { id: "hull", html: hull() },
  ...DECK_X.map((x, i) => ({ id: `deck${i}`, html: crate(x, DECK_Y, DECK_TOP) })),
  { id: "mooring", html: MOORING.map(([a, b]) => k.wireSvg(at(a), at(b), { tone: "mid", size: 1 })).join("") },
  { id: "girderL", html: girder(-1) },
  { id: "tieBack", html: tie(BOOM_BACK) },
  { id: "tieFront", html: tie(BOOM_TIP - 6) },
  { id: "hanging", html: crate(0, 0, 0, true) },
  { id: "spreader", html: spreader() },
  { id: "ropes", html: '<path class="iso-line" data-tone="mid" d=""/>' },
  { id: "headblock", html: headblock() },
  { id: "girderR", html: girder(1) },
];
