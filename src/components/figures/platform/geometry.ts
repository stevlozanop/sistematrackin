import * as k from "@/components/iso/iso-kit";
import type { Plan, Point3 } from "@/components/iso/iso-kit";

/**
 * Sala de la plataforma (figura del Dashboard general de The Iceberg Labs).
 * Cada pieza es un dato real: las terminales encendidas son las personas conectadas, las luces del rack son
 * las conexiones abiertas a la base, el tanque se llena con el espacio usado (regla en MB), la aguja marca
 * los aciertos de caché y por los cables corre el tráfico de la API.
 */
export const WIDTH = 640;
export const HEIGHT = 340;

const BASE: Plan = { x: -175, y: -75, w: 350, d: 150, r: 8 };
const DESK: Plan = { x: -160, y: -50, w: 110, d: 100, r: 3 };
const DESK_Z = 22;
const DESK_TOP = DESK_Z + 3;
export const MONITORS: [number, number][] = [[-140, -25], [-105, -25], [-70, -25], [-140, 15], [-105, 15], [-70, 15]];
const RACK: Plan = { x: -22, y: -32, w: 50, d: 50, r: 1.5 };
const RACK_Z = 4;
const RACK_TOP = 124;
export const UNITS = 8;
const UNIT_H = (RACK_TOP - RACK_Z) / UNITS;
export const TANK = { x: 115, y: 0, r: 36, liquid: 33, z: 6, top: 112 };
export const LEVEL_SPAN = 100; // alto del líquido cuando la base está llena (= límite del plan)
export const POST: Plan = { x: 80, y: 36, w: 4, d: 4, r: 0.4 };
export const GAUGE = { x: 150, y: 52, r: 18, z: 12, top: 18 };
/** La aguja barre 270° (el hueco de la escala queda atrás, lejos de la vista): 0% en el ángulo 0, 100% en 270° */
export const SWEEP = (Math.PI * 3) / 2;
export const SWEEP_FROM = 0;

export const P = k.fitProjection(
  [...k.boxCorners(BASE, -14, 0), ...k.boxCorners(RACK, 0, RACK_TOP + 3), ...k.boxCorners({ x: TANK.x - 40, y: -40, w: 80, d: 80, r: 0 }, 0, TANK.top + 4)],
  WIDTH, HEIGHT, { pad: 22, azimuth: 45, elevation: 30 },
);
const at = (p: Point3) => k.iso(p, P);
const solid = (paths: k.SolidPaths, style: k.SolidStyle = {}) => k.solidSvg(paths, style);
const line = (d: string, tone: k.LineTone = "lo", extra: Partial<k.LineStyle> = {}) => k.lineSvg(d, { tone, ...extra });
const dots = (points: Point3[], tone: k.Tone = "mid", size = 0.5) => k.dotsSvg(points.map(at), { tone, size });
const seg = (a: Point3, b: Point3) => k.segment(a, b, P);
const box = (p: Point3[]) => k.pathOf(p.map(at), true);

function base() {
  const feet = k.corners(BASE, 20).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P))
    .map(([x, y]) => solid(k.cylinder(x, y, 7, -14, 1.6, P, 24), { tone: "lo" }) + solid(k.cylinder(x, y, 5.4, -12.4, 2.4, P, 24), { tone: "mid" })).join("");
  const plate: Plan = { x: BASE.x + 12, y: BASE.y + BASE.d - 16, w: 70, d: 10, r: 1.4 };
  const rules = [0, 1, 2].map((i) => k.lineOnTop([plate.x + 4, plate.y + 2.6 + i * 2.4], [plate.x + 4 + [44, 30, 52][i], plate.y + 2.6 + i * 2.4], 0.8, P)).join("");
  return `<path class="iso-halo" d="${k.haloOf(BASE, -14, 14, P)}"/>` + feet
    + solid(k.slabOf(BASE, -10, 10, P, 8, 1.6), { tone: "mid" })
    + line(k.planOutline(k.insetPlan(BASE, 5), 0, P), "faint")
    + line(k.corners(BASE, 10).map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), "lo")
    + dots(k.corners(BASE, 10).map(([x, y]) => [x, y, 0] as Point3), "mid", 0.5)
    + solid(k.slabOf(plate, 0, 0.8, P, 4), { tone: "lo", crease: "none" }) + line(k.planOutline(k.insetPlan(plate, 1.4), 0.8, P, 4), "faint")
    + line(rules, "lo", { free: true });
}

