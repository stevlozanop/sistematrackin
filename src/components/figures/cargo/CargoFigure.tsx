"use client";

import * as React from "react";
import * as k from "@/components/iso/iso-kit";
import type { Plan, Point3, Projection } from "@/components/iso/iso-kit";
import { cn } from "@/lib/cn";
import "@/components/iso/iso.css";
import "./cargo.css";

/**
 * Carga en 3D (kit Anatomy), al estilo de un elegidor de vehículo: el camión (4 tamaños) o la chata
 * se dibuja en corte, con las cajas de motos que ya lleva, sus medidas y la carga máxima.
 * Al sumar guías las cajas caen en su lugar; si se pasa, las de más quedan en rojo; al despachar, el vehículo se va.
 */
export type TruckSize = { id: string; label: string; name: string; cap: number; len: number; hei: number; cols: number; tiers: number; meters: string; mh: string };

/** Tamaños de camión (historial de la ruta: normal unas 36 motos, como máximo 84) */
export const TRUCK_SIZES: TruckSize[] = [
  { id: "S", label: "S", name: "Furgón", cap: 18, len: 40, hei: 22, cols: 4, tiers: 2, meters: "4,2 m", mh: "2,1 m" },
  { id: "M", label: "M", name: "Camión", cap: 36, len: 62, hei: 26, cols: 6, tiers: 3, meters: "6,5 m", mh: "2,5 m" },
  { id: "L", label: "L", name: "Camión grande", cap: 60, len: 84, hei: 28, cols: 8, tiers: 3, meters: "8,8 m", mh: "2,7 m" },
  { id: "XL", label: "XL", name: "Semitráiler", cap: 84, len: 112, hei: 30, cols: 10, tiers: 3, meters: "12 m", mh: "2,9 m" },
];
export const sizeFor = (units: number) => TRUCK_SIZES.find((s) => units <= s.cap) ?? TRUCK_SIZES[TRUCK_SIZES.length - 1];

const W = 560, H = 230;
const WID = 24, CAB = 17, WHEEL = 5.2, FLOOR = 7;
const AZ = 66, EL = 22;

function truckBounds(): Point3[] {
  const big = TRUCK_SIZES[TRUCK_SIZES.length - 1];
  const x0 = -big.len / 2 - 4, x1 = big.len / 2 + CAB + 4;
  return [...k.boxCorners({ x: x0, y: -WID / 2 - 14, w: x1 - x0, d: WID + 28, r: 0 }, -1, FLOOR + big.hei + 6)];
}
const TRUCK_BOUNDS = truckBounds();
const BARGE = { len: 190, wid: 44, cols: 12, rows: 3, tiers: 3 };
const BARGE_BOUNDS: Point3[] = k.boxCorners({ x: -BARGE.len / 2 - 40, y: -BARGE.wid / 2 - 30, w: BARGE.len + 60, d: BARGE.wid + 50, r: 0 }, -10, 30);

type Crate = { x: number; y: number; z: number; l: number; w: number; h: number; over: boolean; i: number };

/** Cajas acomodadas de atrás hacia adelante y de abajo hacia arriba */
function stack(count: number, grid: { cols: number; rows: number; tiers: number }, box: { x0: number; y0: number; z0: number; l: number; w: number; h: number }, capCrates: number) {
  const out: Crate[] = [];
  const per = grid.rows * grid.tiers;
  for (let i = 0; i < count; i++) {
    const col = Math.floor(i / per) % grid.cols, rest = i % per;
    const tier = Math.floor(rest / grid.rows), row = rest % grid.rows;
    const extra = Math.floor(i / (per * grid.cols)); // lo que no entra: se apila arriba
    out.push({
      x: box.x0 + (col + 0.5) * box.l, y: box.y0 + (row + 0.5) * box.w, z: box.z0 + (tier + extra * grid.tiers) * box.h,
      l: box.l - 1.4, w: box.w - 1.4, h: box.h - 0.8, over: i >= capCrates, i,
    });
  }
  return out;
}

