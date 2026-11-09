"use client";
import { useEffect, useState } from "react";
import { TrackingMark } from "@/components/TrackingMark";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Receipt, Sparkles, Activity, Bell, ChartColumn, Container, FileStack, Upload, BookOpen, Building2, ChevronLeft, CalendarClock, Database, FileSpreadsheet, Gauge, KeyRound, HeartPulse, ShieldCheck, TrendingUp, MousePointerClick, SquareTerminal, CircleUser, ClipboardCheck, LayoutDashboard, LogOut, Moon, PackageSearch, Ship, SlidersHorizontal, Store, Sun, Truck, Users, Warehouse, Forklift, PackageCheck, Boxes, MapPinned, Power, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { MobileNav } from "@/components/MobileNav";
import { AlertBell } from "@/components/AlertBell";
import { GuideModal } from "@/components/GuideModal";
import { AssistantPanel } from "@/components/AssistantPanel";
import { LogoBadge } from "@/components/CompanyLogo";

type Co = { id: number; name: string; v: string | null; color?: string | null; kind?: string; code?: string | null } | null;

import { companyCode, roleLabel, type Role } from "@/lib/workflow";
import { UploadCenter, type UploadMode } from "@/components/UploadCenter";
import { CodeTag } from "@/components/ui";
import { LiveSync } from "@/components/LiveSync";
import { PushNudge, forgetPushDevice } from "@/components/PushNotifications";
import { DATA_EVENT } from "@/components/UploadCenter";

type Item = { title: string; href: string; icon: LucideIcon; roles?: Role[]; fields?: string[]; badge?: string };
/** Indicador en vivo junto a una opción del menú: texto y tono (alert = rojo, warn = ámbar, live = punto que late) */
type Badge = { text: string; tone?: "alert" | "warn" | "live" | "muted" };
const SUPER: Role[] = ["admin"];
const READ: Role[] = ["admin", "viewer"]; // ven la operación (viewer = solo lectura, Honda). The Iceberg Labs tiene su propio menú

/**
 * Menú ordenado por lo que hace cada rol:
 * - Encargado: marca su paso (Mi trabajo, embarque y zarpe si es de Iquitos, carga por guía) y ve su módulo.
 * - Empresa (Leyva): cada sección responde una pregunta — Cómo vamos, Dónde está cada moto, Mi equipo,
 *   Para el cliente — con contadores en vivo que dicen dónde mirar. Configuración va plegada.
 * - Honda: Dashboard general, Tablero mensual y Reportes. Cliente: su resumen y sus unidades.
 */
