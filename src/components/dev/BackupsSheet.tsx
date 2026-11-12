"use client";
import { useEffect, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Archive, CloudOff, Download, HardDriveDownload, ShieldCheck } from "lucide-react";
import { Sheet } from "@/components/modal/Sheet";

type Info = { target: "supabase" | "local" | "none"; files: { name: string; bytes: number; at: string }[]; last: { action: string; detail: string | null; at: string } | null };
const mb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Respaldos completos de la base: el automático de cada día, respaldar ahora y descargar */
export function BackupsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/dev/backup").then((r) => r.json()).then((j) => alive && setInfo(j)).catch(() => {});
    return () => { alive = false; };
  }, [open, again]);

  async function now() {
    setBusy(true);
    const r = await fetch("/api/dev/backup", { method: "POST" });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setBusy(false);
    if (!r.ok) return toast.danger(j.error);
    toast.success("Respaldo listo", { description: `${j.name} · ${j.tables} tablas · ${Number(j.rows).toLocaleString("es-PE")} filas · ${mb(j.bytes)}` });
    setAgain((x) => x + 1);
  }

  const failed = info?.last?.action.includes("falló");
  return (
    <Sheet open={open} onClose={onClose} size="md" icon={Archive} title="Respaldos de la base"
      sub="Copia completa cada día a las 3:00 a. m. (hora de Perú) · se guardan los últimos 30 días"
      footer={<Button variant="primary" className="rounded-full" onPress={now} isDisabled={busy || info?.target === "none"}><HardDriveDownload className="h-4 w-4" />{busy ? "Respaldando…" : "Respaldar ahora"}</Button>}>
      {!info ? <div className="h-24 animate-pulse rounded-2xl bg-sb-surface-container-low" /> : (
        <div className="flex flex-col gap-3">
          {info.target === "none" ? (
            <div className="flex gap-3 rounded-2xl bg-sb-late-soft p-3 text-xs text-sb-late">
              <CloudOff className="h-4 w-4 shrink-0" />
              <p><b>Los respaldos automáticos no están activos.</b> En Vercel agrega <code>SUPABASE_URL</code> y <code>SUPABASE_SERVICE_ROLE_KEY</code> (Supabase → Project Settings → API) y vuelve a desplegar.</p>
            </div>
          ) : (
            <div className={`flex gap-3 rounded-2xl p-3 text-xs ${failed ? "bg-sb-late-soft text-sb-late" : "bg-sb-primary-soft text-sb-on-surface"}`}>
              <ShieldCheck className={`h-4 w-4 shrink-0 ${failed ? "" : "text-sb-primary"}`} />
              <p>
                {info.last ? <><b>{failed ? "El último respaldo falló" : "Último respaldo"}</b> · {info.last.at}{info.last.detail ? ` · ${info.last.detail}` : ""}</> : <b>Todavía no hay respaldos: haz el primero.</b>}
                <span className="block text-[11px] opacity-75">{info.target === "supabase" ? "Se guardan en un bucket privado de Supabase Storage." : "En esta PC se guardan en data/respaldos."}</span>
              </p>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {info.files.map((f) => (
              <a key={f.name} href={`/api/dev/backup?file=${encodeURIComponent(f.name)}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs transition-colors hover:bg-sb-surface-container-low">
                <Archive className="h-4 w-4 shrink-0 text-sb-on-surface-variant" />
                <span className="min-w-0 flex-1 truncate font-mono">{f.name}</span>
                <span className="shrink-0 tabular-nums text-sb-on-surface-variant">{mb(f.bytes)}</span>
                <Download className="h-3.5 w-3.5 shrink-0 text-sb-on-surface-variant" />
              </a>
            ))}
            {info.target !== "none" && !info.files.length && <p className="py-4 text-center text-xs text-sb-on-surface-variant">Sin respaldos guardados todavía.</p>}
          </div>
          <p className="text-[11px] text-sb-on-surface-variant">Para restaurar uno en tu PC: <code className="rounded bg-sb-surface-container px-1">npm run db:restaurar -- archivo.json.gz --confirmar</code> (borra los datos actuales y pone los del respaldo).</p>
        </div>
      )}
    </Sheet>
  );
}
