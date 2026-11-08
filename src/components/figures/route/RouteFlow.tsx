"use client";

import * as React from "react";
import * as k from "@/components/iso/iso-kit";
import type { Plan, Point3 } from "@/components/iso/iso-kit";
import { cn } from "@/lib/cn";
import "@/components/iso/iso.css";
import "./route.css";

/**
 * Ruta animada (kit Anatomy): el recorrido real de un módulo como maqueta isométrica.
 * Cada estación es un paso del sistema; la pila de cajas crece con las motos que están ahí,
 * las naves avanzan por el río según los días que llevan desde el zarpe y los puntos que corren
 * por el río y los caminos muestran el sentido del flujo. Toca una estación o una nave para ver sus unidades.
 */

export type StageCount = { n: number; late: number; soon: number; overdue: number; noReason: number };
export type FlowNave = { nave: string; status: string; n: number; late: number; containers: number; since: string | null; days: number; progress: number };
export type FlowData = { stages: Record<string, StageCount>; naves: FlowNave[]; riverDays: number };
export type Pick = { kind: "stage"; status: string } | { kind: "nave"; nave: string; status: string };

type Kind = "quay" | "container" | "dock" | "warehouse" | "truck" | "store";
type Station = { status: string; label: string; place: string; kind: Kind; at: [number, number] };

/** Estaciones de cada ruta (estado del sistema → objeto y lugar en la maqueta) */
function stationsOf(site: "PCL" | "YUR"): Station[] {
  const end = site === "PCL" ? "Pucallpa" : "Yurimaguas";
  const base: Station[] = [
    { status: "IQT-PORT", label: "1 · IQT-Port", place: "Muelle de Iquitos", kind: "quay", at: [-295, -70] },
    { status: "EMBARQUE", label: "1.1 · Embarque", place: "Contenedores en el muelle", kind: "container", at: [-225, -82] },
    { status: "ARRIBO PUERTO", label: "3 · Arribo puerto", place: `Puerto de ${end}`, kind: "dock", at: [70, -78] },
    { status: "EN ALMACÉN", label: "4 · En almacén", place: site === "PCL" ? "Almacén Pucallpa" : "ENAPU Yurimaguas", kind: "warehouse", at: [155, -82] },
    { status: "TRANSITO DEALER", label: "5 · Tránsito dealer", place: "Camión a las tiendas", kind: "truck", at: [235, -18] },
    { status: "ENTREGADO", label: "6 · Entregado", place: "Tiendas de los dealers", kind: "store", at: [310, 60] },
  ];
  if (site === "PCL") base.push(
    { status: "EN ALMACÉN LIMA", label: "5.1 · En almacén Lima", place: "Almacén de Lima", kind: "warehouse", at: [120, 70] },
    { status: "TRANSITO DEALER 2", label: "5.2 · Tránsito dealer 2", place: "Camión desde Lima", kind: "truck", at: [215, 100] },
  );
  return base;
}

const W = 900, H = 400;
const BOARD: Plan = { x: -340, y: -120, w: 700, d: 270, r: 14 };
/** Río (centro del cauce): sale del muelle de Iquitos y llega al puerto de destino */
const RIVER: [number, number][] = [[-270, -10], [-200, 30], [-110, 48], [-30, 30], [20, -5], [45, -48]];
const ROADS: [number, number][][] = [
  [[92, -62], [128, -66]], [[180, -60], [222, -36]], [[248, 0], [292, 40]],
];
const LIMA_ROAD: [number, number][] = [[150, -56], [128, 44], [192, 98], [290, 66]];

// Cámara girada para que la ruta se lea de izquierda a derecha (Iquitos → río → destino → tiendas), con aire arriba para las etiquetas
const P = k.fitProjection([...k.boxCorners(BOARD, -10, 0), [0, 0, 60] as Point3], W, H, { pad: 10, headroom: 44, azimuth: 72, elevation: 40 });
const at = (p: Point3) => k.iso(p, P);
const solid = (paths: k.SolidPaths, style: k.SolidStyle = {}) => k.solidSvg(paths, style);
const line = (d: string, tone: k.LineTone = "lo", extra: Partial<k.LineStyle> = {}) => k.lineSvg(d, { tone, ...extra });
const slab = (pl: Plan, z: number, h: number, steps = 2, bevel = 0) => k.slabOf(pl, z, h, P, steps, bevel);

