"use client";
import { useSyncExternalStore } from "react";
import { Check, Palette } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Aspecto de todo el sistema: «Clásica» (el original) o «Taksice» (ventana blanca, menú de íconos, tarjetas planas). */
export type Look = "clasica" | "taksice";
const EVENT = "sb-look";

const read = (): Look => (typeof document !== "undefined" && document.documentElement.dataset.look === "taksice" ? "taksice" : "clasica");
const subscribe = (cb: () => void) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); };

export function setLook(v: Look) {
  try { localStorage.setItem("look", v); } catch { /* sin almacenamiento: vale hasta recargar */ }
  if (v === "clasica") delete document.documentElement.dataset.look; else document.documentElement.dataset.look = v;
  window.dispatchEvent(new Event(EVENT));
}
export const useLook = () => useSyncExternalStore(subscribe, read, () => "clasica" as Look);
export const LOOK_EVENT = EVENT;

/** Miniatura de cada estilo */
function Preview({ look }: { look: Look }) {
  const t = look === "taksice";
  return (
    <div className={cn("flex h-20 gap-1.5 overflow-hidden p-1.5", t ? "rounded-xl bg-zinc-300" : "rounded-xl bg-zinc-100")}>
      <div className={cn("flex flex-1 gap-1.5", t && "rounded-lg bg-white p-1.5 shadow-sm")}>
        <div className={cn("flex shrink-0 flex-col gap-1", t ? "w-3.5 border-r border-zinc-200 pr-1" : "w-9")}>
          {[0, 1, 2, 3].map((i) => <span key={i} className={cn("h-1.5 rounded-full", i === 0 ? "bg-sb-primary" : "bg-zinc-300", t ? "w-1.5" : "w-full")} />)}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <span className={cn("h-5", t ? "rounded-md border border-zinc-200 bg-zinc-50" : "rounded-lg bg-white shadow-sm")} />
          <div className="flex flex-1 gap-1">
            <span className={cn("flex-1", t ? "rounded-md bg-zinc-100" : "rounded-lg bg-white shadow-sm")} />
            <span className={cn("w-1/3", t ? "rounded-md border border-zinc-200 bg-white" : "rounded-lg bg-white shadow-sm")} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function LookCard() {
  const look = useLook();
  const options: [Look, string, string][] = [
    ["clasica", "Clásica", "El diseño original: tarjetas suaves con sombra y menú con nombres."],
    ["taksice", "Taksice", "Ventana blanca flotante, menú de íconos, tarjetas planas con borde fino y letra compacta."],
  ];
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sb-primary-soft text-sb-primary"><Palette className="h-[18px] w-[18px]" /></span>
        <div>
          <h3 className="text-sm font-semibold">Apariencia</h3>
          <p className="text-[11px] text-sb-on-surface-variant">El estilo de todo el sistema en este dispositivo. Tus datos no cambian.</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map(([k, name, desc]) => {
          const on = look === k;
          return (
            <button key={k} type="button" onClick={() => setLook(k)} aria-pressed={on}
              className={cn("flex flex-col gap-2 rounded-2xl p-2.5 text-left ring-1 transition-all duration-200", on ? "bg-sb-primary-soft ring-2 ring-sb-primary" : "ring-sb-outline-variant hover:bg-sb-surface-container-low")}>
              <Preview look={k} />
              <span className="flex items-center justify-between gap-2 px-0.5">
                <span><b className="block text-sm">{name}</b><span className="block text-[11px] leading-snug text-sb-on-surface-variant">{desc}</span></span>
                <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors", on ? "border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant")}>
                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
