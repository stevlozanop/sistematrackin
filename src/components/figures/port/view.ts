import { boxCorners, fitProjection, iso, type Flat, type Plan, type Point3 } from "@/components/iso/iso-kit";
import { DECK_TOP, QUAY_TOP } from "./model";

/** Cámara y medidas del mundo (1 unidad ≈ 1 px). x a lo largo del río, y hacia el agua, z hacia arriba. */
export const WIDTH = 600;
export const HEIGHT = 500;
export const AZIMUTH = 56;
export const ELEVATION = 40;

export const WATER_Z = -16;
/** Muelle de concreto: su cara frontal mira al río en y = -34 */
export const QUAY: Plan = { x: -192, y: -152, w: 310, d: 118, r: 3 };
export const QUAY_FRONT = QUAY.y + QUAY.d;
/** Rieles de la grúa */
export const RAIL_BACK = -128;
export const RAIL_FRONT = -52;
/** Grúa pórtico (medidas con la grúa en x = 0) */
export const LEG_X = 32;
export const LEG = 6;
export const BOGIE_TOP = 6;
export const PORTAL_Z = 112;
/** Las vigas de la pluma van sobre las patas: los cables bajan entre ellas sin chocar con nada */
export const GIRDER_X = LEG_X;
export const GIRDER_Z = PORTAL_Z;
export const GIRDER_H = 8;
export const GIRDER_TOP = GIRDER_Z + GIRDER_H;
export const BOOM_BACK = -148;
export const BOOM_TIP = 70;
/** Chata (barcaza) y remolcador de empuje, en reposo junto al muelle */
export const HULL: Plan = { x: -120, y: 12, w: 180, d: 58, r: 8 };
export const TUG: Plan = { x: -178, y: 20, w: 54, d: 40, r: 15 };

export const P = fitProjection(
  [
    ...boxCorners(QUAY, WATER_Z, QUAY_TOP),
    ...boxCorners({ x: -150, y: BOOM_BACK, w: 200, d: BOOM_TIP - BOOM_BACK, r: 0 }, 0, GIRDER_TOP + 20),
    ...boxCorners({ ...HULL, d: HULL.d + 4 }, WATER_Z, DECK_TOP),
    ...boxCorners(TUG, WATER_Z, 36),
  ] as Point3[],
  WIDTH, HEIGHT, { pad: 18, azimuth: AZIMUTH, elevation: ELEVATION },
);

export const at = (p: Point3): Flat => iso(p, P);