/** Punto a lo largo de una polilínea (t de 0 a 1) */
function along(poly: [number, number][], t: number): [number, number] {
  const seg = poly.slice(1).map((p, i) => Math.hypot(p[0] - poly[i][0], p[1] - poly[i][1]));
  let d = seg.reduce((a, b) => a + b, 0) * Math.min(1, Math.max(0, t));
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i]) { const u = d / seg[i]; return [poly[i][0] + (poly[i + 1][0] - poly[i][0]) * u, poly[i][1] + (poly[i + 1][1] - poly[i][1]) * u]; }
    d -= seg[i];
  }
  return poly[poly.length - 1];
}
/** Cinta (río o camino) de ancho w sobre el piso, como contorno cerrado */
function ribbon(poly: [number, number][], w: number, z = 0.2) {
  const left: [number, number][] = [], right: [number, number][] = [];
  poly.forEach((p, i) => {
    const a = poly[Math.max(0, i - 1)], b = poly[Math.min(poly.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    left.push([p[0] - (dy / L) * w / 2, p[1] + (dx / L) * w / 2]);
    right.push([p[0] + (dy / L) * w / 2, p[1] - (dx / L) * w / 2]);
  });
  return k.onTop([...left, ...right.reverse()], z, P, true);
}
const pathOn = (poly: [number, number][], z = 0.5) => k.pathOf(poly.map(([x, y]) => at([x, y, z])));

/** Objetos de cada estación (dibujados en su lugar) */
function stationArt(s: Station) {
  const [x, y] = s.at;
  const out: string[] = [];
  const pad: Plan = { x: x - 28, y: y - 22, w: 56, d: 44, r: 3 };
  if (s.kind === "quay" || s.kind === "dock") {
    out.push(solid(slab(pad, 0, 7, 2, 0.6), { tone: "mid", inner: line(k.sideSeam(pad, 3.5, P, 2), "faint") }));
    for (const bx of [x - 18, x + 18]) out.push(solid(k.cylinder(bx, y + 18, 2, 7, 4, P, 12), { tone: "mid" }));
  } else if (s.kind === "container") {
    out.push(solid(slab(pad, 0, 3, 2, 0.4), { tone: "lo" }));
    const box: Plan = { x: x - 22, y: y - 9, w: 36, d: 15, r: 0.6 };
    const ribs = [-14, -8, -2, 4, 10].map((dx) => k.segment([x + dx, y + 6, 3], [x + dx, y + 6, 19], P)).join("");
    out.push(solid(slab(box, 3, 16, 2, 0.5), { tone: "hi", inner: line(ribs, "faint") }));
  } else if (s.kind === "warehouse") {
    const b: Plan = { x: x - 26, y: y - 20, w: 46, d: 34, r: 1 };
    const door = k.pathOf([at([x - 14, y + 14, 0]), at([x - 14, y + 14, 14]), at([x - 2, y + 14, 14]), at([x - 2, y + 14, 0])]);
    out.push(solid(slab(b, 0, 24, 2, 0.6), { tone: "mid", inner: line(door, "lo") + line(k.sideSeam(b, 16, P, 2), "faint") }));
    out.push(solid(slab(k.insetPlan(b, -2), 24, 2.4, 2, 0.4), { tone: "lo" }));
  } else if (s.kind === "truck") {
    const cargo: Plan = { x: x - 22, y: y - 8, w: 30, d: 16, r: 1 };
    const cab: Plan = { x: x + 9, y: y - 7, w: 12, d: 14, r: 2 };
    const wheels = [x - 16, x - 2, x + 14].map((wx) => k.sideRing([wx, y + 8, 3], 2.6, "y", P, 14)).join("");
    out.push(solid(slab(cargo, 3, 16, 2, 0.5), { tone: "hi", inner: line(wheels, "mid") }));
    out.push(solid(slab(cab, 3, 12, 3, 0.5), { tone: "mid", inner: line(k.sideSeam(cab, 10, P, 3), "faint") }));
  } else {
    const b: Plan = { x: x - 22, y: y - 16, w: 40, d: 30, r: 1 };
    const win = k.pathOf([at([x - 14, y + 14, 6]), at([x - 14, y + 14, 14]), at([x + 8, y + 14, 14]), at([x + 8, y + 14, 6])], true);
    out.push(solid(slab(b, 0, 20, 2, 0.6), { tone: "mid", inner: line(win, "lo") }));
    out.push(solid(slab({ x: x - 24, y: y + 12, w: 44, d: 6, r: 0.6 }, 14, 2, 2), { tone: "lo" }));
  }
  return out.join("");
}

/** Pila de cajas: crece con las motos que hay (escala logarítmica, máximo 7 cajas) */
function crates(s: Station, n: number) {
  if (!n) return "";
  const count = Math.min(7, Math.ceil(Math.log2(n + 1)));
  const [x, y] = s.at;
  const base = s.kind === "quay" || s.kind === "dock" ? 7 : 0;
  const cx = s.kind === "truck" ? x - 7 : s.kind === "container" ? x + 18 : s.kind === "warehouse" || s.kind === "store" ? x + 18 : x - 6;
  const cy = s.kind === "truck" ? y : y + 4;
  const zb = s.kind === "truck" ? 19 : base;
  let out = "";
  for (let i = 0; i < count; i++) {
    const c: Plan = { x: cx - 6, y: cy - 6, w: 12, d: 12, r: 0.5 };
    out += solid(slab(c, zb + i * 8, 8, 2, 0.4), { tone: "hi", inner: line(k.sideSeam(c, zb + i * 8 + 4, P, 2), "faint") });
  }
  return out;
}

/** Nave (chata con remolcador) en un punto del río */
function boat(x: number, y: number) {
  const hull: Plan = { x: x - 18, y: y - 7, w: 30, d: 14, r: 4 };
  const tug: Plan = { x: x - 27, y: y - 5, w: 10, d: 10, r: 3 };
  return solid(slab(tug, 0, 5, 3, 0.4), { tone: "mid" }) + solid(slab({ x: x - 25, y: y - 3, w: 5, d: 6, r: 1 }, 5, 5, 2), { tone: "mid" })
    + solid(slab(hull, 0, 4, 4, 0.5), { tone: "mid" }) + solid(slab({ x: x - 12, y: y - 5, w: 18, d: 10, r: 0.5 }, 4, 6, 2, 0.4), { tone: "hi" });
}

export function RouteFlow({ site, data, pick, onPick }: { site: "PCL" | "YUR"; data: FlowData | null; pick: Pick | null; onPick: (p: Pick) => void }) {
  const stations = React.useMemo(() => stationsOf(site), [site]);
  const [theme, setTheme] = React.useState<"dark" | "light">("light");
  React.useEffect(() => {
    const html = document.documentElement;
    const read = () => setTheme(html.classList.contains("dark") ? "dark" : "light");
    read();
    const mo = new MutationObserver(read);
    mo.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  // Piezas fijas (se calculan una vez por ruta)
  const scene = React.useMemo(() => {
    const board = `<path class="iso-halo" d="${k.haloOf(BOARD, -10, 10, P)}"/>` + solid(slab(BOARD, -10, 10, 8, 1.2), { tone: "mid" })
      + line(k.planOutline(k.insetPlan(BOARD, 6), 0, P, 8), "faint");
    const water = `<path class="rf-water" d="${ribbon(RIVER, 46)}"/>` + line(ribbon(RIVER, 46), "lo");
    const roads = [...ROADS, ...(site === "PCL" ? [LIMA_ROAD] : [])].map((r) => `<path class="rf-road" d="${ribbon(r, 12, 0.3)}"/>`).join("");
    const art = Object.fromEntries(stations.map((s) => [s.status, stationArt(s)]));
    return { board, water, roads, art };
  }, [site, stations]);

  // Recorridos por donde corren los puntos (sentido del flujo)
  const flows = React.useMemo(() => {
    const iqt = stations[0].at, arr = stations.find((s) => s.status === "ARRIBO PUERTO")!.at;
    const list = [
      pathOn([[iqt[0] + 10, iqt[1] + 24], [iqt[0] + 20, iqt[1] + 46], ...RIVER, [arr[0] - 10, arr[1] + 22]], 1),
      ...ROADS.map((r) => pathOn(r, 1)),
    ];
    if (site === "PCL") list.push(pathOn(LIMA_ROAD, 1));
    return list;
  }, [site, stations]);

  const count = (st: string) => data?.stages[st]?.n ?? 0;
  const late = (st: string) => data?.stages[st]?.late ?? 0;
  const river = data?.naves.filter((x) => x.status === "TRANSITO FLUVIAL") ?? [];
  const loading = data?.naves.filter((x) => x.status === "EMBARQUE") ?? [];
  const sel = (st: string) => pick?.kind === "stage" && pick.status === st;
  const byDepth = [...stations].sort((a, b) => k.depthOf([a.at[0], a.at[1], 0], P) - k.depthOf([b.at[0], b.at[1], 0], P));
  const pct = (p: Point3) => { const [sx, sy] = at(p); return { left: `${(sx / W) * 100}%`, top: `${(sy / H) * 100}%` }; };
  // Naves: avanzan según sus días; se separan para no taparse y no llegan al puerto hasta arribar
  const spots: number[] = [];
  const boats = [...river].sort((a, c) => c.progress - a.progress).map((b, i) => {
    let t = Math.min(0.86, 0.08 + b.progress * 0.8);
    while (spots.some((q) => Math.abs(q - t) < 0.2)) t -= 0.2;
    t = Math.max(0.06, t);
    spots.push(t);
    const [bx, by] = along(RIVER, t);
    return { b, x: bx, y: by + (i % 2 ? 6 : -6) };
  });

  return (
    <div className="flex flex-col gap-2">
    {loading.length > 0 && (
      <p className="self-start rounded-full bg-sb-surface-container px-3 py-1 text-[11px] text-sb-on-surface-variant">
        Cargando en Iquitos: {loading.map((x) => `${x.nave} (${x.n})`).join(" · ")}
      </p>
    )}
    <p className="text-[11px] text-sb-on-surface-variant md:hidden">Desliza a los lados para ver toda la ruta.</p>
    {/* En el celular la maqueta mantiene un tamaño legible y se desliza a los lados */}
    <div className="-mx-2 overflow-x-auto px-2 pb-1 md:mx-0 md:overflow-visible md:px-0">
    <div className="iso rf relative min-w-[760px] md:min-w-0" data-theme={theme}>
      <svg className="iso-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Ruta ${site}: motos en cada etapa, naves en el río y entregas`}>
        <g dangerouslySetInnerHTML={{ __html: scene.board + scene.water + scene.roads }} />
        {/* Puntos que corren por el río y los caminos: el sentido del flujo */}
        <g className="rf-flow" aria-hidden>
          {flows.map((d, i) => [0, 1, 2].map((j) => (
            <circle key={`${i}-${j}`} r={1.8}>
              <animateMotion dur={`${i === 0 ? 9 : 4}s`} begin={`${-j * (i === 0 ? 3 : 1.33)}s`} repeatCount="indefinite" path={d} />
            </circle>
          )))}
        </g>
        {/* Naves en el río (avanzan según los días desde el zarpe) */}
        {boats.map(({ b, x, y }) => {
          const on = pick?.kind === "nave" && pick.nave === b.nave;
          return (
            <g key={b.nave} className={cn("rf-pick rf-boat", on && "is-on")} role="button" tabIndex={-1} aria-label={`Nave ${b.nave}`}
              onClick={() => onPick({ kind: "nave", nave: b.nave, status: b.status })} dangerouslySetInnerHTML={{ __html: boat(x, y) }} />
          );
        })}
        {/* Estaciones, de atrás hacia adelante */}
        {byDepth.map((s) => (
          <g key={s.status} className={cn("rf-pick", sel(s.status) && "is-on", !count(s.status) && "is-empty")} role="button" tabIndex={-1} aria-label={s.place}
            onClick={() => onPick({ kind: "stage", status: s.status })}
            dangerouslySetInnerHTML={{ __html: scene.art[s.status] + crates(s, count(s.status)) }} />
        ))}
      </svg>
      {/* Etiquetas con las cifras (botones accesibles) */}
      {byDepth.map((s) => {
        const n = count(s.status), l = late(s.status);
        const top = s.kind === "warehouse" ? 34 : s.kind === "store" ? 30 : 30;
        return (
          <button key={s.status} type="button" onClick={() => onPick({ kind: "stage", status: s.status })} style={pct([s.at[0], s.at[1], top + Math.min(7, Math.ceil(Math.log2(n + 1))) * 4])}
            className={cn("rf-tag", sel(s.status) && "is-on", !n && "is-empty")} aria-pressed={sel(s.status)}>
            <span className="rf-tag-n">{n.toLocaleString()}</span>
            <span className="rf-tag-l">{s.label}</span>
            {l > 0 && <span className="rf-tag-late">{l} tarde</span>}
          </button>
        );
      })}
      {boats.map(({ b, x, y }) => (
        <button key={b.nave} type="button" onClick={() => onPick({ kind: "nave", nave: b.nave, status: b.status })} style={pct([x, y, 16])}
          className={cn("rf-tag rf-tag-boat", pick?.kind === "nave" && pick.nave === b.nave && "is-on")}>
          <span className="rf-tag-n">{b.nave}</span>
          <span className="rf-tag-l">{b.n} unidades · día {b.days}</span>
          {b.late > 0 && <span className="rf-tag-late">{b.late} tarde</span>}
        </button>
      ))}
    </div>
    </div>
    </div>
  );
}

export { stationsOf };
