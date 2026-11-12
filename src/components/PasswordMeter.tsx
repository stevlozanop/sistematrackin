"use client";
import { Check, X } from "lucide-react";
import { passwordChecks } from "@/lib/password";
import { cn } from "@/lib/cn";

/** Requisitos de la contraseña mientras se escribe, con una barra de fuerza */
export function PasswordMeter({ value, email, name }: { value: string; email?: string | null; name?: string | null }) {
  if (!value) return null;
  const checks = passwordChecks(value, { email, name });
  const ok = checks.filter((c) => c.ok).length;
  const strong = ok === checks.length && value.length >= 12;
  const tone = ok === checks.length ? (strong ? "bg-sb-primary" : "bg-sb-ontime") : ok >= 2 ? "bg-amber-500" : "bg-sb-late";
  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <div className="flex items-center gap-2">
        <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-sb-surface-container-high">
          <span className={cn("rounded-full transition-[width,background-color] duration-300", tone)} style={{ width: `${strong ? 100 : (ok / checks.length) * 85}%` }} />
        </span>
        <span className="text-[10px] font-semibold text-sb-on-surface-variant">{ok < checks.length ? "Insegura" : strong ? "Muy segura" : "Segura"}</span>
      </div>
      <ul className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.label} className={cn("flex items-center gap-1 text-[11px]", c.ok ? "text-sb-on-surface-variant" : "text-sb-late")}>
            {c.ok ? <Check className="h-3 w-3 text-sb-primary" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}{c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
