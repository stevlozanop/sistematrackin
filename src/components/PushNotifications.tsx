"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Bell, BellOff, BellRing, Send, X } from "lucide-react";
import { Card } from "@/components/ui";

/**
 * Notificaciones push en este equipo (como las de WhatsApp: llegan con la app cerrada).
 * - PushCard: en «Mi perfil», activar / desactivar / probar.
 * - PushNudge: un aviso pequeño que invita a activarlas; si el permiso ya estaba dado, conecta el equipo solo.
 * - forgetPushDevice(): al cerrar sesión, el equipo deja de recibir los avisos de esa cuenta.
 */

type State = "loading" | "unsupported" | "ios-install" | "server-off" | "denied" | "off" | "on";

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || !!(navigator as { standalone?: boolean }).standalone;

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (reg) return reg;
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

async function save(sub: PushSubscription) {
  const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "No se pudo activar");
}

/** Pide permiso (si hace falta), conecta el equipo y lo guarda para esta cuenta */
async function subscribe(key: string) {
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") throw new Error(perm === "denied" ? "Bloqueaste las notificaciones en este navegador" : "No diste el permiso");
  const reg = await registration();
  let sub: PushSubscription;
  try {
    sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  } catch {
    // Ventana de incógnito / privada, o el navegador no tiene servicio de avisos
    throw new Error("Este navegador no permite notificaciones aquí (¿ventana de incógnito?). Ábrelo en una ventana normal o en la app instalada.");
  }
  await save(sub);
}

export async function forgetPushDevice() {
  if (!supported()) return;
  try {
    const sub = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  } catch { /* sin service worker: nada que olvidar */ }
}

function usePush() {
  const [state, setState] = useState<State>("loading");
  const [key, setKey] = useState("");
  const refresh = useCallback(async () => {
    if (!supported()) return setState(isIos() && !standalone() ? "ios-install" : "unsupported");
    const j = await fetch("/api/push").then((r) => r.json()).catch(() => null);
    if (!j?.ready) return setState("server-off");
    setKey(j.key);
    if (Notification.permission === "denied") return setState("denied");
    const sub = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
    setState(sub && Notification.permission === "granted" ? "on" : "off");
    return { sub, key: j.key as string };
  }, []);
  useEffect(() => { const t = setTimeout(refresh, 0); return () => clearTimeout(t); }, [refresh]);
  return { state, key, refresh };
}

