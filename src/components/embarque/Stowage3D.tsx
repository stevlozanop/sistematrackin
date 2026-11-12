"use client";
import { useEffect, useMemo, useState } from "react";
import * as k from "@/components/iso/iso-kit";
import type { Plan, Point3 } from "@/components/iso/iso-kit";
import { RotateCcw, RotateCw } from "lucide-react";
import { bayName, boxColor, slotName, type Slot, type Vessel } from "@/lib/stowage";
import { cn } from "@/lib/cn";
import "@/components/iso/iso.css";
import "./stowage3d.css";

type Item = { id: number; code: string; slot: Slot | null; units: number };

/** Medidas en el dibujo: un contenedor ocupa LEN de largo (proa → popa), WID de ancho y HGT de alto */
const LEN = 40, WID = 17, HGT = 15, GAP = 3;
const W = 760, H = 360;
const VIEWS = [{ az: 62, label: "Costado" }, { az: 18, label: "Proa" }, { az: 118, label: "Popa" }, { az: 242, label: "Otro costado" }];

/**
 * Nave en 3D (kit Anatomy): cada contenedor en su bahía, fila y nivel reales.
 * Se puede girar la vista, mostrar solo hasta un nivel y mover contenedores tocando uno y luego un lugar.
 */
export function Stowage3D({ vessel, items, sel, canEdit, canDrop, onTapItem, onTapSlot }: {
  vessel: Vessel; items: Item[]; sel: number | null; canEdit: boolean;
  canDrop: (s: Slot) => boolean; onTapItem: (id: number) => void; onTapSlot: (s: Slot) => void;
}) {
  const [view, setView] = useState(0);
  const [upTo, setUpTo] = useState(vessel.tiers);
  const [theme, setTheme] = useState<"dark" | "light">("light");
  useEffect(() => {
    const html = document.documentElement;
    const read = () => setTheme(html.classList.contains("dark") ? "dark" : "light");
    read();
    const mo = new MutationObserver(read);
    mo.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  const top = Math.min(upTo, vessel.tiers);

  const geo = useMemo(() => {
    const len = vessel.bays * (LEN + GAP) - GAP, wid = vessel.rows * (WID + GAP) - GAP;
    const moto = vessel.kind === "motonave";
    // Motonave: las cubiertas de pasajeros van detrás de la carga (hacia popa); chata: el empujador detrás
    const back = moto ? 70 : 0;
    const hull: Plan = { x: -16, y: -10, w: len + 30 + back, d: wid + 20, r: moto ? 18 : 9 };
    const pusher: Plan = { x: len + 22, y: wid / 2 - 14, w: 34, d: 28, r: 8 };
    const P = k.fitProjection([...k.boxCorners(hull, -16, Math.max(vessel.tiers * HGT, moto ? 46 : 0) + 4), ...(moto ? [] : k.boxCorners(pusher, -16, 24))], W, H, { pad: 14, headroom: 30, azimuth: VIEWS[view].az, elevation: 34 });
    const cell = (s: Slot): Plan => ({ x: (s.bay - 1) * (LEN + GAP), y: (s.row - 1) * (WID + GAP), w: LEN, d: WID, r: 0.6 });
    const center = (s: Slot, z: number): Point3 => { const c = cell(s); return [c.x + c.w / 2, c.y + c.d / 2, z]; };
    const hullSvg = k.solidSvg(k.slabOf(hull, -16, 14, P, 8, 0.6), { tone: "mid", inner: k.lineSvg(k.planOutline(k.insetPlan(hull, 4), -2, P, 8), { tone: "faint" }) })
      // proa marcada
      + k.lineSvg(k.segment([-12, wid / 2, -2], [-4, wid / 2, -2], P), { tone: "mid" });
    const cx0 = len + 12;
    const deck = (dx: number, w: number, z: number, h: number, inset: number) => k.solidSvg(k.slabOf({ x: cx0 + dx, y: -6 + inset, w, d: wid + 12 - inset * 2, r: 3 }, z, h, P, 3, 0.4), { tone: "hi" });
    // Motonave: tres cubiertas, cada una más chica, y el mástil · Chata: el empujador con su cabina
    const backSvg = moto
      ? deck(0, back - 6, -2, 14, 1) + deck(6, back - 18, 12, 12, 4) + deck(back - 34, 22, 24, 10, 8)
        + k.lineSvg(k.segment([cx0 + back - 23, wid / 2, 34], [cx0 + back - 23, wid / 2, 52], P), { tone: "mid" })
      : k.solidSvg(k.slabOf(pusher, -16, 12, P, 6, 0.4), { tone: "mid" }) + k.solidSvg(k.slabOf(k.insetPlan(pusher, 7), -4, 12, P, 2, 0.3), { tone: "hi" })
        + k.solidSvg(k.slabOf(k.insetPlan(pusher, 10), 8, 8, P, 2, 0.3), { tone: "hi" });
    const backAt: Point3 = moto ? [cx0 + back / 2, wid / 2, 0] : [pusher.x + pusher.w / 2, wid / 2, 0];
    return { P, cell, center, hullSvg, backSvg, backAt };
  }, [vessel, view]);
  const { P, cell, center } = geo;

  const placed = items.filter((i) => i.slot && i.slot.tier <= top);
  const picked = items.find((i) => i.id === sel) ?? null;
  // Lugares libres a la vista: el piso de cada pila, o los destinos posibles mientras se mueve algo
  const free: Slot[] = [];
  for (let tier = 1; tier <= top; tier++) for (let bay = 1; bay <= vessel.bays; bay++) for (let row = 1; row <= vessel.rows; row++) {
    const s = { bay, row, tier };
    if (items.some((i) => i.slot && i.slot.bay === bay && i.slot.row === row && i.slot.tier === tier)) continue;
    if (picked ? canDrop(s) : tier === 1) free.push(s);
  }

  // Orden del pintor: de atrás hacia adelante y de abajo hacia arriba
  type Draw = { kind: "box"; item: Item; s: Slot } | { kind: "slot"; s: Slot } | { kind: "back"; s: null };
  const depthOfDraw = (d: Draw) => (d.kind === "back" ? k.depthOf(geo.backAt, P) : k.depthOf(center(d.s, 0), P));
  const draws: Draw[] = [...placed.map((item) => ({ kind: "box" as const, item, s: item.slot! })), ...free.map((s) => ({ kind: "slot" as const, s })), { kind: "back" as const, s: null }]
    .sort((a, b) => depthOfDraw(a) - depthOfDraw(b) || (a.s?.tier ?? 0) - (b.s?.tier ?? 0));

  const box = (s: Slot, lit: boolean) => {
    const c = cell(s), z = (s.tier - 1) * HGT;
    const ribs = [0.25, 0.5, 0.75].map((f) => k.segment([c.x + c.w * f, c.y + c.d, z + 1], [c.x + c.w * f, c.y + c.d, z + HGT - 1.5], P) + k.segment([c.x + c.w * f, c.y, z + 1], [c.x + c.w * f, c.y, z + HGT - 1.5], P)).join("");
    return k.solidSvg(k.slabOf(c, z, HGT - 1, P, 2, 0.4), { tone: "hi", lit, inner: k.lineSvg(ribs, { tone: "faint" }) });
  };
  const ghost = (s: Slot) => k.solidSvg(k.slabOf(cell(s), (s.tier - 1) * HGT, 1.2, P, 2, 0.2), { tone: "faint" });
  const pct = (p: Point3) => { const [x, y] = k.iso(p, P); return { left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }; };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full bg-sb-surface-container p-1">
          <button type="button" aria-label="Girar a la izquierda" onClick={() => setView((v) => (v + VIEWS.length - 1) % VIEWS.length)} className="grid h-7 w-7 place-items-center rounded-full hover:bg-sb-surface"><RotateCcw className="h-3.5 w-3.5" /></button>
          {VIEWS.map((v, i) => (
            <button key={v.label} type="button" onClick={() => setView(i)}
              className={cn("sb-pill-sm rounded-full px-2.5 py-1 text-[11px] font-semibold", view === i ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>{v.label}</button>
          ))}
          <button type="button" aria-label="Girar a la derecha" onClick={() => setView((v) => (v + 1) % VIEWS.length)} className="grid h-7 w-7 place-items-center rounded-full hover:bg-sb-surface"><RotateCw className="h-3.5 w-3.5" /></button>
        </div>
        {vessel.tiers > 1 && (
          <div className="flex items-center gap-1 rounded-full bg-sb-surface-container p-1 text-[11px]">
            <span className="px-2 text-sb-on-surface-variant">Ver</span>
            {Array.from({ length: vessel.tiers }, (_, i) => i + 1).map((t) => (
              <button key={t} type="button" onClick={() => setUpTo(t)}
                className={cn("sb-pill-sm rounded-full px-2.5 py-1 font-semibold", top === t ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
                {t === vessel.tiers ? "Todo" : t === 1 ? "Solo abajo" : `Hasta nivel ${t}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <div className="iso st3 relative min-w-[520px] sm:min-w-0" data-theme={theme}>
          <svg className="iso-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Nave en 3D con sus contenedores">
            <g dangerouslySetInnerHTML={{ __html: geo.hullSvg }} />
            {draws.map((d) => d.kind === "back" ? (
              <g key="back" dangerouslySetInnerHTML={{ __html: geo.backSvg }} />
            ) : d.kind === "box" ? (
              <g key={`b${d.item.id}-${d.s.bay}${d.s.row}${d.s.tier}`} style={{ ["--box" as string]: boxColor(d.item.code) }} className={cn("st3-box", canEdit && "is-pick", sel === d.item.id && "is-sel", picked && sel !== d.item.id && canDrop(d.s) && "is-swap")}
                onClick={() => canEdit && onTapItem(d.item.id)} dangerouslySetInnerHTML={{ __html: box(d.s, sel === d.item.id) }} />
            ) : (
              <g key={`s${d.s.bay}${d.s.row}${d.s.tier}`} className={cn("st3-slot", picked && "is-target")}
                onClick={() => picked && onTapSlot(d.s)} dangerouslySetInnerHTML={{ __html: ghost(d.s) }} />
            ))}
          </svg>
          {/* Código de cada contenedor sobre su techo */}
          {placed.map((i) => (
            <button key={i.id} type="button" onClick={() => canEdit && onTapItem(i.id)} title={slotName(i.slot!, vessel)}
              className={cn("st3-tag", sel === i.id && "is-sel", picked && sel !== i.id && canDrop(i.slot!) && "is-swap")}
              style={pct(center(i.slot!, i.slot!.tier * HGT))}>
              {i.code}
            </button>
          ))}
          {picked && free.map((s) => (
            <button key={`t${s.bay}${s.row}${s.tier}`} type="button" onClick={() => onTapSlot(s)} className="st3-drop" style={pct(center(s, (s.tier - 1) * HGT + 2))}
              aria-label={`Poner aquí: ${slotName(s, vessel)}`}>+</button>
          ))}
          <span className="st3-bow" style={pct([-14, 0, 0])}>Proa</span>
          <span className="st3-bow" style={pct([(vessel.bays) * (LEN + GAP) + 10, 0, 0])}>{bayName(vessel.bays, vessel) === "Popa" ? "Popa" : ""}</span>
        </div>
      </div>
    </div>
  );
}