/** Caja de conexiones bajo la mesa y los dos cables por el piso (el tráfico corre por ellos) */
export const JUNCTION: Plan = { x: -78, y: -6, w: 10, d: 10, r: 1 };
export const CABLES: [Point3, Point3][] = [
  [[JUNCTION.x + JUNCTION.w, -1, 2.5], [RACK.x - 3, -1, 2.5]],
  [[RACK.x + RACK.w + 3, -4, 2.5], [TANK.x - 40, -4, 2.5]],
];
function floor() {
  return solid(k.slabOf(JUNCTION, 0, 5, P, 2, 0.4), { tone: "lo" }) + dots([[JUNCTION.x + 5, JUNCTION.y + 5, 5]], "mid", 0.6);
}

function desk() {
  const out: string[] = [];
  const legs = k.corners(DESK, 5).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of legs) out.push(solid(k.slabOf({ x: x - 2, y: y - 2, w: 4, d: 4, r: 0.4 }, 0, DESK_Z, P, 2), { tone: "lo" }));
  out.push(solid(k.slabOf(DESK, DESK_Z, 3, P, 3, 0.8), { tone: "mid", inner: line(k.sideSeam(DESK, DESK_Z + 1.2, P, 3), "faint") }));
  return out.join("");
}

/** Una terminal: pie, cuello, pantalla (la cara que mira al frente se enciende) y teclado */
export function monitor(cx: number, cy: number) {
  const face = cy + 4;
  const screen = box([[cx - 10.5, face, 31.6], [cx + 10.5, face, 31.6], [cx + 10.5, face, 44.4], [cx - 10.5, face, 44.4]]);
  const keys = k.dotGrid(cx - 8, cy + 10.2, 9, 2, 2, DESK_TOP + 0.8, P);
  return solid(k.slabOf({ x: cx - 5, y: cy - 3, w: 10, d: 6, r: 1 }, DESK_TOP, 1, P, 3), { tone: "lo" })
    + solid(k.slabOf({ x: cx - 1, y: cy - 1, w: 2, d: 2, r: 0.4 }, DESK_TOP + 1, 4, P, 2), { tone: "mid", crease: "none" })
    + solid(k.slabOf({ x: cx - 12, y: cy + 1, w: 24, d: 3, r: 0.6 }, 30, 16, P, 2, 0.4), { tone: "hi", inner: line(screen, "lo") })
    + `<path class="pf-screen" d="${screen}"/>`
    + solid(k.slabOf({ x: cx - 10, y: cy + 9, w: 20, d: 6, r: 0.8 }, DESK_TOP, 0.8, P, 2), { tone: "lo" })
    + k.dotsSvg(keys, { tone: "lo", size: 0.4 });
}

function rack() {
  const fy = RACK.y + RACK.d;
  const fx = RACK.x + RACK.w;
  let seams = "";
  for (let i = 1; i < UNITS; i++) seams += seg([RACK.x, fy, RACK_Z + i * UNIT_H], [fx, fy, RACK_Z + i * UNIT_H]) + seg([fx, RACK.y, RACK_Z + i * UNIT_H], [fx, fy, RACK_Z + i * UNIT_H]);
  // Rejillas: ranuras cerradas en el costado de cada unidad
  let vents = "";
  for (let i = 0; i < UNITS; i++) for (const y of [RACK.y + 10, RACK.y + 22, RACK.y + 34]) {
    const z = RACK_Z + i * UNIT_H + UNIT_H / 2;
    vents += box([[fx, y, z - 1.2], [fx, y + 8, z - 1.2], [fx, y + 8, z + 1.2], [fx, y, z + 1.2]]);
  }
  // Manijas y ranura de cada unidad en el frente
  let handles = "";
  for (let i = 0; i < UNITS; i++) {
    const z = RACK_Z + i * UNIT_H + UNIT_H / 2;
    handles += box([[RACK.x + 24, fy, z - 1.4], [RACK.x + 44, fy, z - 1.4], [RACK.x + 44, fy, z + 1.4], [RACK.x + 24, fy, z + 1.4]]);
  }
  return solid(k.slabOf(k.insetPlan(RACK, -3), 0, RACK_Z, P, 2, 0.4), { tone: "lo" })
    + solid(k.slabOf(RACK, RACK_Z, RACK_TOP - RACK_Z, P, 2, 0.6), { tone: "mid", inner: line(seams, "faint") + line(vents, "faint") + line(handles, "lo") })
    + solid(k.slabOf(k.insetPlan(RACK, -1.2), RACK_TOP, 3, P, 2, 0.5), { tone: "lo" })
    + dots(k.corners(k.insetPlan(RACK, -1.2), 2.6).map(([x, y]) => [x, y, RACK_TOP + 3] as Point3), "mid", 0.45);
}

