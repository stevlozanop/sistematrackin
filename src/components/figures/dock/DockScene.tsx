"use client";

import * as React from "react";
import * as k from "@/components/iso/iso-kit";
import type { Plan, Point3, Projection } from "@/components/iso/iso-kit";
import { Check, Eye, Hand, LocateFixed, Maximize2, Minimize2, Minus, Plus, Rotate3d, RotateCcw, RotateCw } from "lucide-react";
import { DEFAULT_VESSEL, boxColor, type Slot, type Vessel } from "@/lib/stowage";
import { cn } from "@/lib/cn";
import { unitsText } from "@/lib/hsp";
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
export type DockNave = { nave: string; containers: number; total: number; w2?: number; w3?: number; first: string; need: number; list?: DockContainer[]; vessel?: Vessel };

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

/**
 * Medidas de la nave según su tipo y tamaño (cabe en su espacio de amarre; la proa mira río abajo, a +x):
 * - chata: barcaza plana con los contenedores a lo largo y el empujador detrás;
 * - motonave: casco de barco con las cubiertas de pasajeros atrás y los pocos contenedores en la cubierta de proa.
 */
function hullOf(cx: number, v: Vessel) {
  const y = 12;
  if (v.kind === "motonave") {
    const cl = Math.min(19, 40 / v.bays), cw = Math.min(10.5, 26 / v.rows), ch = 9;
    const len = v.bays * cl, wid = v.rows * cw, cabin = 44, total = cabin + len + 18;
    const hx = cx - total / 2, d = Math.max(wid + 10, 30);
    return { kind: "motonave" as const, cl, cw, ch, hull: { x: hx, y: y - d / 2, w: total, d, r: 12 } as Plan, x0: hx + cabin + 6, y0: y - wid / 2, cabinX: hx + 4, cabinW: cabin - 4, d };
  }
  const cl = Math.min(22, 86 / v.bays), cw = Math.min(11, 28 / v.rows), ch = 9;
  const len = v.bays * cl, wid = v.rows * cw;
  return { kind: "chata" as const, cl, cw, ch, hull: { x: cx - len / 2 - 6, y: y - wid / 2 - 5, w: len + 12, d: wid + 10, r: 7 } as Plan, x0: cx - len / 2, y0: y - wid / 2, cabinX: 0, cabinW: 0, d: wid + 10 };
}

