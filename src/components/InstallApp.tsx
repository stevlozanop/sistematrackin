"use client";
import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const KEY = "install-dismissed";
const INSTALLED = "app-installed";
const WAIT_DAYS = 14;

/** Ya abierta como app (ventana propia, sin barra del navegador) */
function runningAsApp() {
  return ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"].some((m) => matchMedia(`(display-mode: ${m})`).matches)
    || !!(navigator as { standalone?: boolean }).standalone;
}
function installedHere() {
  try { return localStorage.getItem(INSTALLED) === "1"; } catch { return false; }
}
function markInstalled() {
  try { localStorage.setItem(INSTALLED, "1"); } catch {}
}

function dismissedRecently() {
  try { return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < WAIT_DAYS * 864e5; } catch { return false; }
}

/**
 * Registra el service worker y ofrece instalar System Tracking como app.
 * Chrome / Edge / Android: botón «Instalar». iPhone / iPad: indica cómo agregarla desde «Compartir».
 */
export function InstallApp() {
  const [evt, setEvt] = useState<PromptEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
    // Abierta como app: se recuerda en este equipo para no volver a ofrecerla en el navegador
    if (runningAsApp()) { markInstalled(); return; }
    if (installedHere() || dismissedRecently()) return;
    let alive = true;
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as PromptEvent); };
    const onInstalled = () => { markInstalled(); setEvt(null); setIos(false); };
    // Chrome / Edge en Android y computadora: pregunta si la app ya está instalada en el equipo
    const related = (navigator as { getInstalledRelatedApps?: () => Promise<unknown[]> }).getInstalledRelatedApps;
    related?.call(navigator).then((apps) => { if (alive && apps.length) { markInstalled(); setEvt(null); setIos(false); } }).catch(() => {});
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    const t = isIos && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua) ? setTimeout(() => setIos(true), 4000) : undefined;
    return () => { alive = false; window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); clearTimeout(t); };
  }, []);

  function close() {
    try { localStorage.setItem(KEY, String(Date.now())); } catch {}
    setEvt(null); setIos(false);
  }
  async function install() {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "dismissed") close(); else { markInstalled(); setEvt(null); }
  }

  if (!evt && !ios) return null;
  return (
    <div role="dialog" aria-label="Instalar System Tracking" className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-[#111] p-3 text-white shadow-2xl ring-1 ring-white/10 sm:bottom-5"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- ícono fijo de public/ */}
      <img src="/icons/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 text-[13px] leading-snug">
        <p className="font-semibold">Instala System Tracking</p>
        {ios
          ? <p className="text-white/60">Toca <Share className="inline h-3.5 w-3.5 align-[-2px]" /> Compartir y luego «Agregar a inicio».</p>
          : <p className="text-white/60">Ábrelo como app desde tu inicio, a pantalla completa.</p>}
      </div>
      {!ios && (
        <button type="button" onClick={install} className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#078a04] px-3.5 py-2 text-[13px] font-semibold">
          <Download className="h-4 w-4" /> Instalar
        </button>
      )}
      <button type="button" onClick={close} aria-label="Ahora no" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/50 hover:text-white">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
