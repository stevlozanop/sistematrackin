"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { BookOpen, ChevronDown, LayoutGrid, LogOut, Moon, Palette, RotateCw, Sun, Upload, type LucideIcon } from "lucide-react";
import { AppearancePicker } from "@/components/LookCard";
import { cn } from "@/lib/cn";

export type MobileItem = { title: string; href: string; icon: LucideIcon };

const SPRING = { type: "spring", stiffness: 520, damping: 38 } as const;

/** Nombre corto para la pestaña: «3 · Stock en almacén» → «Stock», «Dashboard general» → «Dashboard», «PCL · Pucallpa» → «PCL» */
export function shortTitle(t: string) {
  const s = t.replace(/^(PCL |YUR )?\d+\s*·\s*/, "").split(" · ")[0].trim();
  return s.length > 10 ? s.split(" ")[0] : s;
}

/** Vibración corta al tocar (en los celulares que la permiten) */
const tick = () => { try { navigator.vibrate?.(8); } catch {} };

/** Pestaña: ícono con su cápsula de color cuando está activa y el nombre debajo (como las apps del celular) */
function Tab({ icon: Icon, label, active, onPress, tone }: { icon: LucideIcon; label: string; active?: boolean; onPress: () => void; tone?: boolean }) {
  return (
    <motion.button type="button" onClick={() => { tick(); onPress(); }} aria-label={label} aria-current={active ? "page" : undefined} whileTap={{ scale: 0.88 }}
      className={cn("m-tab relative flex min-w-0 flex-1 flex-col items-center gap-0.5 pb-1 pt-1.5", active ? "text-sb-primary" : tone ? "text-sb-primary" : "text-sb-on-surface-variant")}>
      <span className="relative grid h-8 w-14 max-w-full place-items-center">
        {active && <motion.span layoutId="m-tab-pill" className="absolute inset-0 rounded-full bg-sb-primary-soft" transition={SPRING} />}
        {tone && !active && <span className="absolute inset-0 rounded-full bg-sb-primary-soft/70" />}
        <Icon className="relative h-[21px] w-[21px]" strokeWidth={active ? 2.4 : 2} />
      </span>
      <span className={cn("max-w-full truncate px-0.5 text-[10.5px] leading-tight", active ? "font-semibold text-sb-on-surface" : "font-medium")}>{label}</span>
    </motion.button>
  );
}

/**
 * Navegación del celular como en una app: barra de pestañas fija abajo (ícono y nombre), con la pantalla actual
 * resaltada, «Subir» si corresponde y «Más», que abre una hoja desde abajo (se cierra deslizándola hacia abajo)
 * con el resto de pantallas en cuadrícula, Apariencia, guía, tema y salir.
 */