export function DockScene({ naves, checked, leaving, building, canSail, onOpen, onToggle, onPickContainer, selectedContainer }: {
  naves: DockNave[]; checked: Set<string>; leaving: Set<string>; building: { guias: number; units: number; w2?: number; w3?: number; container: string; nave: string };
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

  // Cámara: giro (azimut), inclinación, zoom y el punto del muelle que se mira (null = el centro).
  // El punto es del suelo, no de la pantalla: así al girar o acercar la cámara se queda sobre el mismo objeto.
  const [cam, setCam] = React.useState<{ az: number; el: number; zoom: number; t: { x: number; y: number } | null }>({ ...START, zoom: 1, t: null });
  // Arrastrar: mover la vista (por defecto) o girarla
  const [mode, setMode] = React.useState<"move" | "turn">("move");
  const P = React.useMemo(() => k.fitProjection(BOUNDS, W, H, { pad: 8, headroom: 26, azimuth: cam.az, elevation: cam.el }), [cam.az, cam.el]);
  const s: Scene = React.useMemo(() => draw(P), [P]);
  // Celular: el muelle se ve más alto (se recorta a los lados y se gira para ver el resto)
  const box = React.useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = React.useState(0);
  const [boxH, setBoxH] = React.useState(0);
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { setBoxW(e.contentRect.width); setBoxH(e.contentRect.height); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Pantalla completa: la del navegador si se puede; si no (iPhone), el muelle ocupa toda la ventana
  const [full, setFull] = React.useState<"off" | "native" | "window">("off");
  const toggleFull = React.useCallback(async () => {
    const el = box.current;
    if (!el) return;
    if (full === "native") { await document.exitFullscreen?.().catch(() => {}); return; }
    if (full === "window") { setFull("off"); return; }
    try {
      if (!el.requestFullscreen) throw new Error("sin pantalla completa");
      await el.requestFullscreen({ navigationUI: "hide" });
      setFull("native");
      // En celular, mejor acostado (si el navegador lo permite)
      (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.("landscape").catch(() => {});
    } catch { setFull("window"); }
  }, [full]);
  React.useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFull((f) => (f === "native" ? "off" : f)); };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  React.useEffect(() => {
    if (full !== "window") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull("off"); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [full]);
  const isFull = full !== "off";
  const leaveFull = React.useCallback(() => {
    if (full === "native") document.exitFullscreen?.().catch(() => {});
    if (full !== "off") setFull("off");
  }, [full]);
  const openNave = (n: string) => { leaveFull(); onOpen(n); };
  const pickBox = (c: { id: number; code: string; nave: string }) => { leaveFull(); (onPickContainer ?? ((x) => onOpen(x.nave)))(c); };
  const narrow = boxW > 0 && boxW < 640;
  // Celular: etiquetas y controles más chicos, sin encimarse
  const compact = boxW > 0 && boxW < 520;
  const tallH = 300;
  // Lo que se ve del muelle según la forma del cuadro (en pantalla completa, la de la pantalla)
  const aspect = isFull && boxW && boxH ? boxW / boxH : narrow ? boxW / tallH : W / H;
  const vw = Math.min(W, H * aspect) / cam.zoom, vh = Math.min(H, W / aspect) / cam.zoom;
  const [fx, fy] = cam.t ? s.at([cam.t.x, cam.t.y, 0]) : [W / 2, H / 2];
  const vx = Math.min(Math.max(fx - vw / 2, 0), W - vw), vy = Math.min(Math.max(fy - vh / 2, 0), H - vh);
  // Punto de la pantalla → punto del suelo (la proyección es lineal: se resuelve con dos ejes)
  const unproject = React.useCallback((sx: number, sy: number) => {
    const [ox, oy] = s.at([0, 0, 0]), [ax, ay] = s.at([1, 0, 0]), [bx, by] = s.at([0, 1, 0]);
    const ux = ax - ox, uy = ay - oy, wx = bx - ox, wy = by - oy, det = ux * wy - uy * wx || 1;
    const dx = sx - ox, dy = sy - oy;
    return { x: (dx * wy - dy * wx) / det, y: (ux * dy - uy * dx) / det };
  }, [s]);
  // Lo que se ve ahora (para los gestos, que no se vuelven a crear en cada cuadro)
  const view = React.useRef({ vx, vy, vw, vh, unproject });
  React.useLayoutEffect(() => { view.current = { vx, vy, vw, vh, unproject }; });
  const pct = (p: Point3) => { const [sx, sy] = s.at(p); return { left: `${((sx - vx) / vw) * 100}%`, top: `${((sy - vy) / vh) * 100}%` }; };
  // Etiquetas siempre dentro del cuadro (en celular el muelle se ve recortado y quedaban cortadas en el borde)
  const posIn = (p: Point3) => {
    const [sx, sy] = s.at(p);
    const x = ((sx - vx) / vw) * 100, y = ((sy - vy) / vh) * 100;
    const m = compact ? 25 : narrow ? 24 : 12;
    return { x: Math.min(100 - m, Math.max(m, x)), y: Math.min(80, Math.max(narrow ? 30 : 22, y)) };
  };
  const pctIn = (p: Point3) => { const { x, y } = posIn(p); return { left: `${x}%`, top: `${y}%` }; };

  const shown = naves.slice(0, SLOTS.length);
  // Etiquetas de las naves que no se tapen entre sí: si dos caen muy cerca, la siguiente sube
  const navePos = (() => {
    const w = compact ? 34 : narrow ? 30 : 16, h = compact ? 13 : 16;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < shown.length; i++) {
      const q = posIn([SLOTS[i], 12, 34]);
      for (let guard = 0; guard < 6; guard++) {
        const hit = out.find((o) => Math.abs(o.x - q.x) < w && Math.abs(o.y - q.y) < h);
        if (!hit) break;
        q.y = hit.y - h;
        if (q.y < 14) { q.y = hit.y + h; }
      }
      out.push(q);
    }
    return out;
  })();
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
    let hullSvg: string, tugSvg = "", tugAt = 0, cabinSvg = "", cabinFront = false;
    if (g.kind === "motonave") {
      // Casco alto, cubiertas de pasajeros (cada una más chica), puente de mando, mástil y bandera
      const cy = 12, deck = (dx: number, w: number, z: number, h: number, inset: number) => s.solid(s.slab({ x: g.cabinX + dx, y: cy - g.d / 2 + inset, w, d: g.d - inset * 2, r: 2 }, z, h, 3, 0.4), { tone: "hi" });
      const windows = [0.15, 0.35, 0.55, 0.75].map((f) => s.seg([g.cabinX + g.cabinW * f, cy + g.d / 2 - 2, 1], [g.cabinX + g.cabinW * f + 5, cy + g.d / 2 - 2, 1])).join("");
      hullSvg = s.solid(s.slab(g.hull, -14, 12, 10, 0.6), { tone: "mid", inner: s.line(k.sideSeam(g.hull, -9, P, 10), "faint") });
      // Si la cámara mira desde popa, las cubiertas tapan los contenedores (se dibujan después)
      cabinFront = s.depth([g.cabinX + g.cabinW / 2, cy, 0]) > s.depth([g.x0 + 10, cy, 0]);
      cabinSvg = deck(0, g.cabinW, -2, 9, 2) + s.line(windows, "faint") + deck(4, g.cabinW - 8, 7, 8, 4) + deck(g.cabinW - 18, 14, 15, 7, 6)
        + s.line(s.seg([g.cabinX + g.cabinW - 11, cy, 22], [g.cabinX + g.cabinW - 11, cy, 36]), "mid")
        + s.solid(s.slab({ x: g.cabinX + g.cabinW - 11, y: cy - 0.5, w: 7, d: 1, r: 0 }, 31, 4, 1), { tone: "mid" });
    } else {
      // Chata: barcaza plana y su empujador detrás (con su cabina)
      const tug: Plan = { x: g.hull.x - 26, y: 12 - 10, w: 24, d: 20, r: 6 };
      hullSvg = s.solid(s.slab(g.hull, -14, 10, 6, 0.6), { tone: "mid", inner: s.line(k.sideSeam(g.hull, -10, P, 6), "faint") });
      tugSvg = s.solid(s.slab(tug, -14, 9, 5, 0.4), { tone: "mid" }) + s.solid(s.slab({ x: tug.x + 4, y: tug.y + 4, w: 12, d: 12, r: 1 }, -5, 8, 2, 0.3), { tone: "hi" })
        + s.solid(s.slab({ x: tug.x + 6, y: tug.y + 6, w: 8, d: 8, r: 1 }, 3, 5, 2, 0.3), { tone: "hi" });
      tugAt = tug.x + 12;
    }
    const boxes = (v.list ?? []).filter((c) => c.slot && c.slot.bay <= vessel.bays && c.slot.row <= vessel.rows).map((c) => {
      const cx = g.x0 + (c.slot!.bay - 0.5) * g.cl, cy = g.y0 + (c.slot!.row - 0.5) * g.cw, cz = -4 + (c.slot!.tier - 1) * g.ch;
      return { c, cx, cy, cz, key: s.depth([cx, cy, 0]) * 10 + c.slot!.tier };
    }).sort((a, b) => a.key - b.key);
    const loose = (v.list ?? []).filter((c) => !c.slot).length;
    const tugFirst = !tugSvg || s.depth([tugAt, 12, 0]) < s.depth([SLOTS[i], 12, 0]);
    return { v, g, hullSvg, tugSvg, tugFirst, cabinSvg, cabinFront, boxes, loose, key: s.depth([SLOTS[i], 12, 0]) };
  }).sort((a, b) => a.key - b.key);

  // Arrastrar para girar · rueda / pellizco para acercar
  const ptrs = React.useRef(new Map<number, { x: number; y: number }>());
  const drag = React.useRef({ moved: 0, pinch: 0, alt: false });
  const toLocal = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect(), v = view.current;
    return { x: v.vx + ((clientX - r.left) / r.width) * v.vw, y: v.vy + ((clientY - r.top) / r.height) * v.vh };
  };
  /** Acerca o aleja dejando quieto el punto que se señala (cursor, dedos o el centro con los botones) */
  const zoomAt = React.useCallback((factor: number, px?: number, py?: number) => setCam((c) => {
    const { vx: x0, vy: y0, vw: w0, vh: h0, unproject: un } = view.current;
    const zoom = Math.min(4, Math.max(1, c.zoom * factor));
    if (zoom === c.zoom) return c;
    const r = c.zoom / zoom, ax = px ?? x0 + w0 / 2, ay = py ?? y0 + h0 / 2;
    const nx = ax - (ax - x0) * r, ny = ay - (ay - y0) * r;
    return { ...c, zoom, t: zoom === 1 ? null : un(nx + (w0 * r) / 2, ny + (h0 * r) / 2) };
  }), []);
  /** Mueve la vista: dx, dy en píxeles de la pantalla */
  const panBy = React.useCallback((dx: number, dy: number) => setCam((c) => {
    const el = box.current; if (!el) return c;
    const { vx: x0, vy: y0, vw: w0, vh: h0, unproject: un } = view.current;
    const r = el.getBoundingClientRect();
    return { ...c, t: un(x0 + w0 / 2 - (dx / r.width) * w0, y0 + h0 / 2 - (dy / r.height) * h0) };
  }), []);
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      // Touchpad: dos dedos de lado o Shift + rueda mueven la vista; la rueda acerca hacia el cursor
      if (!e.ctrlKey && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) { panBy(-(e.deltaX || e.deltaY), 0); return; }
      const p = toLocal(e.clientX, e.clientY);
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoomAt, panBy]);
  const onDown = (e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current.moved = 0;
    // Clic derecho o Shift: hace lo contrario del modo elegido
    drag.current.alt = e.button === 2 || e.shiftKey;
    if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; drag.current.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) {
      // Dos dedos: pellizcar acerca hacia el medio de los dedos y arrastrarlos mueve la vista
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (drag.current.pinch) { const m = toLocal((a.x + b.x) / 2, (a.y + b.y) / 2); zoomAt(d / drag.current.pinch, m.x, m.y); }
      panBy(dx / 2, dy / 2);
      drag.current.pinch = d; drag.current.moved += 10;
      return;
    }
    drag.current.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.current.moved < 4) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const touch = e.pointerType !== "mouse";
    if ((mode === "move") !== drag.current.alt) {
      // En celular el gesto vertical sigue moviendo la página: se mueve la vista solo de lado
      panBy(dx, touch ? 0 : dy);
      return;
    }
    // Girar (con el mouse también se inclina)
    setCam((c) => ({ ...c, az: (c.az - dx * 0.45 + 360) % 360, el: touch ? c.el : Math.min(70, Math.max(14, c.el + dy * 0.25)) }));
  };
  const onUp = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); if (ptrs.current.size < 2) drag.current.pinch = 0; };
  // Si fue un arrastre, no cuenta como clic
  const onClickCapture = (e: React.MouseEvent) => { if (drag.current.moved >= 4) { e.stopPropagation(); e.preventDefault(); drag.current.moved = 0; } };

  const bargeSvg = (b: (typeof barges)[number]) => (b.tugFirst ? b.tugSvg + b.hullSvg : b.hullSvg + b.tugSvg);
  const bargesSvg = barges.map((b) => (
    <g key={b.v.nave} className={cn("dk-barge", checked.has(b.v.nave) && "is-on", leaving.has(b.v.nave) && "is-leaving")}>
      <g className="rf-pick" role="button" tabIndex={-1} aria-label={`Nave ${b.v.nave}`} onClick={() => openNave(b.v.nave)} dangerouslySetInnerHTML={{ __html: bargeSvg(b) + (b.cabinFront ? "" : b.cabinSvg) }} />
      {b.boxes.map(({ c, cx, cy, cz }) => (
        <g key={`${c.id}-${c.slot!.bay}${c.slot!.row}${c.slot!.tier}`} className={cn("rf-pick dk-box", selectedContainer === c.id && "is-on")} role="button" tabIndex={-1} aria-label={`Contenedor ${c.code}`}
          onClick={(e) => { e.stopPropagation(); pickBox({ id: c.id, code: c.code, nave: b.v.nave }); }}
          style={{ ["--box" as string]: boxColor(c.code) }}
          dangerouslySetInnerHTML={{ __html: s.crate(cx, cy, cz, selectedContainer === c.id, b.g.cl - 1.5, b.g.cw - 1.5, b.g.ch - 0.6) }} />
      ))}
      {b.cabinFront && <g className="rf-pick" onClick={() => openNave(b.v.nave)} dangerouslySetInnerHTML={{ __html: b.cabinSvg }} />}
    </g>
  ));

  return (
    <div className="flex flex-col gap-2">
      <div ref={box} className={cn("iso rf dk relative overflow-hidden rounded-xl select-none", mode === "move" ? "cursor-grab active:cursor-grabbing" : "cursor-ew-resize",
          isFull && "!rounded-none", full === "native" && "h-full w-full", full === "window" && "fixed inset-0 z-[90] h-dvh w-screen")} data-theme={theme}
        style={{ ["--dk-dx" as string]: `${s.away.dx}px`, ["--dk-dy" as string]: `${s.away.dy}px`, touchAction: isFull ? "none" : "pan-y", height: isFull ? undefined : narrow ? tallH : undefined, ...(isFull ? { background: "var(--sb-surface-container-low, #f4f6f2)" } : {}) }}
        onPointerDownCapture={() => { drag.current.moved = 0; }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClickCapture={onClickCapture}
        onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={(e) => { const p = toLocal(e.clientX, e.clientY); zoomAt(cam.zoom >= 3.5 ? 1 / 4 : 1.8, p.x, p.y); }}>
        <svg className="iso-svg" style={narrow || isFull ? { width: "100%", height: "100%" } : undefined} viewBox={`${vx} ${vy} ${vw} ${vh}`} role="img" aria-label="Muelle de Iquitos en 3D: contenedor en armado, grúa y naves cargando">
          <g dangerouslySetInnerHTML={{ __html: s.water }} />
          {!s.bargesInFront && bargesSvg}
          <g dangerouslySetInnerHTML={{ __html: s.quay + s.build + crates }} />
          <g className="dk-crane" dangerouslySetInnerHTML={{ __html: s.crane }} />
          <g className="dk-trolley" dangerouslySetInnerHTML={{ __html: s.trolley }} />
          {s.bargesInFront && bargesSvg}
        </svg>

        {/* Contenedor en armado */}
        <div className="rf-tag dk-tag" style={pctIn([BUILD[0], BUILD[1], 46])}>
          <span className="rf-tag-n">{building.guias ? (building.w2 !== undefined ? unitsText(building.w2, building.w3 ?? 0) : `${building.units} unidades`) : "Contenedor vacío"}</span>
          <span className="rf-tag-l">{building.guias ? `${building.guias} guía(s)${building.container ? ` · ${building.container.toUpperCase()}` : ""}${building.nave ? ` → ${building.nave.toUpperCase()}` : ""}` : "Agrega guías abajo"}</span>
        </div>
        {/* Naves cargando */}
        {shown.map((v, i) => (
          <div key={v.nave} className={cn("rf-tag dk-tag dk-nave", compact && "dk-tag-sm", checked.has(v.nave) && "is-on", leaving.has(v.nave) && "is-leaving")}
            style={{ left: `${navePos[i].x}%`, top: `${navePos[i].y}%`, zIndex: 2 + i }}>
            <button type="button" className="flex flex-col items-center" onClick={() => openNave(v.nave)} aria-label={`Ver detalle de ${v.nave}`}>
              <span className="rf-tag-n flex items-center gap-1">{v.nave}<Eye className="h-3 w-3 opacity-60" /></span>
              {/* En celular, al acercar se quita el detalle: el nombre basta (el detalle se ve al tocarla) */}
              {!(compact && cam.zoom > 1.3) && <span className="rf-tag-l">{v.containers} cont. · {v.w2 !== undefined ? unitsText(v.w2, v.w3 ?? 0) : `${v.total.toLocaleString("es-PE")} unidades`}{(v.list ?? []).some((c) => !c.slot) ? ` · ${(v.list ?? []).filter((c) => !c.slot).length} sin ubicar` : ""}</span>}
            </button>
            {v.need > 0 && <span className="rf-tag-late">{v.need} tarde</span>}
            {/* En celular el zarpe se marca en la lista de abajo (aquí solo se muestra si ya está marcada) */}
            {canSail && (!compact || checked.has(v.nave)) && (
              <button type="button" onClick={() => onToggle(v.nave)} aria-pressed={checked.has(v.nave)}
                className={cn("mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", checked.has(v.nave) ? "border-white/70" : "border-sb-outline-variant")}>
                <Check className="h-3 w-3" /> {checked.has(v.nave) ? "Zarpa" : "Marcar zarpe"}
              </button>
            )}
          </div>
        ))}
        {/* Código de los contenedores cuando se acerca la cámara */}
        {cam.zoom >= (compact ? 2.6 : 1.8) && barges.flatMap((b) => b.boxes.map(({ c, cx, cy, cz }) => (
          <button key={`t${c.id}`} type="button" className={cn("dk-code", selectedContainer === c.id && "is-on")} style={pct([cx, cy, cz + b.g.ch])}
            onClick={() => pickBox({ id: c.id, code: c.code, nave: b.v.nave })}>{c.code}</button>
        )))}
        {!naves.length && (
          <div className="rf-tag dk-tag is-empty" style={pctIn([90, 12, 6])}>
            <span className="rf-tag-n">Sin naves cargando</span>
            <span className="rf-tag-l">Registra un embarque para amarrar una nave</span>
          </div>
        )}
        {extra > 0 && <p className="absolute bottom-2 left-3 rounded-full bg-sb-surface/90 px-3 py-1 text-[11px] text-sb-on-surface-variant shadow-sm">+{extra} naves más en la lista de abajo</p>}

        {isFull && (
          <p className="absolute left-3 top-3 rounded-full bg-sb-surface/95 px-3 py-1.5 text-[12px] font-semibold shadow-sm" style={{ marginTop: "env(safe-area-inset-top)" }}>
            Muelle de Iquitos <span className="font-normal text-sb-on-surface-variant">· Esc o ⤡ para salir</span>
          </p>
        )}
        {/* Controles de la cámara */}
        <div className={cn("sb-glass absolute bottom-2 right-2 flex max-w-[calc(100%-1rem)] items-center gap-0.5 overflow-x-auto rounded-full border border-sb-outline-variant/60 bg-sb-surface/95 p-1 shadow-sm [scrollbar-width:none]", compact && "[&_button]:!h-8 [&_button]:!w-8")} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <div className="flex rounded-full bg-sb-surface-container p-0.5" role="group" aria-label="Al arrastrar">
            <button type="button" aria-pressed={mode === "move"} title="Arrastrar mueve la vista" onClick={() => setMode("move")}
              className={cn("grid h-7 w-7 place-items-center rounded-full", mode === "move" ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant")}><Hand className="h-4 w-4" /><span className="sr-only">Mover</span></button>
            <button type="button" aria-pressed={mode === "turn"} title="Arrastrar gira el muelle" onClick={() => setMode("turn")}
              className={cn("grid h-7 w-7 place-items-center rounded-full", mode === "turn" ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant")}><Rotate3d className="h-4 w-4" /><span className="sr-only">Girar</span></button>
          </div>
          {!compact && <><span className="mx-0.5 h-5 w-px bg-sb-outline-variant/60" />
          <button type="button" aria-label="Girar a la izquierda" onClick={() => setCam((c) => ({ ...c, az: (c.az + 30) % 360 }))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-sb-surface-container"><RotateCcw className="h-4 w-4" /></button>
          <button type="button" aria-label="Girar a la derecha" onClick={() => setCam((c) => ({ ...c, az: (c.az + 330) % 360 }))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-sb-surface-container"><RotateCw className="h-4 w-4" /></button></>}
          <span className="mx-0.5 h-5 w-px bg-sb-outline-variant/60" />
          <button type="button" aria-label="Alejar" onClick={() => zoomAt(1 / 1.3)} disabled={cam.zoom <= 1} className="grid h-8 w-8 place-items-center rounded-full hover:bg-sb-surface-container disabled:opacity-30"><Minus className="h-4 w-4" /></button>
          {!compact && <span className="w-9 text-center text-[10px] font-semibold tabular-nums text-sb-on-surface-variant">{Math.round(cam.zoom * 100)}%</span>}
          <button type="button" aria-label="Acercar" onClick={() => zoomAt(1.3)} disabled={cam.zoom >= 4} className="grid h-8 w-8 place-items-center rounded-full hover:bg-sb-surface-container disabled:opacity-30"><Plus className="h-4 w-4" /></button>
          {!compact && <span className="mx-0.5 h-5 w-px bg-sb-outline-variant/60" />}
          <button type="button" aria-label="Vista inicial" title="Vista inicial" onClick={() => setCam({ ...START, zoom: 1, t: null })} className="grid h-8 w-8 place-items-center rounded-full hover:bg-sb-surface-container"><LocateFixed className="h-4 w-4" /></button>
          <button type="button" aria-label={isFull ? "Salir de pantalla completa" : "Pantalla completa"} title={isFull ? "Salir de pantalla completa (Esc)" : "Pantalla completa"} onClick={toggleFull}
            className={cn("grid h-8 w-8 place-items-center rounded-full", isFull ? "bg-sb-primary text-sb-on-primary" : "hover:bg-sb-surface-container")}>{isFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
        </div>
      </div>
      <p className="text-[11px] text-sb-on-surface-variant sm:hidden">
        <b>Desliza</b> para mover · <b>pellizca</b> para acercar · elige el giro para dar la vuelta · toca una nave o un contenedor para verlo.
      </p>
      <p className="hidden text-[11px] text-sb-on-surface-variant sm:block">
        <b>Arrastra</b> para mover la vista ({mode === "move" ? "✋ activo" : "elige ✋"}) o para girarla 360° (elige el giro) · <b>rueda o pellizca</b> para acercar justo donde apuntas · doble clic acerca ahí · toca un contenedor para ver lo que lleva.
      </p>
    </div>
  );
}
