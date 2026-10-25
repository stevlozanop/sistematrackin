"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BookOpen, LogOut, MoreHorizontal, Moon, Sun, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type MobileItem = { title: string; href: string; icon: LucideIcon };

function NavButton({ item, active, onGo }: { item: MobileItem; active: boolean; onGo: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onGo}
      className={cn("relative flex h-12 w-12 items-center justify-center", active ? "text-sb-on-primary" : "text-sb-on-surface")}
      aria-label={item.title}
      aria-current={active ? "page" : undefined}
      whileTap={{ scale: 0.9 }}
    >
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ borderRadius: 999, backgroundColor: active ? "var(--sb-primary)" : "rgba(0,0,0,0)" }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      />
      <motion.div
        className="relative z-10 flex items-center justify-center"
        animate={{ scale: active ? 1.1 : 1, opacity: active ? 1 : 0.8 }}
        transition={{ duration: 0.2 }}
      >
        <item.icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
      </motion.div>
    </motion.button>
  );
}

/** Barra inferior móvil: cápsula con iconos + botón «más» que se transforma en menú (morph). */
export function MobileNav({
  items, activeHref, maxVisible = 4, dark, onToggleTheme, onLogout, onGuide,
}: {
  items: MobileItem[]; activeHref: string; maxVisible?: number; dark: boolean; onToggleTheme: () => void; onLogout: () => void; onGuide: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(56);
  const morph = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const visible = items.slice(0, maxVisible);
  const extra = items.slice(maxVisible);
  const isActive = (i: MobileItem) => activeHref === i.href || activeHref.startsWith(i.href + "/");

  useLayoutEffect(() => {
    if (open && menu.current) setHeight(Math.min(Math.max(menu.current.scrollHeight, 56), 420));
  }, [open, extra.length]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => morph.current && !morph.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const row = "flex w-full items-center gap-3 rounded-full px-3 py-2 text-left text-sm transition-colors";
  const icon = "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sb-surface-container-high text-sb-on-surface-variant";

  return (
    <div className="md:hidden">
      <motion.nav
        className="mobile-navbar fixed left-0 right-0 z-[60]"
        initial={{ y: 100, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 32, mass: 0.6, delay: 0.1 }}
      >
        <div className="mobile-nav-inner relative flex w-full items-end justify-between px-3">
          <div className="mobile-nav-buttons relative flex items-center justify-around gap-1 rounded-[50px] border border-sb-outline-variant bg-sb-surface-container-high/90 px-2 py-1.5 shadow-lg backdrop-blur-xl">
            {visible.map((i) => <NavButton key={i.href} item={i} active={isActive(i)} onGo={() => router.push(i.href)} />)}
          </div>

          <div className="relative bottom-0">
            <div ref={morph} className="t-morph" data-open={open ? "true" : "false"} style={open ? { height } : undefined}>
              <div ref={menu} className="t-morph-menu max-h-[70vh] overflow-y-auto" role="menu">
                <div className="p-2">
                  {extra.map((i) => (
                    <button key={i.href} type="button" onClick={() => { setOpen(false); router.push(i.href); }}
                      className={cn(row, isActive(i) ? "bg-sb-primary font-medium text-sb-on-primary" : "text-sb-on-surface hover:bg-sb-surface-container-high")}>
                      <span className={icon}><i.icon className="h-4 w-4" /></span>
                      {i.title}
                    </button>
                  ))}
                  <button type="button" onClick={() => { setOpen(false); onGuide(); }} className={cn(row, "text-sb-on-surface hover:bg-sb-surface-container-high")}>
                    <span className={icon}><BookOpen className="h-4 w-4" /></span>
                    Guía del sistema
                  </button>
                  <button type="button" onClick={() => { onToggleTheme(); }} className={cn(row, "text-sb-on-surface hover:bg-sb-surface-container-high")}>
                    <span className={icon}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</span>
                    {dark ? "Tema claro" : "Tema oscuro"}
                  </button>
                  <div className="my-1 h-px bg-sb-outline-variant" />
                  <button type="button" onClick={() => { setOpen(false); onLogout(); }} className={cn(row, "text-red-500 hover:bg-red-500/10 hover:text-red-600")}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-500"><LogOut className="h-4 w-4" /></span>
                    Cerrar sesión
                  </button>
                </div>
              </div>
              <button type="button" className="t-morph-plus" aria-expanded={open} aria-label="Más opciones"
                onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
                <MoreHorizontal className="h-5 w-5 text-sb-on-surface" />
              </button>
            </div>
          </div>
        </div>
      </motion.nav>
    </div>
  );
}
