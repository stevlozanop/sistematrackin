"use client";

import * as React from "react";
import * as k from "@/components/iso/iso-kit";
import type { Plan, Point3, Projection } from "@/components/iso/iso-kit";
import { Check, Eye, Minus, Plus, RotateCcw, RotateCw, Scan } from "lucide-react";
import { DEFAULT_VESSEL, type Slot, type Vessel } from "@/lib/stowage";
import { cn } from "@/lib/cn";
import "@/components/iso/iso.css";
import "@/components/figures/route/route.css";
import "./dock.css";

/**
 * Muelle en vivo (kit Anatomy) para «Embarque y zarpe»:
 * - a la izquierda, el contenedor que se está armando; la grúa del muelle trabajando;
 * - amarradas al muelle, las naves que están cargando, con cada contenedor en su lugar real (plano de estiba).
 * La cámara gira 360° (arrastrar o botones) y se acerca (rueda, pellizco o botones).
 * Tocar una chata abre la nave; tocar un contenedor abre su contenido al costado.
 */
export type DockContainer = { id: number; code: string; slot: Slot | null };
export type DockNave = { nave: string; containers: number; total: number; first: string; need: number; list?: DockContainer[]; vessel?: Vessel };

const W = 900, H = 360;
const QUAY: Plan = { x: -330, y: -130, w: 660, d: 95, r: 6 };
const WATER: Plan = { x: -345, y: -35, w: 690, d: 85, r: 0 };
const BUILD: [number, number] = [-262, -84];
const CRANE_X = -165;
const SLOTS = [-70, 40, 150, 260];
const FRONT = QUAY.y + QUAY.d;
const BOUNDS: Point3[] = [...k.boxCorners(QUAY, -14, 0), ...k.boxCorners(WATER, -14, -14), [CRANE_X, -90, 110], [CRANE_X, -132, 110], [CRANE_X, 18, 110]];
const START = { az: 72, el: 38 };

