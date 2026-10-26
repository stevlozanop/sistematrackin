"use client";
import { useRef, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Camera, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";

/** URL del logo; v cambia cada vez que se sube uno nuevo (así el navegador no muestra el anterior). */
export const logoUrl = (id: number, v: string | number | null | undefined) => (v ? `/api/companies/logo?id=${id}&v=${v}` : null);

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 2);

/** Logo redondo de una empresa, o sus iniciales si todavía no tiene. */
export function LogoBadge({ id, name, v, className }: { id: number; name: string; v?: string | number | null; className?: string }) {
  const url = logoUrl(id, v);
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-sb-primary font-bold text-sb-on-primary", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- imagen servida por nuestra API desde la base */}
      {url ? <img src={url} alt={`Logo de ${name}`} className="h-full w-full bg-white object-cover" /> : initials(name)}
    </span>
  );
}

/** Recorta al centro en cuadrado y reduce a 256 px (WEBP), para que pese poco. */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; // los PNG transparentes quedan sobre blanco
  ctx.fillRect(0, 0, 256, 256);
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  const webp = c.toDataURL("image/webp", 0.88);
  return webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/png");
}

/** Logo con botones para cambiarlo o quitarlo. onChange recibe la nueva versión (o null si se quitó). */
export function LogoPicker({ id, name, v, onChange, size = "lg" }: {
  id: number; name: string; v?: string | number | null; onChange: (v: string | null) => void; size?: "md" | "lg";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) return toast.danger("Elige una imagen");
    setBusy(true);
    try {
      const dataUrl = await shrink(file);
      const r = await fetch(`/api/companies/logo?id=${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl }) });
      const j = await r.json().catch(() => ({ error: "Error del servidor" }));
      if (!r.ok) return toast.danger(j.error);
      toast.success("Foto actualizada");
      onChange(String(j.v));
    } catch {
      toast.danger("No se pudo leer la imagen");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    const r = await fetch(`/api/companies/logo?id=${id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return toast.danger("No se pudo quitar");
    toast.success("Foto quitada");
    onChange(null);
  }

  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label={`Cambiar la foto de ${name}`}
        className="group relative shrink-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-sb-primary">
        <LogoBadge id={id} name={name} v={v} className={cn("rounded-2xl", size === "lg" ? "h-16 w-16 text-lg" : "h-11 w-11 text-sm")} />
        <span className="absolute inset-0 grid place-items-center rounded-2xl bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Camera className="h-4 w-4" />
        </span>
      </button>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" className="rounded-full" isDisabled={busy} onPress={() => input.current?.click()}>
          <Camera className="h-3.5 w-3.5" /> {busy ? "Subiendo…" : v ? "Cambiar foto" : "Subir foto"}
        </Button>
        {v && (
          <Button size="sm" variant="tertiary" className="rounded-full" isDisabled={busy} onPress={remove}>
            <Trash2 className="h-3.5 w-3.5" /> Quitar
          </Button>
        )}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </div>
  );
}
