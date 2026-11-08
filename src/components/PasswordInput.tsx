"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Campo de contraseña con un ojito para verla u ocultarla.
 * Recibe los mismos atributos que un <input>; el ícono queda dentro del campo, a la derecha.
 */
export function PasswordInput({ className, iconClassName, ...p }: Omit<React.ComponentProps<"input">, "type"> & { iconClassName?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative w-full">
      <input {...p} type={show ? "text" : "password"} className={cn(className, "pr-11")} />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Ocultar contraseña" : "Ver contraseña"} aria-pressed={show} tabIndex={-1}
        className={cn("absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100", iconClassName)}>
        {show ? <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <Eye className="h-[18px] w-[18px]" strokeWidth={1.75} />}
      </button>
    </div>
  );
}
