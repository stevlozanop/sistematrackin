"use client";

import * as React from "react";
import * as k from "@/components/iso/iso-kit";
import type { Plane, Point3, Projection } from "@/components/iso/iso-kit";
import { Hand, LocateFixed, Maximize2, Minimize2, Minus, Plus, Rotate3d } from "lucide-react";
import { ROADS, TOWNS, town, type TripState } from "@/lib/yur-road";
import { cn } from "@/lib/cn";
import "@/components/iso/iso.css";
import "@/components/figures/route/route.css";
import "./road.css";

/**
 * Carretera de Yurimaguas en 3D (kit Anatomy): el puerto y ENAPU, la IIRSA Norte con sus ramales,
 * los pueblos de cada ruta y cada camión sobre la carretera, del color de su estado.
 * Sin GPS: el camión se ubica por la última parada que marcó y los días que lleva frente a los estimados.
 * Arrastrar mueve el mapa (o lo gira), la rueda o el pellizco acercan; pantalla completa.
 */
export type RoadTruck = { id: number; label: string; sub: string; state: TripState; x: number; y: number; angle: number };

const W = 900, H = 620;
const START = { az: 90, el: 52 };
const xs = TOWNS.map((t) => t.x), ys = TOWNS.map((t) => t.y);
const PAD = 40;
const GROUND = { x: Math.min(...xs) - PAD - 20, y: Math.min(...ys) - PAD, w: Math.max(...xs) - Math.min(...xs) + PAD * 2 + 20, d: Math.max(...ys) - Math.min(...ys) + PAD * 2, r: 10 };
const BOUNDS: Point3[] = k.boxCorners(GROUND, -8, 12);
// Costa del Pacífico (al oeste) y río Huallaga (en Yurimaguas)
const geo = (lon: number, lat: number): Plane => [(lon + 78.6) * 100, (-lat - 6.4) * 100];
const COAST: Plane[] = [geo(-81.35, -4.45), geo(-81.2, -5.1), geo(-80.95, -5.85), geo(-80.2, -6.5), geo(-79.95, -6.95), geo(-79.6, -7.4), geo(-79.1, -8.15), geo(-78.65, -9.1), geo(-78.35, -9.75)];
const RIVER: Plane[] = [geo(-76.25, -6.45), geo(-76.18, -6.15), geo(-76.08, -5.92), geo(-75.98, -5.6), geo(-75.85, -5.25)];
const MINOR = new Set(["PEDRO RUIZ", "OLMOS", "LA VICTORIA"]);

function draw(P: Projection) {
  const at = (p: Point3) => k.iso(p, P);
  const depth = (p: Point3) => k.depthOf(p, P);
  const ground = k.solidSvg(k.slabOf(GROUND, -8, 8, P, 6, 1), { tone: "mid", className: "rd-ground" });
  const west = GROUND.x + 1, south = GROUND.y + GROUND.d - 1, north = GROUND.y + 1;
  const sea = `<path class="rd-sea" d="${k.onTop([[west, north], [COAST[0][0], north], ...COAST, [COAST[COAST.length - 1][0], south], [west, south]], 0.05, P, true)}"/>`;
  const river = `<path class="rd-river" d="${k.onTop(RIVER, 0.1, P)}"/>`;
  return { ground, sea, river, at, depth };
}

/** Rectángulo girado (el camión mira hacia donde va) */
function boxRing(cx: number, cy: number, len: number, wid: number, angle: number, ahead = 0): Plane[] {
  const c = Math.cos(angle), s = Math.sin(angle);
  const ox = cx + c * ahead, oy = cy + s * ahead;
  return [[-len / 2, -wid / 2], [len / 2, -wid / 2], [len / 2, wid / 2], [-len / 2, wid / 2]].map(([u, v]) => [ox + u * c - v * s, oy + u * s + v * c] as Plane);
}