/** Luces del rack: 3 por unidad, de abajo hacia arriba (cada una = una conexión abierta) */
export const LEDS: [number, number][] = [];
for (let i = 0; i < UNITS; i++) for (const x of [RACK.x + 6, RACK.x + 11, RACK.x + 16]) {
  LEDS.push(at([x, RACK.y + RACK.d, RACK_Z + i * UNIT_H + UNIT_H / 2]));
}

function tankBack() {
  return solid(k.cylinder(TANK.x, TANK.y, 40, 0, TANK.z, P, 64, 0.6), { tone: "lo" })
    + line(k.ring(TANK.x, TANK.y, TANK.r, TANK.z, P, 64), "faint");
}
/** Vidrio: solo el contorno, las juntas y un brillo (el líquido se ve a través) */
function tankGlass() {
  const shell = k.cylinder(TANK.x, TANK.y, TANK.r, TANK.z, TANK.top - TANK.z, P, 64);
  const shine = [0.55, 0.62].map((t) => {
    const a = Math.atan2(1, 1) + Math.PI / 2 - t * Math.PI;
    const x = TANK.x + TANK.r * Math.cos(a), y = TANK.y + TANK.r * Math.sin(a);
    return seg([x, y, TANK.z + 8], [x, y, TANK.top - 8]);
  }).join("");
  // Área para tocar el tanque (el vidrio no tiene relleno visible)
  return `<path class="pf-glass" d="${shell.fill}"/>` + line(shell.outline, "mid") + line(shine, "faint")
    + solid(k.cylinder(TANK.x, TANK.y, 38, TANK.top, 4, P, 64, 0.6), { tone: "mid", inner: line(k.sideArc(TANK.x, TANK.y, 38, TANK.top + 2, P, 40), "faint") })
    + dots(Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return [TANK.x + 35 * Math.cos(a), TANK.y + 35 * Math.sin(a), TANK.top + 4] as Point3; }), "mid", 0.45);
}

/** Regla del tanque: cada marca = 10% del límite; mayor cada 20% */
function post() {
  let minor = "", major = "";
  for (let i = 0; i <= 10; i++) {
    const z = TANK.z + (i / 10) * LEVEL_SPAN;
    const d = seg([POST.x, POST.y + POST.d, z], [POST.x + POST.w, POST.y + POST.d, z]) + seg([POST.x + POST.w, POST.y, z], [POST.x + POST.w, POST.y + POST.d, z]);
    if (i % 2) minor += d; else major += d;
  }
  return solid(k.slabOf(k.insetPlan(POST, -2), 0, 3, P, 2, 0.4), { tone: "lo" })
    + solid(k.slabOf(POST, 3, TANK.z + LEVEL_SPAN + 4 - 3, P, 2, 0.3), { tone: "mid", inner: line(minor, "lo") + line(major, "mid") });
}
/** Cursor de la regla (sube con el nivel) */
export const rider = () => solid(k.slabOf(k.insetPlan(POST, -1.6), TANK.z - 1, 2, P, 2, 0.3), { tone: "hi", lit: true });

function gauge() {
  const g = GAUGE;
  const t = k.radialTicks(g.x, g.y, g.r - 3, 40, 5, g.top, [1.3, 2.8], P, SWEEP_FROM, SWEEP);
  return solid(k.cylinder(g.x, g.y, 5, 0, g.z, P, 24), { tone: "mid", inner: line(k.sideArc(g.x, g.y, 5, 4, P, 16), "faint") })
    + solid(k.cylinder(g.x, g.y, g.r, g.z, g.top - g.z, P, 64, 0.6), { tone: "hi", crease: "lo", inner: line(k.knurl(g.x, g.y, g.r, g.top - 3, g.top, 72, P, 0.3), "faint") })
    + line(k.ring(g.x, g.y, g.r - 1.8, g.top, P, 64), "lo")
    + line(t.minor, "lo") + line(t.major, "mid");
}

export const ART = {
  base: base(),
  floor: floor(),
  desk: desk(),
  monitors: MONITORS.map(([x, y]) => monitor(x, y)),
  rack: rack(),
  tankBack: tankBack(),
  tankGlass: tankGlass(),
  post: post(),
  gauge: gauge(),
};
