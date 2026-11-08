"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LogOut, RefreshCw, Wrench } from "lucide-react";

/**
 * Pantalla de mantenimiento: reemplaza todo el sistema mientras The Iceberg Labs trabaja en la plataforma.
 * Pregunta cada 5 s si ya terminó: apenas se apaga el mantenimiento, entra solo.
 */
export function MaintenanceWall({ message, until }: { message: string; until: string | null }) {
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const check = () => {
      if (document.hidden) return;
      setChecking(true);
      fetch("/api/platform", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (j && !j.maintenance) window.location.reload();
      }).catch(() => {}).finally(() => setTimeout(() => setChecking(false), 600));
    };
    const t = setInterval(check, 5000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", check); };
  }, []);
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.replace("/login"); };
  const hour = until ? until.slice(11, 16) : null;
  return (
    <main className="grid min-h-dvh place-items-center bg-sb-background px-6 text-sb-on-surface">
      <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
        className="w-full max-w-md rounded-3xl border border-sb-outline-variant bg-sb-surface p-8 text-center shadow-xl">
        <motion.span animate={{ rotate: [0, -14, 10, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sb-primary-soft text-sb-primary">
          <Wrench className="h-6 w-6" />
        </motion.span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Sistema en mantenimiento</h1>
        <p className="mt-3 text-sm leading-relaxed text-sb-on-surface-variant">{message}</p>
        {hour && <p className="mt-3 inline-flex rounded-full bg-sb-surface-container px-3 py-1 text-xs font-semibold">Volvemos aprox. a las {hour}</p>}
        <p className="mt-6 flex items-center justify-center gap-2 text-[11px] text-sb-on-surface-variant">
          <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} /> Se revisa sola: cuando terminemos, entrarás automáticamente.
        </p>
        <button type="button" onClick={logout} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-sb-outline-variant py-2.5 text-sm font-medium transition-colors hover:bg-sb-surface-container-high">
          <LogOut className="h-4 w-4" /> Salir
        </button>
      </motion.div>
    </main>
  );
}
