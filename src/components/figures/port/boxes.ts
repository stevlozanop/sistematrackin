import { CRATE_H, DECK_TOP, DECK_X, DECK_Y, QUAY_TOP, QUAY_X, QUAY_Y, type Pose } from "./model";
import { BOOM_BACK, BOOM_TIP, GIRDER_X, GIRDER_Z, HULL, LEG_X, QUAY, QUAY_FRONT, RAIL_BACK, RAIL_FRONT, TUG, WATER_Z } from "./view";

/** Caja del mundo que ocupa cada pieza: [x0, x1, y0, y1, z0, z1] */
export type Box = [number, number, number, number, number, number];

const HEAD_Z = GIRDER_Z + 2;

/** Cajas de cada pieza ordenable para una pose (null = no se ve) */
export function boxesOf(p: Pose): Record<string, Box | null> {
  const g = p.gantry, b = p.barge;
  const leg = (sx: number, y: number): Box => [g + sx * LEG_X - 10, g + sx * LEG_X + 10, y - 4, y + 4, 0, GIRDER_Z];
  const quay = Object.fromEntries(QUAY_X.map((x, i) => [`quay${i}`, p.quay[i] > 0.01 ? [x - 14, x + 14, QUAY_Y - 11, QUAY_Y + 11, QUAY_TOP, QUAY_TOP + CRATE_H] as Box : null]));
  const shown = p.bargeAlpha > 0.01;
  const deck = Object.fromEntries(DECK_X.map((x, i) => [`deck${i}`, shown && p.deck[i] > 0.01 ? [b + x - 14, b + x + 14, DECK_Y - 11, DECK_Y + 11, DECK_TOP, DECK_TOP + CRATE_H] as Box : null]));
  const top = p.hook;
  return {
    legBL: leg(-1, RAIL_BACK), legBR: leg(1, RAIL_BACK), legFL: leg(-1, RAIL_FRONT), legFR: leg(1, RAIL_FRONT),
    braces: [g - LEG_X + 3, g + LEG_X - 3, RAIL_BACK, RAIL_BACK, 24, 92],
    ...quay,
    edge: [QUAY.x, QUAY.x + QUAY.w, -48, QUAY_FRONT + 3.5, WATER_Z + 2, QUAY_TOP + 6.8],
    tug: shown ? [b + TUG.x, b + HULL.x, TUG.y, TUG.y + TUG.d, WATER_Z, 36] : null,
    hull: shown ? [b + HULL.x, b + HULL.x + HULL.w, HULL.y, HULL.y + HULL.d, WATER_Z, DECK_TOP + 4.4] : null,
    ...deck,
    mooring: p.lines > 0.01 ? [-118, 40, -44, 17.5, DECK_TOP + 4.4, QUAY_TOP + 6.8] : null,
    ropes: [g - 6, g + 6, p.trolley - 4, p.trolley + 4, top + 3, HEAD_Z],
    headblock: [g - 8, g + 8, p.trolley - 6, p.trolley + 6, HEAD_Z, GIRDER_Z + 8],
    spreader: [g - 16, g + 16, p.trolley - 12.5, p.trolley + 12.5, top, top + 3],
    girderL: [g - GIRDER_X - 3, g - GIRDER_X + 3, BOOM_BACK, BOOM_TIP, GIRDER_Z, GIRDER_Z + 8],
    girderR: [g + GIRDER_X - 7, g + GIRDER_X + 7, BOOM_BACK, BOOM_TIP, GIRDER_Z - 19, GIRDER_Z + 14],
    tieBack: [g - GIRDER_X + 3, g + GIRDER_X - 3, BOOM_BACK, BOOM_BACK + 6, GIRDER_Z + 1.5, GIRDER_Z + 6.5],
    tieFront: [g - GIRDER_X + 3, g + GIRDER_X - 3, BOOM_TIP - 6, BOOM_TIP, GIRDER_Z + 1.5, GIRDER_Z + 6.5],
    hanging: p.hanging >= 0 ? [g - 14, g + 14, p.trolley - 11, p.trolley + 11, top - CRATE_H, top] : null,
  };
}

/** A está detrás de B si hay un eje en el que A queda entero del lado lejano (la cámara mira desde +x, +y, +z) */
export function behind(a: Box, b: Box) {
  const e = 0.01;
  return a[1] <= b[0] + e || a[3] <= b[2] + e || a[5] <= b[4] + e;
}