export function PushCard() {
  const { state, key, refresh } = usePush();
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); } catch (e) { toast.danger((e as Error).message); }
    setBusy(false); refresh();
  };
  if (state === "loading") return null;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><BellRing className="h-4 w-4" /> Notificaciones en este equipo</h3>
      <p className="text-[12px] text-sb-on-surface-variant">Como las de WhatsApp: te avisan aunque tengas el sistema cerrado o el celular bloqueado. Se activan en cada equipo.</p>
      {state === "on" && (
        <>
          <p className="flex items-center gap-2 rounded-xl bg-sb-primary-soft px-3 py-2 text-sm"><Bell className="h-4 w-4 text-sb-primary" /> <b>Activadas</b> en este equipo.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="rounded-full" isDisabled={busy} onPress={() => act(async () => {
              const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test" }) });
              if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "No se pudo enviar");
            }, "Aviso enviado por internet: debe aparecer en unos segundos")}><Send className="h-4 w-4" /> Enviar prueba</Button>
            <Button variant="ghost" className="rounded-full" isDisabled={busy} onPress={() => act(async () => {
              // Sin pasar por internet: si este tampoco aparece, lo está bloqueando el navegador o el sistema del equipo
              const reg = await registration();
              await reg.showNotification("Prueba en este equipo", { body: "Si ves esto, tu equipo sí muestra los avisos de System Tracking.", icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", tag: "prueba-local" });
            }, "Aviso mostrado en este equipo")}><Bell className="h-4 w-4" /> Probar sin internet</Button>
            <Button variant="ghost" className="rounded-full" isDisabled={busy} onPress={() => act(forgetPushDevice, "Notificaciones desactivadas en este equipo")}><BellOff className="h-4 w-4" /> Desactivar</Button>
          </div>
          <details className="rounded-xl bg-sb-surface-container-low px-3 py-2 text-[12px]">
            <summary className="cursor-pointer font-semibold">¿No te aparecen?</summary>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sb-on-surface-variant">
              <li><b>Computadora:</b> el navegador debe estar abierto (aunque sea minimizado). Revisa que el modo «No molestar» esté apagado y que Chrome tenga permiso en la configuración de notificaciones del sistema (Windows: Configuración → Notificaciones · Linux: Configuración → Notificaciones → Google Chrome · Mac: Ajustes → Notificaciones → Chrome).</li>
              <li><b>Android:</b> Ajustes → Apps → Chrome (o la app instalada) → Notificaciones: activadas. Quita el ahorro de batería extremo.</li>
              <li><b>iPhone:</b> solo funciona desde la app agregada al inicio (no desde Safari) y con iOS 16.4 o más nuevo.</li>
              <li>Si «Probar sin internet» tampoco aparece, el bloqueo es del navegador o del equipo, no del sistema.</li>
            </ul>
          </details>
        </>
      )}
      {state === "off" && (
        <Button variant="primary" className="self-start rounded-full" isDisabled={busy} onPress={() => act(() => subscribe(key), "Listo: te llegarán los avisos")}>
          <Bell className="h-4 w-4" /> {busy ? "Activando…" : "Activar notificaciones"}
        </Button>
      )}
      {state === "denied" && <p className="rounded-xl bg-sb-late-soft/60 px-3 py-2 text-[12px]">Las bloqueaste en este navegador. Toca el candado junto a la dirección → <b>Notificaciones → Permitir</b>, y vuelve a esta página.</p>}
      {state === "ios-install" && <p className="rounded-xl bg-sb-surface-container-low px-3 py-2 text-[12px]">En iPhone y iPad primero <b>agrega la app a tu inicio</b> (Compartir → «Agregar a inicio»), ábrela desde ahí y vuelve a esta página.</p>}
      {state === "unsupported" && <p className="text-[12px] text-sb-on-surface-variant">Este navegador no permite notificaciones. Usa Chrome, Edge o Safari actualizado.</p>}
      {state === "server-off" && <p className="text-[12px] text-sb-on-surface-variant">Las notificaciones aún no están configuradas en el servidor.</p>}
    </Card>
  );
}

const NUDGE = "push-nudge";

/** Invita a activar las notificaciones (una vez por semana) y reconecta el equipo si el permiso ya estaba dado */
export function PushNudge() {
  const [show, setShow] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supported()) return;
    let alive = true;
    const t = setTimeout(async () => {
      const j = await fetch("/api/push").then((r) => r.json()).catch(() => null);
      if (!alive || !j?.ready) return;
      setKey(j.key);
      const perm = Notification.permission;
      if (perm === "granted") {
        // Permiso ya dado (o cambió la cuenta en este equipo): se conecta solo
        subscribe(j.key).catch(() => {});
        return;
      }
      if (perm === "default") {
        let last = 0;
        try { last = Number(localStorage.getItem(NUDGE) ?? 0); } catch {}
        if (Date.now() - last > 7 * 864e5) setShow(true);
      }
    }, 2500);
    return () => { alive = false; clearTimeout(t); };
  }, []);
  const close = () => { try { localStorage.setItem(NUDGE, String(Date.now())); } catch {} setShow(false); };
  if (!show) return null;
  return (
    <div role="dialog" aria-label="Activar notificaciones" className="fixed right-3 top-3 z-[60] flex w-[min(24rem,calc(100vw-1.5rem))] items-start gap-3 rounded-2xl bg-sb-surface p-3 shadow-2xl ring-1 ring-sb-outline-variant/50">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sb-primary text-sb-on-primary"><BellRing className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1 text-[13px] leading-snug">
        <p className="font-semibold">¿Te avisamos al instante?</p>
        <p className="text-sb-on-surface-variant">Recibe los avisos de tu trabajo aunque tengas el sistema cerrado, como en WhatsApp.</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="primary" className="rounded-full" isDisabled={busy} onPress={async () => {
            setBusy(true);
            try { await subscribe(key); toast.success("Listo: te llegarán los avisos"); setShow(false); } catch (e) { toast.danger((e as Error).message); close(); }
            setBusy(false);
          }}><Bell className="h-3.5 w-3.5" /> Activar</Button>
          <Button size="sm" variant="ghost" className="rounded-full" onPress={close}>Ahora no</Button>
        </div>
      </div>
      <button type="button" onClick={close} aria-label="Cerrar" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sb-on-surface-variant hover:text-sb-on-surface"><X className="h-4 w-4" /></button>
    </div>
  );
}
