"use client";

import * as React from "react";
import * as k from "@/components/iso/iso-kit";
import type { Plan, Point3 } from "@/components/iso/iso-kit";
import { Check, Eye } from "lucide-react";
import { cn } from "@/lib/cn";
import "@/components/iso/iso.css";
import "@/components/figures/route/route.css";
import "./dock.css";

/**
 * Muelle en vivo (kit Anatomy) para «Embarque y zarpe»:
 * - a la izquierda, el contenedor que se está armando: una caja por cada guía agregada;
 * - la grúa del muelle trabajando;
 * - amarradas al muelle, las naves que están cargando: una chata por nave con un contenedor por cada contenedor embarcado.
 * Tocar una nave abre su detalle; «Zarpa» la marca para el zarpe; al registrarlo, la chata se va río abajo.
 */
export type DockNave = { nave: string; containers: number; total: number; first: string; need: number };

const W = 900, H = 330;
const QUAY: Plan = { x: -330, y: -130, w: 660, d: 95, r: 6 };
const WATER: Plan = { x: -345, y: -35, w: 690, d: 85, r: 0 };
const BUILD: [number, number] = [-262, -84];
const CRANE_X = -165;
const SLOTS = [-70, 40, 150, 260];

const P = k.fitProjection([...k.boxCorners(QUAY, -14, 0), ...k.boxCorners(WATER, -14, -14), [CRANE_X, -90, 110] as Point3], W, H, { pad: 6, headroom: 24, azimuth: 72, elevation: 38 });
const at = (p: Point3) => k.iso(p, P);
const solid = (paths: k.SolidPaths, style: k.SolidStyle = {}) => k.solidSvg(paths, style);
const line = (d: string, tone: k.LineTone = "lo") => k.lineSvg(d, { tone });
const slab = (pl: Plan, z: number, h: number, steps = 2, bevel = 0) => k.slabOf(pl, z, h, P, steps, bevel);
const seg = (a: Point3, b: Point3) => k.segment(a, b, P);

function scene() {
  const water = `<path class="rf-water" d="${slab(WATER, -14, 0).top}"/>`
    + [[-300, 20], [-120, 40], [80, 30], [230, 45], [-220, 38], [10, 44]].map(([x, y]) => k.fadeLineSvg([at([x, y, -14]), at([x + 50, y, -14])], { fade: [12, 12], tone: "faint" })).join("");
  const front = QUAY.y + QUAY.d;
  const joints = [-270, -200, -130, -60, 10, 80, 150, 220, 290].map((x) => seg([x, front, -14], [x, front, 0])).join("");
  const quay = solid(slab(QUAY, -14, 14, 3, 1), { tone: "mid", inner: line(joints, "faint") })
    + line(k.planOutline(k.insetPlan(QUAY, 4), 0, P, 3), "faint")
    + [-10, 90, 190, 290].map((x) => solid(k.cylinder(x, front - 6, 2.4, 0, 5, P, 14), { tone: "mid" })).join("")
    + solid(slab({ x: QUAY.x + 8, y: -128, w: QUAY.w - 16, d: 3, r: 0.5 }, 0, 1.2, 2), { tone: "mid" })
    + solid(slab({ x: QUAY.x + 8, y: -66, w: QUAY.w - 16, d: 3, r: 0.5 }, 0, 1.2, 2), { tone: "mid" });
  // Zona de armado: piso pintado y marco del contenedor abierto
  const [bx, by] = BUILD;
  const pad: Plan = { x: bx - 40, y: by - 24, w: 80, d: 48, r: 2 };
  const build = line(k.planOutline(pad, 0.2, P, 2), "lo")
    + solid(slab({ x: bx - 36, y: by - 14, w: 72, d: 3, r: 0.4 }, 0, 26, 2), { tone: "mid" })
    + solid(slab({ x: bx + 33, y: by - 14, w: 3, d: 28, r: 0.4 }, 0, 26, 2), { tone: "mid" });
  // Grúa pórtico (fija; su carro se mueve con CSS)
  const legs = [[CRANE_X - 24, -124], [CRANE_X + 24, -124], [CRANE_X - 24, -68], [CRANE_X + 24, -68]]
    .sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P))
    .map(([x, y]) => solid(slab({ x: x - 2.5, y: y - 2.5, w: 5, d: 5, r: 0.4 }, 0, 96, 2, 0.3), { tone: "mid" })).join("");
  const girders = [-24, 24].map((dx) => solid(slab({ x: CRANE_X + dx - 2.5, y: -132, w: 5, d: 150, r: 0.4 }, 96, 6, 2, 0.3), { tone: "mid" })).join("");
  return { water, quay, build, crane: legs + girders };
}

