"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Bell, ChartColumn, Container, FileStack, Upload, BookOpen, Building2, ChevronLeft, Database, FileSpreadsheet, SquareTerminal, Terminal, CircleUser, ClipboardCheck, LayoutDashboard, LogOut, Moon, PackageSearch, Ship, SlidersHorizontal, Store, Sun, Truck, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { MobileNav } from "@/components/MobileNav";
import { AlertBell } from "@/components/AlertBell";
import { GuideModal } from "@/components/GuideModal";
import { LogoBadge } from "@/components/CompanyLogo";

type Co = { id: number; name: string; v: string | null; color?: string | null; kind?: string; code?: string | null } | null;

import { companyCode, roleLabel, type Role } from "@/lib/workflow";
import { UploadCenter, type UploadMode } from "@/components/UploadCenter";
import { CodeTag } from "@/components/ui";
import { LiveSync } from "@/components/LiveSync";

type Item = { title: string; href: string; icon: LucideIcon; roles?: Role[]; fields?: string[] };
const SUPER: Role[] = ["dev", "admin"];
const READ: Role[] = ["dev", "admin", "viewer"]; // ven todo (viewer = solo lectura, Honda)

/**
 * Menú ordenado por lo que hace cada rol:
 * - Encargado: marca su paso (Mi trabajo, embarque y zarpe si es de Iquitos, carga por guía) y ve su módulo.
 * - Empresa (Leyva) y The Iceberg Labs: supervisan el flujo en tiempo real (Dashboard general, En vivo, Tablero, Alertas),
 *   siguen las unidades por ruta y configuran. Las pantallas de marcación quedan al final, para verificar o corregir.
 * - Honda: Tablero y Reportes. Cliente: su resumen y sus unidades.
 */
const SECTIONS: { title: string; items: Item[]; roles?: Role[] }[] = [
  {
    title: "Mi trabajo",
    roles: ["operator"],
    items: [
      { title: "Mi trabajo", href: "/my", icon: ClipboardCheck },
      // Solo quien embarca o zarpa en Iquitos
      { title: "Embarque y zarpe", href: "/embarque", icon: Container, fields: ["d_carga", "d_zarpe"] },
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
    ],
  },
  {
    title: "Supervisión",
    roles: READ,
    items: [
      { title: "Dashboard general", href: "/dashboard", icon: LayoutDashboard, roles: SUPER },
      { title: "En vivo", href: "/live", icon: Activity, roles: SUPER },
      { title: "Tablero", href: "/board", icon: ChartColumn },
      { title: "Alertas", href: "/alerts", icon: Bell, roles: SUPER },
    ],
  },
  {
    title: "Seguimiento por ruta",
    roles: READ,
    items: [
      { title: "PCL · Pucallpa", href: "/units/pcl", icon: Ship, roles: SUPER },
      { title: "YUR · Yurimaguas", href: "/units/yur", icon: Truck, roles: SUPER },
      { title: "Reportes", href: "/reports", icon: FileSpreadsheet },
    ],
  },
  {
    // Lo marcan los encargados; la empresa entra para verificar o corregir
    title: "Marcación de encargados",
    roles: SUPER,
    items: [
      { title: "Embarque y zarpe", href: "/embarque", icon: Container },
      { title: "Carga por guía", href: "/guias", icon: FileStack },
    ],
  },
  {
    title: "Configuración",
    roles: SUPER,
    items: [
      { title: "Usuarios", href: "/admins", icon: Users },
      { title: "Dealers", href: "/dealers", icon: Store },
      { title: "Plazos y meta", href: "/settings", icon: SlidersHorizontal },
      { title: "Empresas", href: "/companies", icon: Building2, roles: ["dev"] },
      { title: "Consorcios", href: "/companies", icon: Building2, roles: ["admin"] },
    ],
  },
  {
    // Consola de la plataforma: solo The Iceberg Labs (dev)
    title: "The Iceberg Labs",
    roles: ["dev"],
    items: [
      { title: "Consola", href: "/dev", icon: Terminal },
      { title: "Base de datos", href: "/dev/database", icon: Database },
      { title: "Consola SQL", href: "/dev/sql", icon: SquareTerminal },
    ],
  },
];

const PROFILE: Item = { title: "Mi perfil", href: "/profile", icon: CircleUser };

const SPRING ={ type: "spring", stiffness: 400, damping: 32, mass: 0.7 } as const;