export function RoadScene({ trucks, selected, onPick, path, stops, enapu }: {
  trucks: RoadTruck[]; selected: number | null; onPick: (id: number) => void;
  /** Pueblos del viaje elegido (se resalta su camino y sus paradas) */
  path: string[]; stops: string[]; enapu: number;
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

  const [cam, setCam] = React.useState<{ az: number; el: number; zoom: number; t: { x: number; y: number } | null }>({ ...START, zoom: 1, t: null });
  const [mode, setMode] = React.useState<"move" | "turn">("move");
  const P = React.useMemo(() => k.fitProjection(BOUNDS, W, H, { pad: 6, azimuth: cam.az, elevation: cam.el }), [cam.az, cam.el]);
  const s = React.useMemo(() => draw(P), [P]);

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
  const pick = (id: number) => { if (full === "native") document.exitFullscreen?.().catch(() => {}); if (full !== "off") setFull("off"); onPick(id); };

  const narrow = boxW > 0 && boxW < 640;
  const compact = boxW > 0 && boxW < 520;
  const tallH = 420;
  const aspect = isFull && boxW && boxH ? boxW / boxH : narrow ? boxW / tallH : W / H;
  const vw = Math.min(W, H * aspect) / cam.zoom, vh = Math.min(H, W / aspect) / cam.zoom;
  // En celular el mapa se ve recortado: arranca centrado en los camiones (y Yurimaguas)
  const home = React.useMemo(() => {
    const px = [town("YURIMAGUAS").x, ...trucks.map((t) => t.x)], py = [town("YURIMAGUAS").y, ...trucks.map((t) => t.y)];
    return { x: (Math.min(...px) + Math.max(...px)) / 2, y: (Math.min(...py) + Math.max(...py)) / 2 };
  }, [trucks]);
  const [fx, fy] = cam.t ? s.at([cam.t.x, cam.t.y, 0]) : narrow && !isFull ? s.at([home.x, home.y, 0]) : [W / 2, H / 2];
  const vx = Math.min(Math.max(fx - vw / 2, 0), W - vw), vy = Math.min(Math.max(fy - vh / 2, 0), H - vh);
  const unproject = React.useCallback((sx: number, sy: number) => {
    const [ox, oy] = s.at([0, 0, 0]), [ax, ay] = s.at([1, 0, 0]), [bx, by] = s.at([0, 1, 0]);
    const ux = ax - ox, uy = ay - oy, wx = bx - ox, wy = by - oy, det = ux * wy - uy * wx || 1;
    const dx = sx - ox, dy = sy - oy;
    return { x: (dx * wy - dy * wx) / det, y: (ux * dy - uy * dx) / det };
  }, [s]);
  const view = React.useRef({ vx, vy, vw, vh, unproject });
  React.useLayoutEffect(() => { view.current = { vx, vy, vw, vh, unproject }; });
  const pos = (p: Point3) => { const [sx, sy] = s.at(p); return { left: `${((sx - vx) / vw) * 100}%`, top: `${((sy - vy) / vh) * 100}%` }; };
  const inView = (p: Point3) => { const [sx, sy] = s.at(p); return sx >= vx - 4 && sx <= vx + vw + 4 && sy >= vy - 4 && sy <= vy + vh + 4; };

  // Tamaño de las piezas: al alejar, los camiones se ven un poco más grandes para que se encuentren
  const big = Math.max(1, 1.8 / cam.zoom);
  const onPath = React.useMemo(() => new Set(path), [path]);
  const stopSet = React.useMemo(() => new Set(stops), [stops]);

  // Carreteras (las del viaje elegido, resaltadas)
  const roads = React.useMemo(() => {
    let base = "", lit = "";
    for (const [a, b] of ROADS) {
      const A = town(a), B = town(b);
      const d = k.onTop([[A.x, A.y], [B.x, B.y]], 0.2, P);
      const on = onPath.has(a) && onPath.has(b);
      if (on) lit += `<path class="rd-road is-on" d="${d}"/>`;
      else base += `<path class="rd-road" d="${d}"/>`;
      base += `<path class="rd-lane" d="${d}"/>`;
    }
    return base + lit;
  }, [P, onPath]);

  // Pueblos (casitas) y camiones, dibujados del fondo hacia adelante
  const pieces = React.useMemo(() => {
    const out: { key: number; svg: string; truck?: RoadTruck }[] = [];
    for (const t of TOWNS) {
      if (MINOR.has(t.id)) continue;
      const stop = stopSet.has(t.id);
      let svg = "";
      if (t.id === "YURIMAGUAS") {
        // Puerto y almacén ENAPU
        svg = k.solidSvg(k.slabOf({ x: t.x - 9, y: t.y - 14, w: 22, d: 12, r: 1 }, 0, 9, P, 2, 0.4), { tone: "hi", className: "rd-town is-stop" })
          + k.solidSvg(k.slabOf({ x: t.x - 6, y: t.y + 2, w: 9, d: 7, r: 0.6 }, 0, 6, P, 2, 0.3), { tone: "hi", className: "rd-town" });
      } else {
        const hs: [number, number, number, number][] = [[-5, -4, 5, 6], [2, -3, 4, 4], [-2, 3, 4, 3.5]];
        svg = hs.sort((a, b) => s.depth([t.x + a[0], t.y + a[1], 0]) - s.depth([t.x + b[0], t.y + b[1], 0]))
          .map(([dx, dy, w, h]) => k.solidSvg(k.slabOf({ x: t.x + dx, y: t.y + dy, w, d: w, r: 0.4 }, 0, h, P, 2, 0.2), { tone: "hi", className: cn("rd-town", stop && "is-stop") })).join("");
      }
      out.push({ key: s.depth([t.x, t.y, 0]), svg });
    }
    // Camiones en el mismo lugar: se separan un poco
    const seen = new Map<string, number>();
    for (const tk of trucks) {
      const spot = `${Math.round(tk.x / 3)}|${Math.round(tk.y / 3)}`;
      const i = seen.get(spot) ?? 0; seen.set(spot, i + 1);
      const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 6 * big;
      const nx = -Math.sin(tk.angle), ny = Math.cos(tk.angle);
      const x = tk.x + nx * side, y = tk.y + ny * side;
      const len = 11 * big, wid = 5 * big;
      const cargo = k.solidSvg(k.extrude(boxRing(x, y, len * 0.72, wid, tk.angle, -len * 0.14), 0.5, 5 * big, P), { tone: "hi" });
      const cab = k.solidSvg(k.extrude(boxRing(x, y, len * 0.24, wid * 0.92, tk.angle, len * 0.38), 0.5, 3.8 * big, P), { tone: "hi" });
      const front = s.depth([x + Math.cos(tk.angle), y + Math.sin(tk.angle), 0]) > s.depth([x, y, 0]);
      out.push({ key: s.depth([x, y, 0]) + 0.5, svg: front ? cargo + cab : cab + cargo, truck: { ...tk, x, y } });
    }
    return out.sort((a, b) => a.key - b.key);
  }, [trucks, stopSet, P, s, big]);

  // Gestos (igual que el muelle)
  const ptrs = React.useRef(new Map<number, { x: number; y: number }>());
  const drag = React.useRef({ moved: 0, pinch: 0, alt: false });
  const toLocal = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect(), v = view.current;
    return { x: v.vx + ((clientX - r.left) / r.width) * v.vw, y: v.vy + ((clientY - r.top) / r.height) * v.vh };
  };
  const zoomAt = React.useCallback((factor: number, px?: number, py?: number) => setCam((c) => {
    const { vx: x0, vy: y0, vw: w0, vh: h0, unproject: un } = view.current;
    const zoom = Math.min(7, Math.max(1, c.zoom * factor));
    if (zoom === c.zoom) return c;
    const r = c.zoom / zoom, ax = px ?? x0 + w0 / 2, ay = py ?? y0 + h0 / 2;
    const nx = ax - (ax - x0) * r, ny = ay - (ay - y0) * r;
    return { ...c, zoom, t: zoom === 1 ? null : un(nx + (w0 * r) / 2, ny + (h0 * r) / 2) };
  }), []);
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
    drag.current.alt = e.button === 2 || e.shiftKey;
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
      panBy(dx / 2, dy / 2);
      drag.current.pinch = d; drag.current.moved += 10;
      return;
    }
    drag.current.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.current.moved < 4) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const touch = e.pointerType !== "mouse";
    if ((mode === "move") !== drag.current.alt) { panBy(dx, touch && !isFull ? 0 : dy); return; }
    setCam((c) => ({ ...c, az: (c.az - dx * 0.45 + 360) % 360, el: touch ? c.el : Math.min(80, Math.max(20, c.el + dy * 0.25)) }));
  };
  const onUp = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); if (ptrs.current.size < 2) drag.current.pinch = 0; };
  const onClickCapture = (e: React.MouseEvent) => { if (drag.current.moved >= 4) { e.stopPropagation(); e.preventDefault(); drag.current.moved = 0; } };

  const ctl = "grid h-8 w-8 place-items-center rounded-full hover:bg-sb-surface-container disabled:opacity-30";
  return (
    <div className="flex flex-col gap-2">
      <div ref={box} className={cn("iso rf rd relative overflow-hidden rounded-xl select-none", mode === "move" ? "cursor-grab active:cursor-grabbing" : "cursor-ew-resize",
          isFull && "!rounded-none", full === "native" && "h-full w-full", full === "window" && "fixed inset-0 z-[90] h-dvh w-screen")} data-theme={theme}
        style={{ touchAction: isFull ? "none" : "pan-y", height: isFull ? undefined : narrow ? tallH : undefined, ...(isFull ? { background: "var(--sb-surface-container-low, #f4f6f2)" } : {}) }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClickCapture={onClickCapture}
        onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={(e) => { const p = toLocal(e.clientX, e.clientY); zoomAt(cam.zoom >= 6 ? 1 / 7 : 1.8, p.x, p.y); }}>
        <svg className="iso-svg" style={narrow || isFull ? { width: "100%", height: "100%" } : undefined} viewBox={`${vx} ${vy} ${vw} ${vh}`} role="img"
          aria-label="Carretera desde Yurimaguas en 3D con los camiones en ruta">
          <g dangerouslySetInnerHTML={{ __html: s.ground + s.sea + s.river + roads }} />
          {pieces.map((p, i) => p.truck ? (
            <g key={`t${p.truck.id}`} className={cn("rd-truck", `rd-tk-${p.truck.state}`, selected === p.truck.id && "is-on", p.truck.state === "camino" && "is-moving")}
              role="button" tabIndex={-1} aria-label={`Camión de ${p.truck.label}`} onClick={() => pick(p.truck!.id)} dangerouslySetInnerHTML={{ __html: p.svg }} />
          ) : <g key={`p${i}`} dangerouslySetInnerHTML={{ __html: p.svg }} />)}
        </svg>

        {/* Nombres de los pueblos */}
        {TOWNS.filter((t) => inView([t.x, t.y, 0]) && (!MINOR.has(t.id) || cam.zoom > 2.2)).map((t) => (
          <span key={t.id} className={cn("rd-town-tag", t.id === "YURIMAGUAS" && "is-hub", MINOR.has(t.id) && "is-minor")} style={pos([t.x, t.y, 0])}>
            {t.name}{t.id === "YURIMAGUAS" && enapu > 0 ? ` · ENAPU ${enapu.toLocaleString("es-PE")}` : ""}
          </span>
        ))}
        {/* Etiqueta de cada camión (en celular, solo el elegido o al acercar) */}
        {pieces.filter((p) => p.truck && inView([p.truck.x, p.truck.y, 0]) && (!compact || cam.zoom > 1.8 || selected === p.truck.id)).map((p) => {
          const t = p.truck!;
          return (
            <button key={`l${t.id}`} type="button" className={cn("rd-tag", `rd-tk-${t.state}`, selected === t.id && "is-on")} style={{ ...pos([t.x, t.y, 6 * big]), zIndex: selected === t.id ? 5 : 2 }}
              onClick={() => pick(t.id)} title={t.sub}>
              <i /> {t.label}{!compact && <span className="text-sb-on-surface-variant">· {t.sub}</span>}
            </button>
          );
        })}
        {!trucks.length && (
          <p className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-sb-surface/95 px-3 py-1 text-[11px] text-sb-on-surface-variant shadow-sm">No hay camiones en la carretera</p>
        )}
        {isFull && (
          <p className="absolute left-3 top-3 rounded-full bg-sb-surface/95 px-3 py-1.5 text-[12px] font-semibold shadow-sm" style={{ marginTop: "env(safe-area-inset-top)" }}>
            Camiones en ruta <span className="font-normal text-sb-on-surface-variant">· Esc o ⤡ para salir</span>
          </p>
        )}
        {/* Leyenda */}
        <div className="pointer-events-none absolute left-2 top-2 hidden flex-col sm:flex gap-0.5 rounded-xl bg-sb-surface/90 px-2.5 py-1.5 text-[10px] shadow-sm" style={isFull ? { top: "3.25rem" } : undefined}>
          {([["camino", "En camino"], ["parada", "En parada"], ["atrasado", "Atrasado"], ["entregado", "Entregado"]] as const).map(([k2, l]) => (
            <span key={k2} className={cn("flex items-center gap-1.5", `rd-tk-${k2}`)}><i className="h-2 w-2 rounded-full" style={{ background: "var(--tk)" }} />{l}</span>
          ))}
        </div>
        {/* Controles */}
        <div className="sb-glass absolute bottom-2 right-2 flex items-center gap-0.5 rounded-full border border-sb-outline-variant/60 bg-sb-surface/95 p-1 shadow-sm" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <div className="flex rounded-full bg-sb-surface-container p-0.5" role="group" aria-label="Al arrastrar">
            <button type="button" aria-pressed={mode === "move"} title="Arrastrar mueve el mapa" onClick={() => setMode("move")}
              className={cn("grid h-7 w-7 place-items-center rounded-full", mode === "move" ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant")}><Hand className="h-4 w-4" /><span className="sr-only">Mover</span></button>
            <button type="button" aria-pressed={mode === "turn"} title="Arrastrar gira el mapa" onClick={() => setMode("turn")}
              className={cn("grid h-7 w-7 place-items-center rounded-full", mode === "turn" ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant")}><Rotate3d className="h-4 w-4" /><span className="sr-only">Girar</span></button>
          </div>
          <span className="mx-0.5 h-5 w-px bg-sb-outline-variant/60" />
          <button type="button" aria-label="Alejar" onClick={() => zoomAt(1 / 1.4)} disabled={cam.zoom <= 1} className={ctl}><Minus className="h-4 w-4" /></button>
          {!compact && <span className="w-9 text-center text-[10px] font-semibold tabular-nums text-sb-on-surface-variant">{Math.round(cam.zoom * 100)}%</span>}
          <button type="button" aria-label="Acercar" onClick={() => zoomAt(1.4)} disabled={cam.zoom >= 7} className={ctl}><Plus className="h-4 w-4" /></button>
          <button type="button" aria-label="Vista inicial" title="Vista inicial" onClick={() => setCam({ ...START, zoom: 1, t: null })} className={ctl}><LocateFixed className="h-4 w-4" /></button>
          <button type="button" aria-label={isFull ? "Salir de pantalla completa" : "Pantalla completa"} onClick={toggleFull}
            className={cn("grid h-8 w-8 place-items-center rounded-full", isFull ? "bg-sb-primary text-sb-on-primary" : "hover:bg-sb-surface-container")}>{isFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
        </div>
      </div>
      <p className="text-[11px] text-sb-on-surface-variant">
        <b>Arrastra</b> para mover el mapa · <b>rueda o pellizca</b> para acercar · toca un camión para ver su viaje. Sin GPS: el camión se ubica por sus paradas y los días que lleva.
      </p>
    </div>
  );
}