export function CargoFigure({ kind, units, size, leaving = false, className, title }: {
  kind: "truck" | "barge"; units: number; size?: TruckSize; leaving?: boolean; className?: string; title?: string;
}) {
  const [theme, setTheme] = React.useState<"dark" | "light">("light");
  React.useEffect(() => {
    const html = document.documentElement;
    const read = () => setTheme(html.classList.contains("dark") ? "dark" : "light");
    read();
    const mo = new MutationObserver(read);
    mo.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  const P: Projection = React.useMemo(() => k.fitProjection(kind === "truck" ? TRUCK_BOUNDS : BARGE_BOUNDS, W, H, { pad: 10, azimuth: AZ, elevation: EL }), [kind]);
  const at = (p: Point3) => k.iso(p, P);
  const depth = (p: Point3) => k.depthOf(p, P);
  const solid = (pl: Plan, z: number, h: number, style: k.SolidStyle = {}, steps = 2, bevel = 0.3) => k.solidSvg(k.slabOf(pl, z, h, P, steps, bevel), style);
  const line = (d: string, tone: k.LineTone = "lo", dashed = false) => k.lineSvg(d, { tone, dashed });
  const seg = (a: Point3, b: Point3) => k.segment(a, b, P);
  const pct = (p: Point3) => { const [sx, sy] = at(p); return { left: `${(sx / W) * 100}%`, top: `${(sy / H) * 100}%` }; };

  const fig = React.useMemo(() => {
    if (kind === "barge") {
      const { len, wid, cols, rows, tiers } = BARGE;
      const cap = 270, capCrates = cols * rows * tiers;
      const n = Math.min(Math.round((units / cap) * capCrates), capCrates + cols * rows * 2);
      const hull: Plan = { x: -len / 2, y: -wid / 2, w: len, d: wid, r: 8 };
      const water = `<path class="cg-water" d="${k.planOutline({ x: -len / 2 - 40, y: -wid / 2 - 30, w: len + 70, d: wid + 54, r: 14 }, -6, P, 6)}"/>`;
      const tug: Plan = { x: -len / 2 - 32, y: -11, w: 28, d: 22, r: 6 };
      const back = solid(tug, -6, 9, { tone: "mid" }, 5) + solid({ x: tug.x + 6, y: tug.y + 5, w: 12, d: 12, r: 1 }, 3, 9, { tone: "hi" }) + solid({ x: tug.x + 8, y: tug.y + 7, w: 8, d: 8, r: 1 }, 12, 5, { tone: "hi" });
      const deck = solid(hull, -6, 8, { tone: "mid", inner: line(k.sideSeam(hull, -2, P, 6), "faint") }, 6, 0.6);
      const box = { x0: -len / 2 + 6, y0: -wid / 2 + 4, z0: 2, l: (len - 12) / cols, w: (wid - 8) / rows, h: 7 };
      const crates = stack(n, { cols, rows, tiers }, box, capCrates);
      return { under: water + back + deck, crates, over: "", cap, dims: null as null | { len: Point3[]; hei: Point3[] } };
    }
    const s = size ?? TRUCK_SIZES[1];
    const capCrates = s.cols * 2 * s.tiers;
    const n = Math.min(Math.round((units / s.cap) * capCrates), capCrates + s.cols * 2 * 2);
    const x0 = -s.len / 2 - CAB / 2, x1 = x0 + s.len, z0 = FLOOR, top = FLOOR + s.hei;
    // Chasis, piso y las paredes del fondo (la caja se ve en corte: sin la pared de adelante ni el techo)
    const chassis = solid({ x: x0 - 1, y: -WID / 2 + 3, w: s.len + CAB + 2, d: WID - 6, r: 1 }, WHEEL - 1, 2.6, { tone: "mid" });
    const floor = solid({ x: x0, y: -WID / 2, w: s.len, d: WID, r: 0.6 }, z0 - 1.6, 1.6, { tone: "mid" });
    const farWall = solid({ x: x0, y: -WID / 2, w: s.len, d: 1.2, r: 0.2 }, z0, s.hei, { tone: "lo" }, 2, 0);
    const backWall = solid({ x: x0, y: -WID / 2, w: 1.2, d: WID, r: 0.2 }, z0, s.hei, { tone: "lo" }, 2, 0);
    const ribs = Array.from({ length: Math.max(2, Math.round(s.len / 16)) }, (_, i) => x0 + ((i + 1) * s.len) / (Math.round(s.len / 16) + 1))
      .map((x) => seg([x, -WID / 2 + 1.2, z0], [x, -WID / 2 + 1.2, top])).join("");
    // Marco de la caja (aristas de adelante y del techo, en línea fina)
    const frame = [
      seg([x0, WID / 2, z0], [x0, WID / 2, top]), seg([x0, WID / 2, top], [x1, WID / 2, top]), seg([x1, WID / 2, top], [x1, WID / 2, z0]),
      seg([x0, -WID / 2, top], [x0, WID / 2, top]), seg([x1, -WID / 2, top], [x1, WID / 2, top]), seg([x0, -WID / 2, top], [x1, -WID / 2, top]),
    ].join("");
    // Cabina: bloque con parabrisas
    const cab: Plan = { x: x1 + 1.5, y: -WID / 2 + 0.5, w: CAB - 1.5, d: WID - 1, r: 3 };
    const cabSvg = solid(cab, z0 - 2, 16, { tone: "hi", className: "cg-cab" }, 4, 0.5)
      + solid({ x: cab.x + 1, y: cab.y + 1, w: CAB - 7, d: WID - 3, r: 2.5 }, z0 + 14, 5, { tone: "hi", className: "cg-cab" }, 4, 0.4)
      + line(seg([cab.x + CAB - 1.6, -WID / 2 + 3, z0 + 9], [cab.x + CAB - 1.6, WID / 2 - 3, z0 + 9]) + seg([cab.x + CAB - 1.6, WID / 2 - 3, z0 + 9], [cab.x + CAB - 4, WID / 2 - 3, z0 + 18]), "mid");
    // Ruedas: las del lado de atrás primero
    const axles = [x0 + 9, x0 + s.len - 9, x1 + CAB - 6, ...(s.len > 80 ? [x0 + 21] : [])];
    const wheel = (x: number, y: number) => `<path class="cg-wheel" d="${k.sideRing([x, y, WHEEL], WHEEL, "y", P, 22)}"/><path class="cg-hub" d="${k.sideRing([x, y + (y > 0 ? 0.6 : -0.6), WHEEL], WHEEL * 0.42, "y", P, 14)}"/>`;
    const farWheels = axles.map((x) => wheel(x, -WID / 2 + 1)).join("");
    const nearWheels = axles.map((x) => wheel(x, WID / 2 - 1)).join("");
    const shadow = `<path class="cg-shadow" d="${k.planOutline({ x: x0 - 4, y: -WID / 2 - 2, w: s.len + CAB + 10, d: WID + 4, r: 8 }, 0, P, 6)}"/>`;
    const box = { x0: x0 + 1.8, y0: -WID / 2 + 1.6, z0, l: (s.len - 3) / s.cols, w: (WID - 3) / 2, h: (s.hei - 2) / s.tiers };
    const crates = stack(n, { cols: s.cols, rows: 2, tiers: s.tiers }, box, capCrates);
    return {
      under: shadow + farWheels + chassis + floor + backWall + farWall + line(ribs, "faint"),
      crates,
      over: line(frame, "mid") + cabSvg + nearWheels,
      cap: s.cap,
      dims: { len: [[x0, WID / 2 + 9, 0], [x1, WID / 2 + 9, 0]] as Point3[], hei: [[x0 - 6, WID / 2, z0], [x0 - 6, WID / 2, top]] as Point3[] },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, size, units, P]);

  // Cajas en orden de dibujo (las de atrás primero)
  const crates = [...fig.crates].sort((a, b) => depth([a.x, a.y, 0]) - depth([b.x, b.y, 0]) || a.z - b.z);
  const away = (() => { const [ax, ay] = at([0, 0, 0]), [bx, by] = at([260, 0, 0]); return { dx: bx - ax, dy: by - ay }; })();
  const over = units > fig.cap;

  return (
    <div className={cn("iso cg relative select-none", className)} data-theme={theme} style={{ ["--cg-dx" as string]: `${away.dx}px`, ["--cg-dy" as string]: `${away.dy}px` }}>
      <svg className="iso-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title ?? (kind === "truck" ? `Camión con ${units} motos` : `Chata con ${units} motos`)}>
        <g key={`${kind}-${size?.id ?? ""}`} className={cn("cg-body", leaving && "is-leaving")}>
          <g dangerouslySetInnerHTML={{ __html: fig.under }} />
          {crates.map((c) => (
            <g key={c.i} className={cn("cg-crate", c.over && "is-over")} style={{ animationDelay: `${Math.min(c.i, 30) * 14}ms` }}
              dangerouslySetInnerHTML={{ __html: solid({ x: c.x - c.l / 2, y: c.y - c.w / 2, w: c.l, d: c.w, r: 0.3 }, c.z, c.h, { tone: "hi", lit: !c.over }, 2, 0.25) }} />
          ))}
          <g dangerouslySetInnerHTML={{ __html: fig.over }} />
          {fig.dims && (
            <g dangerouslySetInnerHTML={{ __html: line(seg(fig.dims.len[0], fig.dims.len[1]), "mid") + line(seg(fig.dims.hei[0], fig.dims.hei[1]), "mid")
              + line(seg([fig.dims.len[0][0], fig.dims.len[0][1] - 2.5, 0], [fig.dims.len[0][0], fig.dims.len[0][1] + 2.5, 0]) + seg([fig.dims.len[1][0], fig.dims.len[1][1] - 2.5, 0], [fig.dims.len[1][0], fig.dims.len[1][1] + 2.5, 0]), "mid") }} />
          )}
        </g>
      </svg>
      {/* Medidas y carga, como etiquetas sobre el dibujo */}
      {kind === "truck" && size && fig.dims && !leaving && (
        <>
          <span className="cg-dim" style={pct([(fig.dims.len[0][0] + fig.dims.len[1][0]) / 2, fig.dims.len[0][1] + 4, 0])}>{size.meters}</span>
          <span className="cg-dim" style={pct([fig.dims.hei[0][0] - 3, fig.dims.hei[0][1], (fig.dims.hei[0][2] + fig.dims.hei[1][2]) / 2])}>{size.mh}</span>
        </>
      )}
      <span className={cn("cg-load", over && "is-over")}>
        <b>{units.toLocaleString("es-PE")}</b>/{fig.cap.toLocaleString("es-PE")}
      </span>
    </div>
  );
}

/** Botones S · M · L · XL con el indicador que se desliza */
export function SizePicker({ value, onChange, units }: { value: TruckSize; onChange: (s: TruckSize) => void; units: number }) {
  return (
    <div className="sb-glass relative flex rounded-full bg-sb-surface-container p-1" role="radiogroup" aria-label="Tamaño del camión">
      {TRUCK_SIZES.map((s) => {
        const on = s.id === value.id;
        return (
          <button key={s.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(s)} title={`${s.name} · hasta ${s.cap} motos`}
            className={cn("sb-pill relative z-[1] flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors duration-300", on ? "text-sb-on-surface" : "text-sb-on-surface-variant hover:text-sb-on-surface", units > s.cap && !on && "opacity-45")}>
            {on && <span className="cg-seg absolute inset-0 -z-[1] rounded-full bg-sb-surface shadow-[var(--sb-shadow-card)]" />}
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