type Section = { title: string; items: Item[]; roles?: Role[]; fold?: boolean };
const SECTIONS: Section[] = [
  {
    title: "Mi trabajo",
    roles: ["operator"],
    items: [
      { title: "Mi trabajo", href: "/my", icon: ClipboardCheck },
      // Solo quien embarca o zarpa en Iquitos
      { title: "Embarque y zarpe", href: "/embarque", icon: Container, fields: ["d_carga", "d_zarpe"] },
      // Solo quien recibe la nave o la ingresa al almacén en destino
      { title: "Arribo e ingreso", href: "/arribo", icon: Warehouse, fields: ["d_arribo", "d_almacen"] },
      { title: "Stock en almacén", href: "/stock", icon: Boxes, fields: ["d_almacen", "d_despacho"] },
      { title: "Despacho", href: "/despacho", icon: Forklift, fields: ["d_despacho"] },
      { title: "Entrega · Conductor", href: "/conductor", icon: Truck, fields: ["d_entrega"] },
      { title: "Carga por guía", href: "/guias", icon: FileStack },
      { title: "PCL · Pucallpa", href: "/units/pcl", icon: Ship },
      { title: "YUR · Yurimaguas", href: "/units/yur", icon: Truck },
    ],
  },
  {
    title: "Mis pedidos",
    roles: ["dealer"],
    items: [
      { title: "Mi resumen", href: "/portal/resumen", icon: LayoutDashboard },
      { title: "Mis unidades", href: "/portal", icon: PackageSearch },
      { title: "Confirmar recepción", href: "/recepcion", icon: PackageCheck },
    ],
  },
  // Leyva y Honda: cada sección responde una pregunta; los contadores dicen dónde mirar
  {
    title: "Cómo vamos",
    roles: READ,
    items: [
      { title: "Dashboard general", href: "/dashboard", icon: LayoutDashboard },
      { title: "Alertas", href: "/alerts", icon: Bell, roles: SUPER, badge: "alerts" },
    ],
  },
  {
    title: "Dónde está cada moto",
    roles: SUPER,
    items: [
      { title: "PCL · Pucallpa", href: "/units/pcl", icon: Ship, badge: "pcl" },
      { title: "YUR · Yurimaguas", href: "/units/yur", icon: Truck, badge: "yur" },
    ],
  },
  {
    // Lo marcan los encargados; la empresa ve quién está conectado y entra para verificar o corregir
    title: "Mi equipo",
    roles: SUPER,
    items: [
      { title: "Encargados en vivo", href: "/live", icon: Activity, badge: "online" },
      { title: "Embarque y zarpe", href: "/embarque", icon: Container },
      { title: "Arribo e ingreso", href: "/arribo", icon: Warehouse },
      { title: "Stock en almacén", href: "/stock", icon: Boxes },
      { title: "Despacho", href: "/despacho", icon: Forklift },
      { title: "Carga por guía", href: "/guias", icon: FileStack },
    ],
  },
  {
    // 6. Entrega: por ahora la empresa prueba aquí el flujo del conductor y del dealer
    title: "Entrega",
    roles: SUPER,
    items: [
      { title: "Detalle de entregas", href: "/entregas", icon: MapPinned },
      { title: "Conductor", href: "/conductor", icon: Truck },
      { title: "Dealer", href: "/recepcion", icon: PackageCheck },
    ],
  },
  {
    title: "Para el cliente",
    roles: READ,
    items: [
      { title: "Tablero mensual", href: "/board", icon: ChartColumn },
      { title: "Detalle de entregas", href: "/entregas", icon: MapPinned, roles: ["viewer"] },
      { title: "Reportes", href: "/reports", icon: FileSpreadsheet },
    ],
  },
  {
    title: "Configuración",
    roles: SUPER,
    fold: true,
    items: [
      { title: "Usuarios", href: "/admins", icon: Users },
      { title: "Dealers", href: "/dealers", icon: Store },
      { title: "Plazos y meta", href: "/settings", icon: SlidersHorizontal },
      { title: "Consorcios", href: "/companies", icon: Building2, roles: ["admin"] },
    ],
  },
];

/**
 * The Iceberg Labs (dev) no ve la operación de Leyva: su menú es la plataforma con datos reales y en tiempo real
 * (conectados, usuarios, interacciones, consumo de la base) y la infraestructura.
 */
const DEV_SECTIONS: Section[] = [
  {
    title: "Plataforma en vivo",
    items: [
      { title: "Dashboard general", href: "/dev", icon: LayoutDashboard },
      { title: "En vivo", href: "/dev/live", icon: Activity, badge: "online" },
      { title: "Usuarios", href: "/dev/users", icon: Users },
      { title: "Interacciones", href: "/dev/activity", icon: MousePointerClick },
    ],
  },
  {
    title: "Producto y seguridad",
    items: [
      { title: "Adopción", href: "/dev/adoption", icon: TrendingUp, badge: "dau" },
      { title: "Seguridad", href: "/dev/security", icon: ShieldCheck, badge: "fails" },
    ],
  },
  {
    title: "Infraestructura",
    items: [
      { title: "Control", href: "/dev/control", icon: Power, badge: "control" },
      { title: "Salud de la base", href: "/dev/health", icon: HeartPulse, badge: "health" },
      { title: "Consumo", href: "/dev/usage", icon: Gauge, badge: "db" },
      { title: "Base de datos", href: "/dev/database", icon: Database },
      { title: "Consola SQL", href: "/dev/sql", icon: SquareTerminal },
    ],
  },
  {
    title: "Clientes de la plataforma",
    items: [
      { title: "Empresas", href: "/companies", icon: Building2 },
      { title: "Licencias", href: "/dev/licenses", icon: KeyRound, badge: "licenses" },
    ],
  },
];