const box = (x: number, y: number, z: number, lit = false) => {
  const c: Plan = { x: x - 11, y: y - 5, w: 22, d: 10, r: 0.4 };
  const ribs = [-6, 0, 6].map((dx) => seg([x + dx, y + 5, z], [x + dx, y + 5, z + 9])).join("");
  return solid(slab(c, z, 9, 2, 0.3), { tone: "hi", lit, inner: line(ribs, "faint") });
};

/** Chata amarrada con sus contenedores apilados (2 filas × hasta 4, luego un segundo piso) */
function barge(x: number, n: number, lit: boolean) {
  const y = 12;
  const hull: Plan = { x: x - 48, y: y - 16, w: 96, d: 32, r: 7 };
  let out = solid(slab(hull, -14, 10, 6, 0.6), { tone: "mid", inner: line(k.sideSeam(hull, -10, P, 6), "faint") });
  const shown = Math.min(n, 16);
  const cells: [number, number, number][] = [];
  for (let i = 0; i < shown; i++) {
    const layer = Math.floor(i / 8), j = i % 8;
    cells.push([x - 33 + (j % 4) * 22, y - 6 + Math.floor(j / 4) * 12, -4 + layer * 9]);
  }
  cells.sort((a, b) => a[2] - b[2] || k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [cx, cy, cz] of cells) out += box(cx, cy, cz, lit);
  // remolcador detrás de la chata
  const tug: Plan = { x: x - 70, y: y - 9, w: 22, d: 18, r: 6 };
  return solid(slab(tug, -14, 8, 5, 0.4), { tone: "mid" }) + solid(slab({ x: x - 64, y: y - 5, w: 10, d: 10, r: 1 }, -6, 8, 2, 0.3), { tone: "hi" }) + out;
}