export function MobileNav({
  items, groups, activeHref, dark, onToggleTheme, onLogout, onGuide, onUpload,
}: {
  items: MobileItem[];
  /** Secciones del menú: en «Más» las pantallas van agrupadas con su título (Ruta Pucallpa, Ruta Yurimaguas…) */
  groups?: { title: string; items: MobileItem[] }[]; activeHref: string; maxVisible?: number; dark: boolean; onToggleTheme: () => void; onLogout: () => void; onGuide?: () => void;
  /** «Subir Excel»: una pestaña más, con fondo suave del color */
  onUpload?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [look, setLook] = useState(false);
  const shown = onUpload ? 3 : 4;
  // Si la pantalla actual no está entre las primeras, ocupa el último lugar (siempre se ve dónde estás)
  const cur = items.find((i) => i.href === activeHref);
  let visible = items.slice(0, shown);
  if (cur && !visible.includes(cur)) visible = [...visible.slice(0, shown - 1), cur];
  const extra = items.filter((i) => !visible.includes(i));
  const close = () => { setOpen(false); setLook(false); };
  const go = (href: string) => { close(); router.push(href); };

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);
  const onDragEnd = (_: unknown, info: PanInfo) => { if (info.offset.y > 90 || info.velocity.y > 500) close(); };

  const row = "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] text-sb-on-surface active:bg-sb-surface-container";

  return (
    <div className="md:hidden">
      <nav className="m-tabbar fixed inset-x-0 bottom-0 z-[60]" aria-label="Navegación">
        <div className="flex items-stretch px-1.5">
          {visible.map((i) => <Tab key={i.href} icon={i.icon} label={shortTitle(i.title)} active={i.href === activeHref} onPress={() => go(i.href)} />)}
          {onUpload && <Tab icon={Upload} label="Subir" tone onPress={() => { close(); onUpload(); }} />}
          <Tab icon={LayoutGrid} label="Más" active={open} onPress={() => (open ? close() : setOpen(true))} />
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <>
            <motion.div key="veil" className="fixed inset-0 z-[58] bg-black/25 backdrop-blur-[2px]" onClick={close}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
            <motion.div key="sheet" role="dialog" aria-label="Más opciones" className="m-sheet fixed inset-x-0 bottom-0 z-[59] flex max-h-[86dvh] flex-col"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 420, damping: 40 }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={onDragEnd}>
              <div className="flex shrink-0 justify-center pb-1 pt-2.5"><span className="h-1.5 w-10 rounded-full bg-sb-on-surface/20" /></div>
              <div className="scroll-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3" onPointerDownCapture={(e) => e.stopPropagation()}>
                {(groups ?? [{ title: "Más pantallas", items: extra }]).map((g) => ({ ...g, items: g.items.filter((i) => extra.includes(i)) })).filter((g) => g.items.length).map((g) => (
                  <div key={g.title}>
                    <p className="px-2 pb-2 pt-3 text-[13px] font-semibold text-sb-on-surface-variant first:pt-1">{g.title}</p>
                    <div className="grid grid-cols-3 gap-2 min-[400px]:grid-cols-4">
                      {g.items.map((i) => (
                        <motion.button key={i.href} type="button" whileTap={{ scale: 0.93 }} onClick={() => { tick(); go(i.href); }}
                          aria-current={i.href === activeHref ? "page" : undefined}
                          className={cn("flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1 py-3 text-center",
                            i.href === activeHref ? "bg-sb-primary-soft text-sb-primary" : "bg-sb-surface-container-low text-sb-on-surface")}>
                          <i.icon className="h-[22px] w-[22px]" />
                          <span className="line-clamp-2 text-[11px] font-medium leading-tight">{i.title.replace(/^\d+\s*·\s*/, "")}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="px-2 pb-1 pt-4 text-[13px] font-semibold text-sb-on-surface-variant">Ajustes</p>
                <div className="rounded-2xl bg-sb-surface-container-low p-1">
                  <button type="button" onClick={() => setLook((v) => !v)} aria-expanded={look} className={row}>
                    <Palette className="h-5 w-5 shrink-0 text-sb-on-surface-variant" /><span className="flex-1">Apariencia</span>
                    <ChevronDown className={cn("h-4 w-4 text-sb-on-surface-variant transition-transform duration-300", look && "rotate-180")} />
                  </button>
                  <AnimatePresence initial={false}>
                    {look && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                        <div className="mx-1 mb-1 rounded-2xl bg-sb-surface p-3"><AppearancePicker compact /></div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {onGuide && <button type="button" onClick={() => { close(); onGuide(); }} className={row}><BookOpen className="h-5 w-5 shrink-0 text-sb-on-surface-variant" />Guía del sistema</button>}
                  <button type="button" onClick={() => location.reload()} className={row}><RotateCw className="h-5 w-5 shrink-0 text-sb-on-surface-variant" />Recargar app</button>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex flex-1 rounded-full bg-sb-surface-container p-1" role="group" aria-label="Tema">
                    {([[false, "Claro", Sun], [true, "Oscuro", Moon]] as const).map(([d, l, Icon]) => (
                      <button key={l} type="button" onClick={() => dark !== d && onToggleTheme()} aria-pressed={dark === d}
                        className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2.5 text-[13px] font-semibold transition-colors", dark === d ? "bg-sb-surface text-sb-on-surface shadow-sm" : "text-sb-on-surface-variant")}>
                        <Icon className="h-4 w-4" />{l}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => { close(); onLogout(); }}
                    className="flex shrink-0 items-center gap-1.5 rounded-full bg-sb-late-soft px-4 py-2.5 text-[13px] font-semibold text-sb-late">
                    <LogOut className="h-4 w-4" />Salir
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