/** Dibujo de toda la escena para una cámara */
function draw(P: Projection) {
  const at = (p: Point3) => k.iso(p, P);
  const solid = (paths: k.SolidPaths, style: k.SolidStyle = {}) => k.solidSvg(paths, style);
  const line = (d: string, tone: k.LineTone = "lo") => k.lineSvg(d, { tone });
  const slab = (pl: Plan, z: number, h: number, steps = 2, bevel = 0) => k.slabOf(pl, z, h, P, steps, bevel);
  const seg = (a: Point3, b: Point3) => k.segment(a, b, P);
  const depth = (p: Point3) => k.depthOf(p, P);

  const water = `<path class="rf-water" d="${slab(WATER, -14, 0).top}"/>`
    + [[-300, 20], [-120, 40], [80, 30], [230, 45], [-220, 38], [10, 44]].map(([x, y]) => k.fadeLineSvg([at([x, y, -14]), at([x + 50, y, -14])], { fade: [12, 12], tone: "faint" })).join("");
  const joints = [-270, -200, -130, -60, 10, 80, 150, 220, 290].map((x) => seg([x, FRONT, -14], [x, FRONT, 0])).join("");
  const quay = solid(slab(QUAY, -14, 14, 3, 1), { tone: "mid", inner: line(joints, "faint") })
    + line(k.planOutline(k.insetPlan(QUAY, 4), 0, P, 3), "faint")
    + [-10, 90, 190, 290].map((x) => solid(k.cylinder(x, FRONT - 6, 2.4, 0, 5, P, 14), { tone: "mid" })).join("")
    + solid(slab({ x: QUAY.x + 8, y: -128, w: QUAY.w - 16, d: 3, r: 0.5 }, 0, 1.2, 2), { tone: "mid" })
    + solid(slab({ x: QUAY.x + 8, y: -66, w: QUAY.w - 16, d: 3, r: 0.5 }, 0, 1.2, 2), { tone: "mid" });
  const [bx, by] = BUILD;
  const pad: Plan = { x: bx - 40, y: by - 24, w: 80, d: 48, r: 2 };
  const frame = [solid(slab({ x: bx - 36, y: by - 14, w: 72, d: 3, r: 0.4 }, 0, 26, 2), { tone: "mid" }), solid(slab({ x: bx + 33, y: by - 14, w: 3, d: 28, r: 0.4 }, 0, 26, 2), { tone: "mid" })];
  const build = line(k.planOutline(pad, 0.2, P, 2), "lo") + (depth([bx - 36, by - 14, 0]) < depth([bx + 33, by, 0]) ? frame.join("") : frame.reverse().join(""));
  const legs = [[CRANE_X - 24, -124], [CRANE_X + 24, -124], [CRANE_X - 24, -68], [CRANE_X + 24, -68]]
    .sort((a, b) => depth([a[0], a[1], 0]) - depth([b[0], b[1], 0]))
    .map(([x, y]) => solid(slab({ x: x - 2.5, y: y - 2.5, w: 5, d: 5, r: 0.4 }, 0, 96, 2, 0.3), { tone: "mid" })).join("");
  const girders = [-24, 24].sort((a, b) => depth([CRANE_X + a, 0, 0]) - depth([CRANE_X + b, 0, 0]))
    .map((dx) => solid(slab({ x: CRANE_X + dx - 2.5, y: -132, w: 5, d: 150, r: 0.4 }, 96, 6, 2, 0.3), { tone: "mid" })).join("");
  const crate = (x: number, y: number, z: number, lit = false, l = 22, w = 10, h = 9) => {
    const c: Plan = { x: x - l / 2, y: y - w / 2, w: l, d: w, r: 0.4 };
    const ribs = [-0.27, 0, 0.27].map((f) => seg([x + l * f, y + w / 2, z], [x + l * f, y + w / 2, z + h])).join("");
    return solid(slab(c, z, h, 2, 0.3), { tone: "hi", lit, inner: line(ribs, "faint") });
  };
  const trolley = solid(slab({ x: CRANE_X - 28, y: -100, w: 56, d: 12, r: 1 }, 102, 5, 2, 0.3), { tone: "mid" }) + crate(CRANE_X, -94, 62)
    + line(seg([CRANE_X - 4, -94, 102], [CRANE_X - 4, -94, 71]) + seg([CRANE_X + 4, -94, 102], [CRANE_X + 4, -94, 71]), "mid");
  // ¿Las chatas quedan delante del muelle (se dibujan después) o detrás?
  const bargesInFront = depth([0, 12, 0]) > depth([0, FRONT, 0]);
  const away = (() => { const [x0, y0] = at([0, 12, -14]); const [x1, y1] = at([420, 40, -14]); return { dx: x1 - x0, dy: y1 - y0 }; })();
  return { water, quay, build, crane: legs + girders, trolley, crate, bargesInFront, away, depth, at, solid, slab, line, seg };
}
type Scene = ReturnType<typeof draw>;

/** Medidas de la chata según el tamaño de la nave (cabe en el espacio de amarre) */
function hullOf(cx: number, v: Vessel) {
  const cl = Math.min(22, 86 / v.bays), cw = Math.min(11, 28 / v.rows), ch = 9;
  const len = v.bays * cl, wid = v.rows * cw;
  const y = 12;
  return { cl, cw, ch, hull: { x: cx - len / 2 - 6, y: y - wid / 2 - 5, w: len + 12, d: wid + 10, r: 7 } as Plan, x0: cx - len / 2, y0: y - wid / 2 };
}