/** Contadores en vivo del menú de Leyva y Honda: cada 15 s y cada vez que cambian los datos */
function useOpsBadges(on: boolean) {
  const [b, setB] = useState<Record<string, Badge>>({});
  useEffect(() => {
    if (!on) return;
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      fetch("/api/badges", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (!alive || !j) return;
        const late = (v: number): Badge => (v ? { text: `${v.toLocaleString("es-PE")} tarde`, tone: "alert" } : { text: "Al día", tone: "muted" });
        const due = j.pcl + j.yur;
        setB({
          pcl: late(j.pcl), yur: late(j.yur),
          alerts: due ? { text: due.toLocaleString("es-PE"), tone: "alert" } : j.soon ? { text: `${j.soon} por vencer`, tone: "warn" } : { text: "0", tone: "muted" },
          online: { text: String(j.online), tone: j.online ? "live" : "muted" },
          license: j.license?.overdue ? { text: "Vencido", tone: "alert" } : j.license?.pending ? { text: "Por pagar", tone: "warn" }
            : j.license?.reported ? { text: "Avisado", tone: "muted" } : { text: "Al día", tone: "muted" },
        });
      }).catch(() => {});
    };
    load();
    const t = setInterval(load, 15000);
    document.addEventListener("visibilitychange", load);
    window.addEventListener(DATA_EVENT, load);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", load); window.removeEventListener(DATA_EVENT, load); };
  }, [on]);
  return b;
}

/** Indicadores en vivo del menú del dev (cada 15 s, solo con la pestaña a la vista) */
function useDevBadges(on: boolean) {
  const [b, setB] = useState<Record<string, Badge>>({});
  useEffect(() => {
    if (!on) return;
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      fetch("/api/dev/badges", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (!alive || !j) return;
        const H = { good: "Bien", warn: "Atención", crit: "Crítico" } as const;
        setB({
          online: { text: String(j.online), tone: j.online ? "live" : "muted" },
          dau: { text: `${j.dau} hoy`, tone: "muted" },
          // Seguridad: ráfaga de intentos (posible ataque) > supervisor desde un dispositivo nuevo > fallidos del día
          fails: j.burst > 10 ? { text: "Ataque", tone: "alert" } : j.adminNew ? { text: "Revisar", tone: "warn" } : j.fails ? { text: `${j.fails} fallidos`, tone: "alert" } : { text: "0", tone: "muted" },
          health: { text: H[j.health as keyof typeof H] ?? "—", tone: j.health === "crit" ? "alert" : j.health === "warn" ? "warn" : "muted" },
          db: { text: `${j.dbPct}%`, tone: j.dbPct >= 85 ? "alert" : j.dbPct >= 70 ? "warn" : "muted" },
          control: j.maintenance ? { text: "Mantenimiento", tone: "alert" } : { text: "Normal", tone: "muted" },
          licenses: j.blocked ? { text: `${j.blocked} bloqueada${j.blocked === 1 ? "" : "s"}`, tone: "alert" } : j.soon ? { text: `${j.soon} por vencer`, tone: "warn" } : { text: "Al día", tone: "muted" },
        });
      }).catch(() => {});
    };
    load();
    const t = setInterval(load, 15000);
    document.addEventListener("visibilitychange", load);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, [on]);
  return b;
}

const PROFILE: Item = { title: "Mi perfil", href: "/profile", icon: CircleUser };
/** La empresa (supervisores): su licencia del sistema, lo que tiene por pagar y avisar sus pagos. Va en «Cuenta» para estar siempre a la vista */
const LICENSE: Item = { title: "Licencia y pagos", href: "/licencia", icon: Receipt, badge: "license" };

const SPRING ={ type: "spring", stiffness: 400, damping: 32, mass: 0.7 } as const;

