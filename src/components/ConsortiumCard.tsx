"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import { Button, toast } from "@heroui/react";
import { Check, Copy, ExternalLink, Eye, LayoutDashboard, LogIn, MessageCircle, Palette, Pencil, Store, Trash2, UserPlus, Users } from "lucide-react";
import { Card } from "@/components/ui";
import { LogoBadge } from "@/components/CompanyLogo";
import { DEFAULT_COLOR, onColor } from "@/lib/theme";
import { cn } from "@/lib/cn";

export type ConsortiumUser = { id: number; name: string; email: string; role: string; online: number; last_seen?: string | null };
export type Consortium = {
  id: number; name: string; code: string; slug: string | null; color: string | null; logo_v: string | null; parent: string | null;
  owner_id: number | null; created_at: string; users: ConsortiumUser[];
};

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
/** "hace 5 min", "hace 2 h", "ayer", "hace 4 días" */
function ago(iso?: string | null) {
  if (!iso) return "nunca entró";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

function Count({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString("es-PE"));
  useEffect(() => { const c = animate(mv, value, { duration: 0.8, ease: [0.32, 0.72, 0, 1] }); return () => c.stop(); }, [mv, value]);
  return <motion.span>{text}</motion.span>;
}

/** Botón de copiar con check animado */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={label} onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); toast.success("Enlace copiado", { description: text }); setTimeout(() => setDone(false), 1600); })}
      className="relative grid h-9 w-9 place-items-center rounded-full border border-sb-outline-variant transition-colors hover:bg-sb-surface-container-high">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={done ? "ok" : "copy"} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.15 }}>
          {done ? <Check className="h-4 w-4 text-sb-ontime" /> : <Copy className="h-4 w-4" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

type Tab = "entries" | "accounts" | "look";
const TABS: { key: Tab; label: string; icon: typeof LogIn }[] = [
  { key: "entries", label: "Entradas", icon: LogIn },
  { key: "accounts", label: "Cuentas", icon: Users },
  { key: "look", label: "Así lo ven", icon: Palette },
];

/**
 * Tarjeta de un consorcio (Honda…): encabezado con su color y logo y cifras en vivo,
 * y pestañas para sus entradas (copiar, abrir, compartir), sus cuentas y cómo ven el sistema.
 */
export function ConsortiumCard({ c, onEdit, onDelete, onAddAccount }: {
  c: Consortium; onEdit: () => void; onDelete?: () => void; onAddAccount?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("entries");
  // Dirección del sistema (en el servidor no se conoce: vacía hasta hidratar)
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");
  const color = c.color || DEFAULT_COLOR;
  const ink = onColor(color);
  const team = c.users.filter((u) => u.role !== "dealer");
  const clients = c.users.filter((u) => u.role === "dealer");
  const online = c.users.filter((u) => Number(u.online)).length;
  const onlineTeam = team.filter((u) => Number(u.online)).length;
  const onlineClients = clients.filter((u) => Number(u.online)).length;
  const lastClient = clients.map((u) => u.last_seen).filter(Boolean).sort().at(-1) ?? null;
  const entries = c.slug ? [
    { who: "Equipo", desc: `Cuenta principal y empleados de ${c.name}`, path: `/${c.slug}`, icon: Users, n: team.length, live: onlineTeam },
    { who: "Clientes", desc: `Sus clientes (SORSA, CREDIVARGAS…) ven solo lo suyo`, path: `/${c.slug}/clientes`, icon: Store, n: clients.length, live: onlineClients },
  ] : [];

  return (
    <Card className="overflow-hidden">
      {/* Encabezado con el color del consorcio */}
      <div className="relative overflow-hidden p-5" style={{ background: `linear-gradient(135deg, ${color} 0%, color-mix(in oklab, ${color} 72%, black) 100%)`, color: ink }}>
        <motion.span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full" style={{ background: `color-mix(in oklab, ${ink} 10%, transparent)` }}
          animate={{ y: [0, 10, 0], x: [0, -6, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
        <motion.span aria-hidden className="pointer-events-none absolute -bottom-16 right-24 h-32 w-32 rounded-full" style={{ background: `color-mix(in oklab, ${ink} 7%, transparent)` }}
          animate={{ y: [0, -8, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} />
        <div className="relative flex items-start gap-3">
          {c.logo_v ? <LogoBadge id={c.id} name={c.name} v={c.logo_v} className="h-12 w-12 rounded-2xl border-2 border-white/70 bg-white shadow-lg" /> : (
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/20 text-lg font-bold">{initials(c.name)}</span>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight">
              <span className="truncate">{c.name}</span>
              <span className="shrink-0 whitespace-nowrap rounded-md bg-white/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider">{c.code}</span>
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] opacity-85">
              <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> Consorcio · solo lectura</span>
              {c.parent && <span>· creado por {c.parent}</span>}
              <span>· desde {c.created_at}</span>
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button aria-label={`Editar ${c.name}`} onClick={onEdit} className="grid h-9 w-9 place-items-center rounded-full bg-white/15 transition-colors hover:bg-white/30"><Pencil className="h-4 w-4" /></button>
            {onDelete && <button aria-label={`Eliminar ${c.name}`} onClick={onDelete} className="grid h-9 w-9 place-items-center rounded-full bg-white/15 transition-colors hover:bg-white/30"><Trash2 className="h-4 w-4" /></button>}
          </div>
        </div>
        {/* Cifras en vivo */}
        <div className="relative mt-4 grid grid-cols-3 gap-2">
          {[
            { k: "Equipo", v: team.length, sub: `${team.length === 1 ? "cuenta" : "cuentas"}` },
            { k: "Clientes", v: clients.length, sub: `con cuenta${lastClient ? ` · ${ago(lastClient)}` : ""}` },
            { k: "En línea", v: online, sub: online ? "ahora mismo" : "nadie ahora", live: online > 0 },
          ].map((s) => (
            <div key={s.k} className="rounded-2xl bg-white/12 px-3 py-2 backdrop-blur-sm" style={{ background: `color-mix(in oklab, ${ink} 12%, transparent)` }}>
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-80">
                {s.live && <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-70" /><span className="relative h-1.5 w-1.5 rounded-full bg-current" /></span>}
                {s.k}
              </p>
              <p className="text-2xl font-bold leading-tight"><Count value={s.v} /></p>
              <p className="truncate text-[10px] opacity-75">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 border-b border-sb-outline-variant/40 px-3 pt-2">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={cn("relative flex items-center gap-1.5 px-3 pb-2.5 pt-1.5 text-xs font-medium transition-colors", tab === t.key ? "text-sb-on-surface" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
            {tab === t.key && <motion.span layoutId={`co-tab-${c.id}`} className="absolute inset-x-1 -bottom-px h-0.5 rounded-full" style={{ background: color }} transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          </button>
        ))}
      </div>

      <div className="p-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            {tab === "entries" && (entries.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {entries.map((e, i) => {
                  const url = `${origin}${e.path}`;
                  return (
                    <motion.div key={e.path} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                      className="group relative flex flex-col gap-3 rounded-2xl border border-sb-outline-variant/60 p-4 transition-shadow hover:shadow-md">
                      {/* Borde de "ticket" con el color del consorcio */}
                      <span aria-hidden className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: color }} />
                      <div className="flex items-start gap-2.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}><e.icon className="h-4 w-4" /></span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">Entrada · {e.who}</p>
                          <p className="text-[11px] leading-snug text-sb-on-surface-variant">{e.desc}</p>
                        </div>
                      </div>
                      <div className="rounded-xl bg-sb-surface-container-low px-3 py-2">
                        <p className="truncate font-mono text-base font-semibold" style={{ color }}>{e.path}</p>
                        <p className="truncate font-mono text-[10px] text-sb-on-surface-variant">{url || e.path}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <CopyButton text={url} label={`Copiar enlace de ${e.who.toLowerCase()}`} />
                        <a href={e.path} target="_blank" rel="noopener noreferrer" aria-label={`Abrir entrada de ${e.who.toLowerCase()}`}
                          className="grid h-9 w-9 place-items-center rounded-full border border-sb-outline-variant transition-colors hover:bg-sb-surface-container-high"><ExternalLink className="h-4 w-4" /></a>
                        <a href={`https://wa.me/?text=${encodeURIComponent(`Ingresa a System Trackin de ${c.name}: ${url}`)}`} target="_blank" rel="noopener noreferrer" aria-label={`Compartir entrada de ${e.who.toLowerCase()} por WhatsApp`}
                          className="grid h-9 w-9 place-items-center rounded-full border border-sb-outline-variant transition-colors hover:bg-sb-surface-container-high"><MessageCircle className="h-4 w-4" /></a>
                        <span className="ml-auto text-right text-[11px] text-sb-on-surface-variant">
                          <b className="text-sb-on-surface">{e.n}</b> {e.n === 1 ? "cuenta" : "cuentas"}
                          {e.live > 0 && <span className="block text-sb-ontime">{e.live} en línea</span>}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : <p className="py-4 text-center text-xs text-sb-on-surface-variant">Este consorcio aún no tiene dirección de entrada. Edítalo para ponerle una.</p>)}

            {tab === "accounts" && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-sb-on-surface-variant/60">Equipo ({team.length})</span>
                  {onAddAccount && <Button size="sm" variant="secondary" className="rounded-full" onPress={onAddAccount}><UserPlus className="h-3.5 w-3.5" /> Agregar cuenta</Button>}
                </div>
                {team.length ? (
                  <div className="flex flex-col gap-1">
                    {team.map((u, i) => (
                      <motion.div key={u.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                        className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-sb-surface-container-low">
                        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold" style={{ background: color, color: ink }}>
                          {initials(u.name)}
                          <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-sb-surface", Number(u.online) ? "bg-emerald-500" : "bg-sb-surface-container-highest")} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 truncate text-sm font-medium">{u.name}{u.id === c.owner_id && <span className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase" style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}>Principal</span>}</span>
                          <span className="block truncate text-[11px] text-sb-on-surface-variant">{u.email}</span>
                        </span>
                        <span className={cn("shrink-0 text-[11px]", Number(u.online) ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-sb-on-surface-variant")}>{Number(u.online) ? "En línea" : ago(u.last_seen)}</span>
                      </motion.div>
                    ))}
                  </div>
                ) : <p className="text-[12px] text-sb-on-surface-variant">Sin cuentas todavía.</p>}
                {clients.length > 0 && (
                  <Link href="/admins" className="group flex items-center gap-3 rounded-2xl border border-sb-outline-variant/60 p-3 transition-colors hover:bg-sb-surface-container-low">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}><Store className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1 text-xs">
                      <b className="text-sm">{clients.length}</b> cuentas de clientes (SORSA, CREDIVARGAS…)
                      <span className="block text-[11px] text-sb-on-surface-variant">{onlineClients ? `${onlineClients} en línea ahora · ` : ""}{lastClient ? `último ingreso ${ago(lastClient)}` : "todavía nadie entró"}</span>
                    </span>
                    <span className="text-xs font-medium transition-transform group-hover:translate-x-0.5" style={{ color }}>Ver en Usuarios →</span>
                  </Link>
                )}
              </div>
            )}

            {tab === "look" && (
              <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr]">
                {/* Mini vista de su menú */}
                <div className="overflow-hidden rounded-2xl border border-sb-outline-variant/60">
                  <div className="flex">
                    <div className="flex w-40 shrink-0 flex-col gap-1.5 border-r border-sb-outline-variant/40 bg-sb-surface p-2.5">
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="grid h-6 w-6 place-items-center rounded-md text-[9px] font-bold" style={{ background: color, color: ink }}>{initials(c.name)}</span>
                        <span className="truncate text-[10px] font-semibold">{c.name}</span>
                      </div>
                      {["Tablero", "Reportes"].map((t, i) => (
                        <span key={t} className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px]" style={i === 0 ? { background: color, color: ink } : undefined}>
                          {i === 0 ? <LayoutDashboard className="h-3 w-3" /> : <Eye className="h-3 w-3" />}{t}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5 bg-sb-surface-container-low p-2.5">
                      <span className="h-2 w-16 rounded-full bg-sb-surface-container-highest" />
                      <div className="grid grid-cols-2 gap-1.5">
                        {[0.8, 0.55, 0.7, 0.4].map((h, i) => (
                          <div key={i} className="flex h-12 items-end gap-0.5 rounded-lg bg-sb-surface p-1.5">
                            {[h, h * 0.7, h * 0.9, h * 0.5].map((x, j) => (
                              <motion.span key={j} className="flex-1 rounded-t-sm" style={{ background: color, opacity: 0.35 + j * 0.15 }}
                                initial={{ height: 0 }} animate={{ height: `${x * 100}%` }} transition={{ duration: 0.6, delay: (i * 4 + j) * 0.03 }} />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="border-t border-sb-outline-variant/40 px-3 py-1.5 text-[10px] text-sb-on-surface-variant">Su menú: Tablero y Reportes, con su color y su logo</p>
                </div>
                {/* Mini vista de su ingreso */}
                <div className="flex flex-col justify-between gap-3 rounded-2xl bg-[#0b0b0b] p-4 text-white">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-full text-[10px] font-bold" style={{ background: color, color: ink }}>{initials(c.name)}</span>
                    <span className="text-[11px] leading-tight"><b className="block">{c.name}</b><span className="opacity-50">Equipo · System Trackin</span></span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="h-7 rounded-lg bg-white/[0.08]" />
                    <span className="h-7 rounded-lg bg-white/[0.08]" />
                  </div>
                  <span className="flex h-8 items-center rounded-full bg-white/[0.06] p-1">
                    <motion.span className="h-6 rounded-full px-3 text-[10px] font-semibold leading-6" style={{ background: color, color: ink }}
                      animate={{ x: [0, 6, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}>Ingresar</motion.span>
                  </span>
                  <p className="text-[10px] opacity-50">Así ve su entrada {c.slug ? `/${c.slug}` : ""}</p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Card>
  );
}