export function DockScene({ naves, checked, leaving, building, canSail, onOpen, onToggle, onPickContainer, selectedContainer }: {
  naves: DockNave[]; checked: Set<string>; leaving: Set<string>; building: { guias: number; units: number; container: string; nave: string };
  canSail: boolean; onOpen: (nave: string) => void; onToggle: (nave: string) => void;
  onPickContainer?: (c: { id: number; code: string; nave: string }) => void; selectedContainer?: number | null;
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

  // Cámara: giro (azimut), inclinación y zoom con su punto de mira
  const [cam, setCam] = React.useState({ ...START, zoom: 1, fx: W / 2, fy: H / 2 });
  const P = React.useMemo(() => k.fitProjection(BOUNDS, W, H, { pad: 8, headroom: 26, azimuth: cam.az, elevation: cam.el }), [cam.az, cam.el]);
  const s: Scene = React.useMemo(() => draw(P), [P]);
  // Celular: el muelle se ve más alto (se recorta a los lados y se gira para ver el resto)
  const box = React.useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = React.useState(0);
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = boxW > 0 && boxW < 640;
  const tallH = 300;
  const vw = (narrow ? Math.min(W, H * (boxW / tallH)) : W) / cam.zoom, vh = H / cam.zoom;
  const vx = Math.min(Math.max(cam.fx - vw / 2, 0), W - vw), vy = Math.min(Math.max(cam.fy - vh / 2, 0), H - vh);
  const pct = (p: Point3) => { const [sx, sy] = s.at(p); return { left: `${((sx - vx) / vw) * 100}%`, top: `${((sy - vy) / vh) * 100}%` }; };

  const shown = naves.slice(0, SLOTS.length);
  const extra = naves.length - shown.length;
  const crates = React.useMemo(() => {
    let out = "";
    const [bx, by] = BUILD;
    for (let i = 0; i < Math.min(building.guias, 9); i++) out += s.crate(bx - 22 + (i % 3) * 22, by - 2, Math.floor(i / 3) * 9, true);
    return out;
  }, [building.guias, s]);

  // Chatas: casco y remolcador (dibujos), y cada contenedor en su lugar (pieza aparte para poder tocarlo)
  const barges = shown.map((v, i) => {
    const vessel = v.vessel ?? DEFAULT_VESSEL;
    const g = hullOf(SLOTS[i], vessel);
    const tug: Plan = { x: g.hull.x - 24, y: 12 - 9, w: 22, d: 18, r: 6 };
    const hullSvg = s.solid(s.slab(g.hull, -14, 10, 6, 0.6), { tone: "mid", inner: s.line(k.sideSeam(g.hull, -10, P, 6), "faint") });
    const tugSvg = s.solid(s.slab(tug, -14, 8, 5, 0.4), { tone: "mid" }) + s.solid(s.slab({ x: tug.x + 6, y: tug.y + 4, w: 10, d: 10, r: 1 }, -6, 8, 2, 0.3), { tone: "hi" });
    const boxes = (v.list ?? []).filter((c) => c.slot && c.slot.bay <= vessel.bays && c.slot.row <= vessel.rows).map((c) => {
      const cx = g.x0 + (c.slot!.bay - 0.5) * g.cl, cy = g.y0 + (c.slot!.row - 0.5) * g.cw, cz = -4 + (c.slot!.tier - 1) * g.ch;
      return { c, cx, cy, cz, key: s.depth([cx, cy, 0]) * 10 + c.slot!.tier };
    }).sort((a, b) => a.key - b.key);
    const loose = (v.list ?? []).filter((c) => !c.slot).length;
    const tugFirst = s.depth([tug.x + 11, 12, 0]) < s.depth([SLOTS[i], 12, 0]);
    return { v, g, hullSvg, tugSvg, tugFirst, boxes, loose, key: s.depth([SLOTS[i], 12, 0]) };
  }).sort((a, b) => a.key - b.key);

  // Arrastrar para girar · rueda / pellizco para acercar
  const ptrs = React.useRef(new Map<number, { x: number; y: number }>());
  const drag = React.useRef({ moved: 0, pinch: 0 });
  const toLocal = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect();
    return { x: vx + ((clientX - r.left) / r.width) * vw, y: vy + ((clientY - r.top) / r.height) * vh };
  };
  const zoomAt = React.useCallback((factor: number, fx?: number, fy?: number) => setCam((c) => {
    const zoom = Math.min(4, Math.max(1, c.zoom * factor));
    return { ...c, zoom, fx: fx ?? c.fx, fy: fy ?? c.fy };
  }), []);
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setCam((c) => {
        const cvw = (r.width < 640 ? Math.min(W, H * (r.width / r.height)) : W) / c.zoom, cvh = H / c.zoom;
        const cvx = Math.min(Math.max(c.fx - cvw / 2, 0), W - cvw), cvy = Math.min(Math.max(c.fy - cvh / 2, 0), H - cvh);
        const fx = cvx + ((e.clientX - r.left) / r.width) * cvw, fy = cvy + ((e.clientY - r.top) / r.height) * cvh;
        const zoom = Math.min(4, Math.max(1, c.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        return { ...c, zoom, fx, fy };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const onDown = (e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current.moved = 0;
    if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; drag.current.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (drag.current.pinch) { const m = toLocal((a.x + b.x) / 2, (a.y + b.y) / 2); zoomAt(d / drag.current.pinch, m.x, m.y); }
      drag.current.pinch = d; drag.current.moved += 10;
      return;
    }
    drag.current.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.current.moved < 4) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    // Con el mouse también se inclina; en celular el gesto vertical sigue moviendo la página
    setCam((c) => ({ ...c, az: (c.az - dx * 0.45 + 360) % 360, el: e.pointerType === "mouse" ? Math.min(70, Math.max(14, c.el + dy * 0.25)) : c.el }));
  };
  const onUp = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); if (ptrs.current.size < 2) drag.current.pinch = 0; };
  // Si fue un arrastre, no cuenta como clic
  const onClickCapture = (e: React.MouseEvent) => { if (drag.current.moved >= 4) { e.stopPropagation(); e.preventDefault(); drag.current.moved = 0; } };

  const bargeSvg = (b: (typeof barges)[number]) => (b.tugFirst ? b.tugSvg + b.hullSvg : b.hullSvg + b.tugSvg);
  const bargesSvg = barges.map((b) => (
    <g key={b.v.nave} className={cn("dk-barge", checked.has(b.v.nave) && "is-on", leaving.has(b.v.nave) && "is-leaving")}>
      <g className="rf-pick" role="button" tabIndex={-1} aria-label={`Nave ${b.v.nave}`} onClick={() => onOpen(b.v.nave)} dangerouslySetInnerHTML={{ __html: bargeSvg(b) }} />
      {b.boxes.map(({ c, cx, cy, cz }) => (
        <g key={`${c.id}-${c.slot!.bay}${c.slot!.row}${c.slot!.tier}`} className={cn("rf-pick dk-box", selectedContainer === c.id && "is-on")} role="button" tabIndex={-1} aria-label={`Contenedor ${c.code}`}
          onClick={(e) => { e.stopPropagation(); (onPickContainer ?? (() => onOpen(b.v.nave)))({ id: c.id, code: c.code, nave: b.v.nave }); }}
          dangerouslySetInnerHTML={{ __html: s.crate(cx, cy, cz, selectedContainer === c.id || checked.has(b.v.nave), b.g.cl - 1.5, b.g.cw - 1.5, b.g.ch - 0.6) }} />
      ))}
    </g>
  ));

  return (
    <div className="flex flex-col gap-2">
      <div ref={box} className="iso rf dk relative overflow-hidden rounded-xl select-none" data-theme={theme}
        style={{ ["--dk-dx" as string]: `${s.away.dx}px`, ["--dk-dy" as string]: `${s.away.dy}px`, touchAction: "pan-y", height: narrow ? tallH : undefined }}
        onPointerDownCapture={() => { drag.current.moved = 0; }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClickCapture={onClickCapture}>
        <svg className="iso-svg" style={narrow ? { width: "100%", height: "100%" } : undefined} viewBox={`${vx} ${vy} ${vw} ${vh}`} role="img" aria-label="Muelle de Iquitos en 3D: contenedor en armado, grúa y naves cargando">
          <g dangerouslySetInnerHTML={{ __html: s.water }} />
          {!s.bargesInFront && bargesSvg}
          <g dangerouslySetInnerHTML={{ __html: s.quay + s.build + crates }} />
          <g className="dk-crane" dangerouslySetInnerHTML={{ __html: s.crane }} />
          <g className="dk-trolley" dangerouslySetInnerHTML={{ __html: s.trolley }} />
          {s.bargesInFront && bargesSvg}
        </svg>

        {/* Contenedor en armado */}
        <div className="rf-tag dk-tag" style={pct([BUILD[0], BUILD[1], 46])}>
          <span className="rf-tag-n">{building.guias ? `${building.units} motos` : "Contenedor vacío"}</span>
          <span className="rf-tag-l">{building.guias ? `${building.guias} guía(s)${building.container ? ` · ${building.container.toUpperCase()}` : ""}${building.nave ? ` → ${building.nave.toUpperCase()}` : ""}` : "Agrega guías abajo"}</span>
        </div>
        {/* Naves cargando */}
        {shown.map((v, i) => (
          <div key={v.nave} className={cn("rf-tag dk-tag dk-nave", checked.has(v.nave) && "is-on", leaving.has(v.nave) && "is-leaving")} style={pct([SLOTS[i], 12, 34])}>
            <button type="button" className="flex flex-col items-center" onClick={() => onOpen(v.nave)} aria-label={`Ver detalle de ${v.nave}`}>
              <span className="rf-tag-n flex items-center gap-1">{v.nave}<Eye className="h-3 w-3 opacity-60" /></span>
              <span className="rf-tag-l">{v.containers} cont. · {v.total.toLocaleString("es-PE")} motos{(v.list ?? []).some((c) => !c.slot) ? ` · ${(v.list ?? []).filter((c) => !c.slot).length} sin ubicar` : ""}</span>
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
        {/* Código de los contenedores cuando se acerca la cámara */}
        {cam.zoom >= 1.8 && barges.flatMap((b) => b.boxes.map(({ c, cx, cy, cz }) => (
          <button key={`t${c.id}`} type="button" className={cn("dk-code", selectedContainer === c.id && "is-on")} style={pct([cx, cy, cz + b.g.ch])}
            onClick={() => (onPickContainer ?? (() => onOpen(b.v.nave)))({ id: c.id, code: c.code, nave: b.v.nave })}>{c.code}</button>
        )))}
        {!naves.length && (
          <div className="rf-tag dk-tag is-empty" style={pct([90, 12, 6])}>
            <span className="rf-tag-n">Sin naves cargando</span>
            <span className="rf-tag-l">Registra un embarque para amarrar una nave</span>
          </div>
        )}
        {extra > 0 && <p className="absolute bottom-2 left-3 rounded-full bg-sb-surface/90 px-3 py-1 text-[11px] text-sb-on-surface-variant shadow-sm">+{extra} naves más en la lista de abajo</p>}

        {/* Controles de la cámara */}
        <div className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-full border border-sb-outline-variant/60 bg-sb-surface/95 p-1 shadow-sm" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" aria-label="Girar a la izquierda" onClick={() => setCam((c) => ({ ...c, az: (c.az + 30) % 360 }))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-sb-surface-container"><RotateCcw className="h-4 w-4" /></button>
          <button type="button" aria-label="Girar a la derecha" onClick={() => setCam((c) => ({ ...c, az: (c.az + 330) % 360 }))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-sb-surface-container"><RotateCw className="h-4 w-4" /></button>
          <span className="mx-0.5 h-5 w-px bg-sb-outline-variant/60" />
          <button type="button" aria-label="Alejar" onClick={() => zoomAt(1 / 1.3)} disabled={cam.zoom <= 1} className="grid h-8 w-8 place-items-center rounded-full hover:bg-sb-surface-container disabled:opacity-30"><Minus className="h-4 w-4" /></button>
          <span className="w-9 text-center text-[10px] font-semibold tabular-nums text-sb-on-surface-variant">{Math.round(cam.zoom * 100)}%</span>
          <button type="button" aria-label="Acercar" onClick={() => zoomAt(1.3)} disabled={cam.zoom >= 4} className="grid h-8 w-8 place-items-center rounded-full hover:bg-sb-surface-container disabled:opacity-30"><Plus className="h-4 w-4" /></button>
          <span className="mx-0.5 h-5 w-px bg-sb-outline-variant/60" />
          <button type="button" aria-label="Vista inicial" title="Vista inicial" onClick={() => setCam({ ...START, zoom: 1, fx: W / 2, fy: H / 2 })} className="grid h-8 w-8 place-items-center rounded-full hover:bg-sb-surface-container"><Scan className="h-4 w-4" /></button>
        </div>
      </div>
      <p className="text-[11px] text-sb-on-surface-variant">
        Arrastra para girar el muelle 360° · rueda del mouse o pellizca para acercar · toca un contenedor para ver lo que lleva.
      </p>
    </div>
  );
}
