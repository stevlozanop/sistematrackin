"use client";

import * as React from "react";
import { iso, pathOf, translateAlong, type Point3 } from "@/components/iso/iso-kit";
import { asksForStillness, follow, useInView, useLoop, useReadout } from "@/components/iso/react/live";
import { behind, boxesOf, type Box } from "./boxes";
import { CRATE_H, LOOP, poseAt, readoutOf, spokenOf, type Pose } from "./model";
import { GIRDER_Z, HEIGHT, P, WIDTH } from "./view";

/**
 * Parte viva del muelle: un recorrido que se repite solo (paso 1 → 1.1 → 2) y que el cursor
 * o las flechas del teclado pueden recorrer. Mueve las piezas con atributos (sin volver a renderizar)
 * y en cada cuadro reordena el pintado según la caja real de cada pieza.
 */

const HEAD_Z = GIRDER_Z + 2;
const SPREADER_H = 3;
const SCRUB = 0.35; // segundos para alcanzar el punto que marca el cursor
const BACK_TO_TOUR = 2600; // ms sin tocar para volver al recorrido solo
const KEY_STEP = 1.2;

type Art = { water: string; quay: string; house: string; trolley: string };
type Item = { id: string; html: string };

function ropesOf(p: Pose) {
  const out: string[] = [];
  for (const dx of [-6, 6]) for (const dy of [-4, 4]) {
    const a: Point3 = [p.gantry + dx, p.trolley + dy, HEAD_Z];
    const b: Point3 = [p.gantry + dx, p.trolley + dy, p.hook + SPREADER_H];
    out.push(pathOf([iso(a, P), iso(b, P)]));
  }
  return out.join("");
}

/** Rectángulo en pantalla de una caja del mundo */
function screenOf(b: Box): [number, number, number, number] {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const x of [b[0], b[1]]) for (const y of [b[2], b[3]]) for (const z of [b[4], b[5]]) {
    const [sx, sy] = iso([x, y, z], P);
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  return [x0, x1, y0, y1];
}

/** Orden de pintado: respeta "detrás de" donde dos piezas se cruzan en pantalla; si no, el orden base */
function orderOf(ids: string[], boxes: Record<string, Box | null>) {
  const live = ids.filter((id) => boxes[id]);
  const rect = Object.fromEntries(live.map((id) => [id, screenOf(boxes[id]!)]));
  const before = new Map<string, Set<string>>(live.map((id) => [id, new Set()]));
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    const ra = rect[a], rb = rect[b];
    if (ra[1] <= rb[0] || rb[1] <= ra[0] || ra[3] <= rb[2] || rb[3] <= ra[2]) continue;
    if (behind(boxes[a]!, boxes[b]!)) before.get(b)!.add(a);
    else if (behind(boxes[b]!, boxes[a]!)) before.get(a)!.add(b);
  }
  const done = new Set<string>();
  const out: string[] = [];
  while (out.length < live.length) {
    const next = live.find((id) => !done.has(id) && [...before.get(id)!].every((d) => done.has(d)))
      ?? live.find((id) => !done.has(id))!; // un ciclo (no debería pasar): sigue el orden base
    done.add(next);
    out.push(next);
  }
  return [...out, ...ids.filter((id) => !boxes[id])];
}