function NavLink({ item, active, open }: { item: Item; active: boolean; open: boolean }) {
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

export function AppShell({ name, role, sites = ["PCL", "YUR"], fields = [], firstGuide = false, brand = null, own = null, swm = false, isOwner = false, upload = null, children }: {
  name: string; role: Role; sites?: string[]; fields?: string[]; firstGuide?: boolean; brand?: Co; own?: Co; swm?: boolean; isOwner?: boolean; upload?: UploadMode | null; children: React.ReactNode;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [dark, setDark] = useState(false);
  // Guía del sistema: se abre sola la primera vez; al cerrarla queda marcada como vista
  const [guide, setGuide] = useState(firstGuide);
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
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  const sections = SECTIONS.filter((s) => !s.roles || s.roles.includes(role))
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
  const activeHref = [...sections.flatMap((s) => s.items), PROFILE].filter((i) => path === i.href || path.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? "";
  const pageName = [...sections.flatMap((s) => s.items), PROFILE].filter((i) => path === i.href || path.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.title ?? "";
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--page-bg)] text-sb-on-background">
      <LiveSync />
      {/* Sidebar */}
      <aside className={cn("z-10 hidden h-screen shrink-0 flex-col overflow-hidden bg-sb-surface transition-[width] duration-200 ease-out md:flex", open ? "w-[240px]" : "w-[64px]")}>
        <div className={cn("flex h-14 shrink-0 items-center", open ? "gap-2.5 px-4" : "justify-center")}>
          {swm ? (
            // The Iceberg Labs: la plataforma, en blanco y negro
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sb-on-surface text-[9px] font-bold tracking-tight text-sb-surface">TIL</span>
          ) : brand?.v ? (
            <LogoBadge id={brand.id} name={brand.name} v={brand.v} className="h-8 w-8 rounded-lg border border-sb-outline-variant/40" />
          ) : (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sb-primary text-[11px] font-bold text-sb-on-primary">ST</span>
          )}
          {open && (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[13px] font-semibold tracking-tight">System Trackin</span>
              <span className="truncate text-[10px] font-medium text-sb-primary">{swm ? "The Iceberg Labs · plataforma" : brand?.name ?? "System Trackin"}</span>
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

        <nav className={cn("flex flex-1 flex-col overflow-y-auto overflow-x-hidden px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", open ? "gap-4" : "gap-2")}>
          {sections.map((s) => (
            <div key={s.title} className="flex flex-col gap-px">
              {open && <Heading>{s.title}</Heading>}
              {s.items.map((i) => <NavLink key={i.title} item={i} active={i.href === activeHref} open={open} />)}
            </div>
          ))}
        </nav>

        <div className="shrink-0 space-y-3 border-t border-sb-outline-variant/60 px-2 py-2">
          <div className="flex flex-col gap-px">
            {open && <Heading>Herramientas</Heading>}
            <ToolButton open={open} label="Guía del sistema" onClick={() => setGuide(true)}>
              <BookOpen className="h-[16px] w-[16px] shrink-0" />
            </ToolButton>
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
            <button type="button" onClick={() => setGuide(true)} title="Cómo funciona el sistema"
              className="flex h-8 items-center gap-1.5 rounded-full bg-sb-surface-container-high px-3 text-[11px] font-medium text-sb-on-surface-variant transition-colors hover:bg-sb-primary hover:text-sb-on-primary">
              <BookOpen className="h-3.5 w-3.5" /><span className="hidden sm:inline">Guía</span>
            </button>
            <AlertBell href={role === "operator" ? "/my" : role === "dealer" ? "/portal" : "/alerts"} />
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

        <main className="scroll-hidden flex-1 overflow-auto px-4 pb-28 sm:px-6 md:pb-6">
          <AnimatePresence mode="wait">
            <motion.div key={path} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2, ease: [0.37, 0.35, 0, 1] }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        <MobileNav items={[...sections.flatMap((x) => x.items), PROFILE]} activeHref={activeHref} dark={dark} onToggleTheme={toggleTheme} onLogout={logout} onGuide={() => setGuide(true)}
          onUpload={upload ? () => setUploadOpen(true) : undefined} />
        {upload && <UploadCenter open={uploadOpen} onClose={() => setUploadOpen(false)} mode={upload} />}
        <GuideModal open={guide} onClose={closeGuide} />
      </div>
    </div>
  );
}
