"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, ChevronDown, LayoutGrid, LogOut, Moon, Palette, RotateCw, Sun, Upload, type LucideIcon } from "lucide-react";
import { AppearancePicker } from "@/components/LookCard";
import { cn } from "@/lib/cn";

export type MobileItem = { title: string; href: string; icon: LucideIcon };

const SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;

/** Ícono suelto de la fila; el activo se vuelve una píldora ancha del color de acento que se desliza entre opciones */
function NavButton({ item, active, onGo }: { item: MobileItem; active: boolean; onGo: () => void }) {
  return (
    <motion.button type="button" onClick={onGo} aria-label={item.title} aria-current={active ? "page" : undefined} whileTap={{ scale: 0.9 }}
      animate={{ width: active ? 60 : 44 }} transition={SPRING}
      className={cn("relative flex h-11 shrink-0 items-center justify-center", active ? "text-sb-on-primary" : "text-sb-on-surface")}>
      {active && <motion.span layoutId="m-nav-pill" className="absolute inset-0 rounded-full bg-sb-primary shadow-[0_8px_22px_-8px_var(--sb-primary)]" transition={SPRING} />}
      <motion.span className="relative z-10" animate={{ scale: active ? 1.08 : 1, opacity: active ? 1 : 0.7 }} transition={{ duration: 0.2 }}>
        <item.icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.4 : 2} />
      </motion.span>
    </motion.button>
  );
}

/**
 * Navegación del celular (como Stepbro): íconos sueltos abajo a la izquierda, la opción activa como píldora de color,
 * y un botón redondo a la derecha que crece hasta la tarjeta «Opciones» (resto del menú, Apariencia, tema, recargar, salir).
 */
export function MobileNav({
  items, activeHref, maxVisible = 4, dark, onToggleTheme, onLogout, onGuide, onUpload,
}: {
  items: MobileItem[]; activeHref: string; maxVisible?: number; dark: boolean; onToggleTheme: () => void; onLogout: () => void; onGuide?: () => void;
  /** «Subir Excel»: un ícono más de la fila, con fondo suave del color */
  onUpload?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [look, setLook] = useState(false);
  const [height, setHeight] = useState(48);
  const morph = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);

  // Con el botón de Excel entra un ícono menos de navegación (cabe en 360 px)
  const shown = onUpload ? maxVisible - 1 : maxVisible;
  const visible = items.slice(0, shown);
  const extra = items.slice(shown);
  const isActive = (i: MobileItem) => activeHref === i.href;
  const close = () => { setOpen(false); setLook(false); };

  useLayoutEffect(() => {
    if (open && menu.current) setHeight(Math.min(Math.max(menu.current.scrollHeight + (foot.current?.offsetHeight ?? 0), 48), Math.round(window.innerHeight * 0.72)));
  }, [open, look, extra.length]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => morph.current && !morph.current.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const row = "sb-pill-sm flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-sb-on-surface-variant hover:bg-sb-surface-container hover:text-sb-on-surface";

  return (
    <div className="md:hidden">
      {/* Velo suave abajo para que los íconos se lean sobre el contenido */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[59] h-28 bg-gradient-to-t from-[var(--page-bg)] via-[color-mix(in_oklab,var(--page-bg)_80%,transparent)] to-transparent" />
      <motion.nav className="mobile-navbar fixed left-0 right-0 z-[60]"
        initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 400, damping: 32, mass: 0.6, delay: 0.1 }}>
        <div className="mobile-nav-inner relative flex w-full items-end justify-between gap-2 px-4">
          {/* Al abrir Opciones los íconos de la izquierda se apartan: la tarjeta queda limpia, sin nada encima */}
          <div className={cn("flex items-center gap-1 transition-[opacity,transform,filter] duration-300", open && "pointer-events-none -translate-x-3 opacity-0 blur-[2px]")} aria-hidden={open || undefined}>
            {visible.map((i) => <NavButton key={i.href} item={i} active={isActive(i)} onGo={() => router.push(i.href)} />)}
            {onUpload && (
              <motion.button type="button" onClick={onUpload} aria-label="Subir Excel" whileTap={{ scale: 0.9 }}
                className="sb-pill-icon ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sb-primary-soft text-sb-primary ring-1 ring-sb-primary/25">
                <Upload className="h-[18px] w-[18px]" strokeWidth={2.4} />
              </motion.button>
            )}
          </div>

          <div className="relative bottom-0">
            <div ref={morph} className="t-morph m-options" data-open={open ? "true" : "false"} style={open ? { height } : undefined}>
              <div className="t-morph-menu flex flex-col" role="menu">
                <div className="scroll-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div ref={menu} className="flex flex-col gap-0.5 p-3 pb-2">
                  <p className="px-2.5 pb-2 pt-1 text-xl font-semibold tracking-tight">Opciones</p>
                  <button type="button" onClick={() => setLook((v) => !v)} aria-expanded={look} className={row}>
                    <Palette className="h-4 w-4 shrink-0" /><span className="flex-1">Apariencia</span>
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300", look && "rotate-180")} />
                  </button>
                  <AnimatePresence initial={false}>
                    {look && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                        <div className="mx-1 my-1 rounded-2xl bg-sb-surface p-3"><AppearancePicker compact /></div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {onGuide && (
                    <button type="button" onClick={() => { close(); onGuide(); }} className={row}><BookOpen className="h-4 w-4 shrink-0" />Guía del sistema</button>
                  )}
                  <button type="button" onClick={() => location.reload()} className={row}><RotateCw className="h-4 w-4 shrink-0" />Recargar app</button>
                  {!!extra.length && <p className="px-2.5 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">Más pantallas</p>}
                  {extra.map((i) => (
                    <button key={i.href} type="button" onClick={() => { close(); router.push(i.href); }}
                      className={cn(row, isActive(i) && "bg-sb-primary font-semibold text-sb-on-primary hover:bg-sb-primary hover:text-sb-on-primary")}>
                      <i.icon className="h-4 w-4 shrink-0" />{i.title}
                    </button>
                  ))}
                </div>
                </div>
                {/* Pie fijo: tema y cerrar sesión siempre a la vista, aunque la lista sea larga */}
                <div ref={foot} className="flex shrink-0 items-center gap-2 border-t border-sb-outline-variant/60 p-2.5">
                  <div className="flex flex-1 rounded-full bg-sb-surface-container p-0.5" role="group" aria-label="Tema">
                    {([[false, "Claro", Sun], [true, "Oscuro", Moon]] as const).map(([d, l, Icon]) => (
                      <button key={l} type="button" onClick={() => dark !== d && onToggleTheme()} aria-pressed={dark === d}
                        className={cn("sb-pill-xs flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-semibold", dark === d ? "bg-sb-surface text-sb-on-surface shadow-sm" : "text-sb-on-surface-variant")}>
                        <Icon className="h-3.5 w-3.5" />{l}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => { close(); onLogout(); }} aria-label="Cerrar sesión"
                    className="sb-pill-sm flex shrink-0 items-center gap-1.5 rounded-full bg-sb-late-soft px-2.5 py-2 text-[11px] font-semibold text-sb-late">
                    <LogOut className="h-3.5 w-3.5" />Salir
                  </button>
                </div>
              </div>
              <button type="button" className="t-morph-plus" aria-expanded={open} aria-label="Opciones"
                onClick={(e) => { e.stopPropagation(); if (open) close(); else setOpen(true); }}>
                <LayoutGrid className="h-5 w-5 text-sb-on-surface" />
              </button>
            </div>
          </div>
        </div>
      </motion.nav>
    </div>
  );
}