function NavLink({ item, active, open, badge }: { item: Item; active: boolean; open: boolean; badge?: Badge }) {
  return (
    <Link
      href={item.href}
      title={open ? undefined : item.title}
      className={cn(
        "group flex items-center gap-2.5 transition-colors duration-300 ease-out",
        open ? "h-8 rounded-full px-2.5" : "relative mx-auto h-9 w-9 justify-center",
        active
          ? open ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-primary"
          : "text-sb-on-surface-variant/70 hover:text-sb-on-surface",
      )}
    >
      {!open && (
        <motion.span
          className="absolute inset-0"
          initial={false}
          animate={{ borderRadius: active ? 14 : 999, backgroundColor: active ? "var(--sb-primary)" : "rgba(127,127,127,0)" }}
          whileHover={{ backgroundColor: active ? "var(--sb-primary)" : "rgba(127,127,127,0.12)" }}
          transition={SPRING}
        />
      )}
      <motion.span
        className="relative z-10"
        whileTap={{ scale: 0.9 }}
        animate={{ scale: active ? 1.1 : 1, opacity: active ? 1 : 0.7 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
      >
        <item.icon className="h-[16px] w-[16px] shrink-0" />
      </motion.span>
      {open && (
        <span className={cn("truncate text-[13px] transition-all duration-300 ease-out group-hover:translate-x-1 group-hover:tracking-[0.02em]", active ? "font-medium" : "font-normal")}>
          {item.title}
        </span>
      )}
      {open && badge && (
        <span className={cn("ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums",
          active ? "bg-sb-on-primary/20 text-sb-on-primary"
            : badge.tone === "alert" ? "bg-sb-late-soft text-sb-late"
            : badge.tone === "warn" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            : "bg-sb-surface-container-high text-sb-on-surface-variant")}>
          {badge.tone === "live" && <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" /><span className="relative h-1.5 w-1.5 rounded-full bg-current" /></span>}
          {badge.text}
        </span>
      )}
      {!open && badge && (badge.tone === "alert" || badge.tone === "warn") && (
        <span className={cn("absolute right-0.5 top-0.5 z-20 h-2 w-2 rounded-full ring-2 ring-sb-surface", badge.tone === "alert" ? "bg-sb-late" : "bg-amber-500")} />
      )}
    </Link>
  );
}

function ToolButton({ open, label, onClick, children, muted }: { open: boolean; label: string; onClick: () => void; children: React.ReactNode; muted?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={open ? undefined : label}
      className={cn(
        "group flex items-center gap-2.5 transition-colors duration-300 ease-out hover:bg-sb-surface-container hover:text-sb-on-surface",
        open ? "h-8 w-full rounded-full px-2.5" : "mx-auto h-9 w-9 justify-center rounded-full",
        muted ? "text-sb-on-surface-variant/50" : "text-sb-on-surface-variant/70",
      )}
    >
      {children}
      {open && <span className="truncate text-[13px] transition-all duration-300 ease-out group-hover:translate-x-1 group-hover:tracking-[0.02em]">{label}</span>}
    </button>
  );
}

const Heading = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-sb-on-surface-variant/50">{children}</h3>
);

export function AppShell({ name, role, sites = ["PCL", "YUR"], fields = [], firstGuide = false, brand = null, own = null, swm = false, isOwner = false, upload = null, licenseNotice = null, mustChange = false, children }: {
  name: string; role: Role; sites?: string[]; fields?: string[]; firstGuide?: boolean; brand?: Co; own?: Co; swm?: boolean; isOwner?: boolean; upload?: UploadMode | null; licenseNotice?: { company: string; days: number; date: string } | null; mustChange?: boolean; children: React.ReactNode;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  // Asistente: para la operación (no para la consola The Iceberg Labs). Atajo: Ctrl/⌘ + J
  const hasAssistant = role !== "dev";
  const [assistant, setAssistant] = useState(false);
  useEffect(() => {
    if (!hasAssistant) return;
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setAssistant((v) => !v); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasAssistant]);
  const path = usePathname();
  // Cambio de contraseña obligatorio (lo pidió la empresa o The Iceberg Labs): primero a su perfil
  const routerTop = useRouter();
  useEffect(() => { if (mustChange && path !== "/profile") routerTop.replace("/profile?cambiar=1"); }, [mustChange, path, routerTop]);
  // Cada pantalla que se abre queda registrada para la consola The Iceberg Labs (sin esperar respuesta)
  useEffect(() => {
    const body = JSON.stringify({ path });
    if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) {
      fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  }, [path]);
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [dark, setDark] = useState(false);
  // Guía del sistema: se abre sola la primera vez; al cerrarla queda marcada como vista
  // (The Iceberg Labs no la ve: explica la operación de Leyva, no la plataforma)
  const hasGuide = role !== "dev";
  const [guide, setGuide] = useState(firstGuide && hasGuide);
  const closeGuide = () => {
    setGuide(false);
    if (firstGuide) fetch("/api/guide", { method: "POST" }).catch(() => {});
  };

  useEffect(() => {
    setOpen(localStorage.getItem("sb-sidebar-open") !== "0");
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleSidebar = () => setOpen((o) => (localStorage.setItem("sb-sidebar-open", o ? "0" : "1"), !o));
  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  };
  const logout = async () => {
    await forgetPushDevice(); // este equipo deja de recibir los avisos de esta cuenta
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  const devBadges = useDevBadges(role === "dev");
  const opsBadges = useOpsBadges(role === "admin" || role === "viewer");
  const badges = role === "dev" ? devBadges : opsBadges;
  // Secciones plegables (Configuración): cerradas salvo que estés dentro
  const [unfold, setUnfold] = useState<Set<string>>(new Set());
  const sections = (role === "dev" ? DEV_SECTIONS : SECTIONS).filter((s) => !s.roles || s.roles.includes(role))
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => (!i.roles || i.roles.includes(role)) &&
        // pantallas de una etapa: solo si el encargado tiene esa etapa
        (!i.fields || i.fields.some((f) => fields.includes(f))) &&
        // módulos PCL / YUR: solo los que le corresponden
        (!i.href.startsWith("/units/") || sites.includes(i.href.slice(7).toUpperCase()))),
    }))
    .filter((s) => s.items.length);
  // Título: la opción con la ruta más larga que coincide (/dev/database antes que /dev)
  // Opción activa: la de ruta más larga que coincide (/portal/resumen antes que /portal, /dev/database antes que /dev)
  const activeHref = [...sections.flatMap((s) => s.items), ...(role === "admin" ? [LICENSE] : []), PROFILE].filter((i) => path === i.href || path.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? "";
  const pageName = [...sections.flatMap((s) => s.items), ...(role === "admin" ? [LICENSE] : []), PROFILE].filter((i) => path === i.href || path.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.title ?? "";
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="relative flex h-screen overflow-hidden bg-[var(--page-bg)] text-sb-on-background">
      <LiveSync />
      <PushNudge />
      {/* Sidebar */}
      <aside className={cn("z-10 hidden h-screen shrink-0 flex-col overflow-hidden bg-sb-surface transition-[width] duration-200 ease-out md:flex", open ? "w-[240px]" : "w-[64px]")}>
        <div className={cn("flex h-14 shrink-0 items-center", open ? "gap-2.5 px-4" : "justify-center")}>
          {swm ? (
            // The Iceberg Labs: la plataforma, en blanco y negro
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sb-on-surface text-[9px] font-bold tracking-tight text-sb-surface">TIL</span>
          ) : brand?.v ? (
            <LogoBadge id={brand.id} name={brand.name} v={brand.v} className="h-8 w-8 rounded-lg border border-sb-outline-variant/40" />
          ) : (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sb-primary text-sb-on-primary"><TrackingMark className="h-6 w-6" title="System Tracking" /></span>
          )}
          {open && (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[13px] font-semibold tracking-tight">System Tracking</span>
              <span className="truncate text-[10px] font-medium text-sb-primary">{swm ? "The Iceberg Labs · plataforma" : brand?.name ?? "System Tracking"}</span>
            </span>
          )}
        </div>

        {/* Botón único para subir cualquier Excel: el sistema lo reconoce y lo distribuye */}
        {upload && (
          <div className={cn("shrink-0 px-2 pb-1", !open && "flex justify-center")}>
            <motion.button type="button" onClick={() => setUploadOpen(true)} title={open ? undefined : "Subir Excel"}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} transition={SPRING}
              className={cn("flex items-center gap-2 bg-sb-primary font-medium text-sb-on-primary shadow-sm",
                open ? "h-9 w-full justify-center rounded-full px-3 text-[13px]" : "h-10 w-10 justify-center rounded-2xl")}>
              <Upload className="h-4 w-4 shrink-0" />{open && "Subir Excel"}
            </motion.button>
          </div>
        )}

        {/* Asistente: siempre a mano, debajo de la acción principal */}
        {hasAssistant && (
          <div className={cn("shrink-0 px-2 pb-1", !open && "flex justify-center")}>
            <motion.button type="button" onClick={() => setAssistant(true)} title={open ? "Pregúntale al asistente (Ctrl+J)" : "Asistente (Ctrl+J)"}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} transition={SPRING}
              className={cn("flex items-center gap-2 border border-sb-primary/40 bg-sb-primary-soft font-medium text-sb-primary",
                open ? "h-9 w-full justify-start rounded-full px-3 text-[13px]" : "h-10 w-10 justify-center rounded-2xl")}>
              <Sparkles className="h-4 w-4 shrink-0" />{open && <><span className="flex-1 truncate text-left">Asistente</span><kbd className="rounded-md bg-sb-surface px-1.5 py-0.5 text-[9px] font-semibold text-sb-on-surface-variant">Ctrl J</kbd></>}
            </motion.button>
          </div>
        )}

        <nav className={cn("flex flex-1 flex-col overflow-y-auto overflow-x-hidden px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", open ? "gap-4" : "gap-2")}>
          {sections.map((s) => (
            <div key={s.title} className="flex flex-col gap-px">
              {open && (s.fold ? (
                <button type="button" onClick={() => setUnfold((u) => { const x = new Set(u); if (x.has(s.title)) x.delete(s.title); else x.add(s.title); return x; })}
                  aria-expanded={unfold.has(s.title) || s.items.some((i) => i.href === activeHref)} className="flex items-center justify-between pr-2 text-left">
                  <Heading>{s.title}</Heading>
                  <ChevronLeft className={cn("h-3 w-3 text-sb-on-surface-variant transition-transform", unfold.has(s.title) || s.items.some((i) => i.href === activeHref) ? "rotate-90" : "-rotate-90")} />
                </button>
              ) : <Heading>{s.title}</Heading>)}
              {(!open || !s.fold || unfold.has(s.title) || s.items.some((i) => i.href === activeHref)) &&
                s.items.map((i) => <NavLink key={i.title} item={i} active={i.href === activeHref} open={open} badge={i.badge && badges[i.badge]?.text ? badges[i.badge] : undefined} />)}
            </div>
          ))}
        </nav>

        <div className="shrink-0 space-y-3 border-t border-sb-outline-variant/60 px-2 py-2">
          <div className="flex flex-col gap-px">
            {open && <Heading>Herramientas</Heading>}
            {hasGuide && (
              <ToolButton open={open} label="Guía del sistema" onClick={() => setGuide(true)}>
                <BookOpen className="h-[16px] w-[16px] shrink-0" />
              </ToolButton>
            )}
            <ToolButton open={open} label="Tema" onClick={toggleTheme}>
              <div className="relative h-[16px] w-[16px] shrink-0">
                <Sun className={cn("absolute inset-0 h-[16px] w-[16px] transition-all duration-200", dark ? "rotate-90 scale-0 opacity-0" : "opacity-100")} />
                <Moon className={cn("absolute inset-0 h-[16px] w-[16px] transition-all duration-200", dark ? "opacity-100" : "-rotate-90 scale-0 opacity-0")} />
              </div>
            </ToolButton>
            <ToolButton open={open} label="Colapsar" onClick={toggleSidebar} muted>
              <ChevronLeft className={cn("h-[16px] w-[16px] shrink-0 transition-transform duration-200", !open && "rotate-180")} />
            </ToolButton>
          </div>
          <div className="flex flex-col gap-px border-t border-sb-outline-variant/60 pt-2">
            {open && <Heading>Cuenta</Heading>}
            {role === "admin" && <NavLink item={LICENSE} active={path.startsWith(LICENSE.href)} open={open} badge={badges.license} />}
            <NavLink item={PROFILE} active={path.startsWith(PROFILE.href)} open={open} />
            <ToolButton open={open} label="Salir" onClick={logout}>
              <LogOut className="h-[16px] w-[16px] shrink-0" />
            </ToolButton>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 px-4 sm:px-6">
          <h1 className="truncate text-sm font-medium text-sb-on-surface-variant">{pageName}</h1>
          <div className="flex shrink-0 items-center gap-2">
            {hasGuide && (
              <button type="button" onClick={() => setGuide(true)} title="Cómo funciona el sistema"
                className="flex h-8 items-center gap-1.5 rounded-full bg-sb-surface-container-high px-3 text-[11px] font-medium text-sb-on-surface-variant transition-colors hover:bg-sb-primary hover:text-sb-on-primary">
                <BookOpen className="h-3.5 w-3.5" /><span className="hidden sm:inline">Guía</span>
              </button>
            )}
            {hasAssistant && (
              <button type="button" onClick={() => setAssistant(true)} title="Asistente (Ctrl+J)" aria-label="Abrir asistente"
                className="flex h-8 items-center gap-1.5 rounded-full bg-sb-primary px-3 text-[11px] font-semibold text-sb-on-primary md:hidden">
                <Sparkles className="h-3.5 w-3.5" />Asistente
              </button>
            )}
            {role !== "dev" && <AlertBell href={role === "operator" ? "/my" : role === "dealer" ? "/portal" : "/alerts"} />}
            <Link href="/profile" title="Mi perfil" className="flex items-center gap-2 rounded-full bg-sb-surface-container-high px-3 py-1.5 transition-colors hover:bg-sb-surface-container-highest">
              {own?.v ? (
                <LogoBadge id={own.id} name={own.name} v={own.v} className="h-5 w-5 rounded-full text-[8px]" />
              ) : (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-sb-surface-container-highest">
                  <span className="text-[8px] font-semibold text-sb-on-surface/80">{initials}</span>
                </div>
              )}
              <span className="hidden text-[10px] text-sb-on-surface-variant sm:block">{name}</span>
              {isOwner && own ? (
                <CodeTag code={companyCode(own.id, own.kind, own.code)} size="xs" />
              ) : (
                <span className="text-[10px] font-medium uppercase text-sb-on-surface-variant">{roleLabel(role)}</span>
              )}
            </Link>
          </div>
        </header>

        <main className="scroll-hidden relative flex-1 overflow-auto px-4 pb-28 sm:px-6 md:pb-6">
          {licenseNotice && (
            <div role="status" className="mb-4 flex items-center gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs">
              <CalendarClock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <b>Licencia por vencer:</b> la licencia de {licenseNotice.company} {licenseNotice.days === 0 ? "vence hoy" : `vence en ${licenseNotice.days} ${licenseNotice.days === 1 ? "día" : "días"}`} ({licenseNotice.date}).
                Al vencer, nadie de la empresa podrá entrar. Comunícate con The Iceberg Labs para renovarla.
              </span>
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div key={path} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2, ease: [0.37, 0.35, 0, 1] }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        <MobileNav items={[...sections.flatMap((x) => x.items), ...(role === "admin" ? [LICENSE] : []), PROFILE]} activeHref={activeHref} dark={dark} onToggleTheme={toggleTheme} onLogout={logout} onGuide={hasGuide ? () => setGuide(true) : undefined}
          onUpload={upload ? () => setUploadOpen(true) : undefined} />
        {upload && <UploadCenter open={uploadOpen} onClose={() => setUploadOpen(false)} mode={upload} />}
        {hasGuide && <GuideModal open={guide} onClose={closeGuide} />}
        {hasAssistant && <AssistantPanel open={assistant} onClose={() => setAssistant(false)} dealer={role === "dealer"} />}
      </div>
    </div>
  );
}
