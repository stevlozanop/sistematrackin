"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Lock, LogOut, RefreshCw } from "lucide-react";

/**
 * Pantalla de licencia bloqueada (suspendida o vencida). Reemplaza todo el sistema para esa empresa.
 * Pregunta cada 4 s si la licencia volvió: apenas The Iceberg Labs la reactiva, entra solo a su pantalla.
 */
export function LicenseWall({ company, message, status }: { company: string | null; message: string; status: "suspended" | "expired" }) {
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const check = () => {
      if (document.hidden) return;
      setChecking(true);
      fetch("/api/license", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (j?.status === "active") window.location.replace("/");
      }).catch(() => {}).finally(() => setTimeout(() => setChecking(false), 600));
    };
    const t = setInterval(check, 4000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", check); };
  }, []);
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.replace("/login"); };
  return (
    <main className="grid min-h-dvh place-items-center bg-sb-background px-6 text-sb-on-surface">
      <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
        className="w-full max-w-md rounded-3xl border border-sb-outline-variant bg-sb-surface p-8 text-center shadow-xl">
        <motion.span initial={{ rotate: -12, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sb-late-soft text-sb-late">
          <Lock className="h-6 w-6" />
        </motion.span>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-sb-on-surface-variant">{company ?? "Tu empresa"}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{status === "expired" ? "Licencia vencida" : "Licencia suspendida"}</h1>
        <p className="mt-3 text-sm leading-relaxed text-sb-on-surface-variant">{message}</p>
        <p className="mt-6 inline-flex items-center gap-2 text-[11px] text-sb-on-surface-variant">
          <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} /> Se revisa sola: cuando se reactive, entrarás automáticamente.
        </p>
        <button type="button" onClick={logout} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-sb-outline-variant py-2.5 text-sm font-medium transition-colors hover:bg-sb-surface-container-high">
          <LogOut className="h-4 w-4" /> Salir
        </button>
      </motion.div>
    </main>
  );
}
