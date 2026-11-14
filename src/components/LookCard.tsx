"use client";
import { useSyncExternalStore } from "react";
import { Check, Palette } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Apariencia de todo el sistema en este dispositivo: estilo de navegación y color de acento (como Stepbro). */
export type Look = "clasica" | "bonita" | "guapa" | "taksice" | "melon" | "tunnel" | "minimalice" | "pebble" | "burbuja" | "brut";
const EVENT = "sb-look";
export const LOOK_EVENT = EVENT;

export const LOOKS: [Look, string, string][] = [
  ["clasica", "Clásica", "El diseño original: menú con secciones y tarjetas suaves."],
  ["bonita", "Bonita", "Píldoras de texto flotando a la izquierda, sin íconos."],
  ["guapa", "Guapa", "Menú con íconos y la opción activa en un bloque gris."],
  ["taksice", "Tasks", "Riel de íconos redondos y contenido en un panel (Stepbro Tasks)."],
  ["melon", "Melon", "Menú compacto con letra pequeña y la activa marcada."],
  ["tunnel", "Tunnel", "Solo texto: la opción activa grande y las demás tenues."],
  ["minimalice", "Minimalice", "Editorial: papel limpio, títulos gigantes, líneas finas en vez de tarjetas y cifras en mono."],
  ["pebble", "Pebble", "Rebelde: el menú son etiquetas que abrazan cada palabra y la activa se pega como un sticker."],
  ["burbuja", "Burbuja", "Cada letra del título en su burbuja y la inicial de cada opción en un círculo."],
  ["brut", "Brut", "Contornos crudos sin rellenos: la activa con borde grueso y subrayado a mano."],
];

/** Colores de acento: el primero vuelve al color de la empresa. [nombre, claro, oscuro, texto encima claro, texto encima oscuro] */
const ACCENTS: [string, string, string, string, string][] = [
  ["Empresa", "", "", "", ""],
  ["Gris", "#71717a", "#d4d4d8", "#fff", "#0a0a0b"],
  ["Negro", "#161618", "#fafafa", "#fff", "#0a0a0b"],
  ["Rojo", "#dc2626", "#f87171", "#fff", "#0a0a0b"],
  ["Naranja", "#ea7a0c", "#fb923c", "#fff", "#0a0a0b"],
  ["Verde", "#16a34a", "#4ade80", "#fff", "#0a0a0b"],
  ["Azul", "#2563eb", "#60a5fa", "#fff", "#0a0a0b"],
  ["Índigo", "#4f46e5", "#818cf8", "#fff", "#0a0a0b"],
  ["Violeta", "#7c3aed", "#a78bfa", "#fff", "#0a0a0b"],
  ["Magenta", "#c026d3", "#e879f9", "#fff", "#0a0a0b"],
  ["Rosa", "#db2777", "#f472b6", "#fff", "#0a0a0b"],
];
const VARS = ["--acc-l", "--acc-d", "--acc-on-l", "--acc-on-d"];

const readLook = (): Look => (typeof document !== "undefined" ? (document.documentElement.dataset.look as Look) ?? "clasica" : "clasica");
const readAccent = () => (typeof document !== "undefined" ? document.documentElement.style.getPropertyValue("--acc-l").trim() : "");
const subscribe = (cb: () => void) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); };

export function setLook(v: Look) {
  try { localStorage.setItem("look", v); } catch { /* sin almacenamiento: vale hasta recargar */ }
  if (v === "clasica") delete document.documentElement.dataset.look; else document.documentElement.dataset.look = v;
  window.dispatchEvent(new Event(EVENT));
}
function setAccent(a: (typeof ACCENTS)[number]) {
  const el = document.documentElement;
  if (!a[1]) {
    for (const k of VARS) el.style.removeProperty(k);
    delete el.dataset.accent;
    try { localStorage.setItem("accent", "null"); } catch { /* nada */ }
  } else {
    const vals = Object.fromEntries(VARS.map((k, i) => [k, a[i + 1]]));
    for (const [k, v] of Object.entries(vals)) el.style.setProperty(k, v);
    el.dataset.accent = "1";
    try { localStorage.setItem("accent", JSON.stringify(vals)); } catch { /* nada */ }
  }
  window.dispatchEvent(new Event(EVENT));
}
export const useLook = () => useSyncExternalStore(subscribe, readLook, () => "clasica" as Look);

/** Colores y estilos de navegación (lo usan la tarjeta de Mi perfil y el menú Opciones del celular) */
export function AppearancePicker({ compact = false }: { compact?: boolean }) {
  const look = useLook();
  const accent = useSyncExternalStore(subscribe, readAccent, () => "");
  return (
    <div className={cn("flex flex-col", compact ? "gap-3" : "gap-4")}>
      <div className={cn("flex flex-wrap", compact ? "gap-1.5" : "gap-2")}>
        {ACCENTS.map((a) => {
          const on = a[1] ? accent === a[1] : !accent;
          return (
            <button key={a[0]} type="button" onClick={() => setAccent(a)} title={a[0]} aria-label={`Color ${a[0]}`} aria-pressed={on}
              className={cn("sb-pill-icon grid place-items-center rounded-full ring-offset-2 ring-offset-sb-surface", compact ? "h-7 w-7" : "h-9 w-9", on ? "ring-2 ring-sb-on-surface" : "ring-1 ring-black/5")}
              style={{ background: a[1] ? `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${a[1]} 55%, #fff), ${a[1]} 70%)` : "conic-gradient(from 200deg, #078a04, #09ae04, #bedf3c, #078a04)" }}>
              {on && <Check className="h-3.5 w-3.5 text-white drop-shadow" strokeWidth={3} />}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-medium text-sb-on-surface-variant">Navegación</p>
        <div className="grid grid-cols-3 gap-1.5">
          {LOOKS.map(([k, name, desc]) => (
            <button key={k} type="button" onClick={() => setLook(k)} aria-pressed={look === k} title={desc}
              className={cn("sb-pill rounded-full px-3 font-semibold", compact ? "py-1.5 text-[11px]" : "py-2 text-xs", look === k ? "bg-sb-on-surface text-sb-surface" : "bg-sb-surface-container text-sb-on-surface-variant hover:text-sb-on-surface")}>
              {name}
            </button>
          ))}
        </div>
        {!compact && <p className="text-[11px] text-sb-on-surface-variant">{LOOKS.find(([k]) => k === look)?.[2]}</p>}
      </div>
    </div>
  );
}

export function LookCard() {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sb-primary-soft text-sb-primary"><Palette className="h-[18px] w-[18px]" /></span>
        <div>
          <h3 className="text-sm font-semibold">Apariencia</h3>
          <p className="text-[11px] text-sb-on-surface-variant">Color y estilo del menú en este dispositivo. Tus datos no cambian.</p>
        </div>
      </div>
      <AppearancePicker />
    </Card>
  );
}