export function PortLive({ art, items, label }: { art: Art; items: Item[]; label: string }) {
  const { anchor, say } = useReadout<HTMLDivElement>();
  const sorted = React.useRef<SVGGElement>(null);
  const trolley = React.useRef<SVGGElement>(null);
  const top = React.useRef<SVGGElement>(null);
  const nodes = React.useRef<Map<string, SVGGElement> | null>(null);
  const inView = useInView(anchor);
  const ids = React.useMemo(() => items.map((i) => i.id), [items]);
  // La pose de reposo ya va escrita en el HTML del servidor (sin saltos al hidratar)
  const itemsHtml = React.useMemo(() => {
    const p = poseAt(0);
    const crane = translateAlong(P, [p.gantry, 0, 0]);
    const attrs = (id: string) => {
      if (["legBL", "legBR", "legFL", "legFR", "braces", "girderL", "girderR", "tieBack", "tieFront"].includes(id)) return ` transform="${crane}"`;
      if (id === "headblock") return ` transform="${translateAlong(P, [p.gantry, p.trolley, 0])}"`;
      if (id === "spreader") return ` transform="${translateAlong(P, [p.gantry, p.trolley, p.hook])}"`;
      if (id === "hanging") return ' style="display:none"';
      if (id.startsWith("deck")) return ' style="display:none"';
      return "";
    };
    return items.map((i) => `<g data-item="${i.id}"${attrs(i.id)}>${i.id === "ropes" ? `<path class="iso-line" data-tone="mid" d="${ropesOf(p)}"/>` : i.html}</g>`).join("");
  }, [items]);

  // Tiempo del recorrido y hacia dónde va (el cursor o el teclado lo mueven)
  const clock = React.useRef({ t: 0, target: 0, touched: 0, order: "" });
  const [speech, setSpeech] = React.useState(() => spokenOf(poseAt(0)));

  const apply = React.useCallback((p: Pose) => {
    const svg = sorted.current;
    if (!svg) return;
    if (!nodes.current) nodes.current = new Map([...svg.querySelectorAll<SVGGElement>("[data-item]")].map((n) => [n.dataset.item!, n]));
    const node = (id: string) => nodes.current!.get(id) ?? null;
    const crane = translateAlong(P, [p.gantry, 0, 0]);
    for (const id of ["legBL", "legBR", "legFL", "legFR", "braces", "girderL", "girderR", "tieBack", "tieFront"]) node(id)?.setAttribute("transform", crane);
    top.current?.setAttribute("transform", crane);
    trolley.current?.setAttribute("transform", translateAlong(P, [0, p.trolley, 0]));
    node("headblock")?.setAttribute("transform", translateAlong(P, [p.gantry, p.trolley, 0]));
    node("spreader")?.setAttribute("transform", translateAlong(P, [p.gantry, p.trolley, p.hook]));
    const hanging = node("hanging");
    if (hanging) {
      hanging.setAttribute("transform", translateAlong(P, [p.gantry, p.trolley, p.hook - CRATE_H]));
      hanging.style.display = p.hanging >= 0 ? "" : "none";
    }
    node("ropes")?.querySelector("path")?.setAttribute("d", ropesOf(p));
    const sail = translateAlong(P, [p.barge, 0, 0]);
    for (const id of ["tug", "hull", "deck0", "deck1", "deck2", "deck3"]) {
      const n = node(id);
      if (!n) continue;
      n.setAttribute("transform", sail);
      const own = id.startsWith("deck") ? p.deck[Number(id.slice(4))] : 1;
      const alpha = p.bargeAlpha * own;
      n.style.opacity = alpha >= 0.999 ? "" : `${Math.round(alpha * 1000) / 1000}`;
      n.style.display = alpha > 0.001 ? "" : "none";
    }
    p.quay.forEach((a, i) => {
      const n = node(`quay${i}`);
      if (!n) return;
      n.style.opacity = a >= 0.999 ? "" : `${Math.round(a * 1000) / 1000}`;
      n.style.display = a > 0.001 ? "" : "none";
    });
    const moor = node("mooring");
    if (moor) {
      moor.style.opacity = p.lines >= 0.999 ? "" : `${Math.round(p.lines * 1000) / 1000}`;
      moor.style.display = p.lines > 0.001 ? "" : "none";
    }
    // Reordenar solo si cambió
    const order = orderOf(ids, boxesOf(p));
    const key = order.join(",");
    if (key !== clock.current.order) {
      clock.current.order = key;
      for (const id of order) { const n = node(id); if (n) svg.appendChild(n); }
    }
    say(readoutOf(p));
  }, [ids, say]);

  // Primer cuadro igual al del servidor; luego cada cambio por atributos
  React.useEffect(() => { apply(poseAt(clock.current.t)); }, [apply]);

  const running = inView;
  useLoop((dt, calm) => {
    const c = clock.current;
    const idle = performance.now() - c.touched > BACK_TO_TOUR;
    if (calm) {
      // Movimiento reducido: una sola pose quieta, con las cajas subiendo a la chata
      c.t = c.target = 9.4;
    } else if (idle) {
      c.t += dt;
      c.target = c.t;
    } else {
      c.t = follow(c.t, c.target, dt, SCRUB);
    }
    const p = poseAt(c.t);
    apply(p);
    const spoken = spokenOf(p);
    setSpeech((s) => (s === spoken ? s : spoken));
    return !calm;
  }, running);

  const touch = () => { clock.current.touched = performance.now(); };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (asksForStillness()) return;
    const r = e.currentTarget.getBoundingClientRect();
    const u = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    touch();
    clock.current.target = u * LOOP;
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const c = clock.current;
    const at = c.target % LOOP;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = at + KEY_STEP;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = at - KEY_STEP;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = LOOP - 0.01;
    if (next === null) return;
    e.preventDefault();
    touch();
    c.target = Math.min(LOOP - 0.01, Math.max(0, next));
    if (asksForStillness()) { c.t = c.target; apply(poseAt(c.t)); }
  };

  const rest = poseAt(0);
  return (
    <div
      ref={anchor}
      className="port-stage"
      tabIndex={0}
      role="slider"
      aria-label="Recorrido del embarque en el muelle de Iquitos"
      aria-valuemin={0}
      aria-valuemax={Math.round(LOOP)}
      aria-valuenow={0}
      aria-valuetext={speech}
      onPointerMove={onPointerMove}
      onPointerLeave={touch}
      onKeyDown={onKeyDown}
    >
      <svg className="iso-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label} focusable="false">
        <g dangerouslySetInnerHTML={{ __html: art.water }} />
        <g dangerouslySetInnerHTML={{ __html: art.quay }} />
        <g ref={sorted} dangerouslySetInnerHTML={{ __html: itemsHtml }} />
        <g ref={top} transform={translateAlong(P, [rest.gantry, 0, 0])}>
          <g dangerouslySetInnerHTML={{ __html: art.house }} />
          <g ref={trolley} transform={translateAlong(P, [0, rest.trolley, 0])} dangerouslySetInnerHTML={{ __html: art.trolley }} />
        </g>
      </svg>
    </div>
  );
}