export function DockScene({ naves, checked, leaving, building, canSail, onOpen, onToggle }: {
  naves: DockNave[]; checked: Set<string>; leaving: Set<string>; building: { guias: number; units: number; container: string; nave: string };
  canSail: boolean; onOpen: (nave: string) => void; onToggle: (nave: string) => void;
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
  const s = React.useMemo(() => scene(), []);
  const shown = naves.slice(0, SLOTS.length);
  const extra = naves.length - shown.length;
  const pct = (p: Point3) => { const [sx, sy] = at(p); return { left: `${(sx / W) * 100}%`, top: `${(sy / H) * 100}%` }; };
  const crates = React.useMemo(() => {
    let out = "";
    const [bx, by] = BUILD;
    for (let i = 0; i < Math.min(building.guias, 9); i++) out += box(bx - 22 + (i % 3) * 22, by - 2 + Math.floor(i / 3) * 0, Math.floor(i / 3) * 9, true);
    return out;
  }, [building.guias]);
  // Paso del río hacia abajo (sentido de la corriente al zarpar)
  const away = (() => { const [x0, y0] = at([0, 12, -14]); const [x1, y1] = at([420, 40, -14]); return { dx: x1 - x0, dy: y1 - y0 }; })();

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-sb-on-surface-variant md:hidden">Desliza a los lados para ver todo el muelle.</p>
      <div className="-mx-2 overflow-x-auto px-2 pb-1 md:mx-0 md:overflow-visible md:px-0">
        <div className="iso rf dk relative min-w-[760px] md:min-w-0" data-theme={theme} style={{ ["--dk-dx" as string]: `${away.dx}px`, ["--dk-dy" as string]: `${away.dy}px` }}>
          <svg className="iso-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Muelle de Iquitos: contenedor en armado, grúa y naves cargando">
            <g dangerouslySetInnerHTML={{ __html: s.water + s.quay + s.build + crates }} />
            <g className="dk-crane" dangerouslySetInnerHTML={{ __html: s.crane }} />
            {/* Carro de la grúa con un contenedor, yendo y viniendo entre el muelle y el agua */}
            <g className="dk-trolley" dangerouslySetInnerHTML={{ __html: solid(slab({ x: CRANE_X - 28, y: -100, w: 56, d: 12, r: 1 }, 102, 5, 2, 0.3), { tone: "mid" }) + box(CRANE_X, -94, 62) + line(seg([CRANE_X - 4, -94, 102], [CRANE_X - 4, -94, 71]) + seg([CRANE_X + 4, -94, 102], [CRANE_X + 4, -94, 71]), "mid") }} />
            {shown.map((v, i) => (
              <g key={v.nave} className={cn("rf-pick dk-barge", checked.has(v.nave) && "is-on", leaving.has(v.nave) && "is-leaving")} role="button" tabIndex={-1} aria-label={`Nave ${v.nave}`}
                onClick={() => onOpen(v.nave)} dangerouslySetInnerHTML={{ __html: barge(SLOTS[i], v.containers, checked.has(v.nave)) }} />
            ))}
          </svg>
          {/* Contenedor en armado */}
          <div className="rf-tag dk-tag" style={pct([BUILD[0], BUILD[1], 46])}>
            <span className="rf-tag-n">{building.guias ? `${building.units} motos` : "Contenedor vacío"}</span>
            <span className="rf-tag-l">{building.guias ? `${building.guias} guía(s)${building.container ? ` · ${building.container.toUpperCase()}` : ""}${building.nave ? ` → ${building.nave.toUpperCase()}` : ""}` : "Agrega guías abajo"}</span>
          </div>
          {/* Naves cargando */}
          {shown.map((v, i) => (
            <div key={v.nave} className={cn("rf-tag dk-tag dk-nave", checked.has(v.nave) && "is-on", leaving.has(v.nave) && "is-leaving")} style={pct([SLOTS[i], 12, 26])}>
              <button type="button" className="flex flex-col items-center" onClick={() => onOpen(v.nave)} aria-label={`Ver detalle de ${v.nave}`}>
                <span className="rf-tag-n flex items-center gap-1">{v.nave}<Eye className="h-3 w-3 opacity-60" /></span>
                <span className="rf-tag-l">{v.containers} cont. · {v.total.toLocaleString("es-PE")} motos</span>
              </button>
              {v.need > 0 && <span className="rf-tag-late">{v.need} tarde</span>}
              {canSail && (
                <button type="button" onClick={() => onToggle(v.nave)} aria-pressed={checked.has(v.nave)}
                  className={cn("mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", checked.has(v.nave) ? "border-white/70" : "border-sb-outline-variant")}>
                  <Check className="h-3 w-3" /> {checked.has(v.nave) ? "Zarpa" : "Marcar zarpe"}
                </button>
              )}
            </div>
          ))}
          {!naves.length && (
            <div className="rf-tag dk-tag is-empty" style={pct([90, 12, 6])}>
              <span className="rf-tag-n">Sin naves cargando</span>
              <span className="rf-tag-l">Registra un embarque para amarrar una nave</span>
            </div>
          )}
          {extra > 0 && <p className="absolute bottom-2 right-3 rounded-full bg-sb-surface/90 px-3 py-1 text-[11px] text-sb-on-surface-variant shadow-sm">+{extra} naves más en la lista de abajo</p>}
        </div>
      </div>
    </div>
  );
}
