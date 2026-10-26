"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity, Building2, ChevronRight, Database, Eye, HardDrive, Server, ShieldCheck, Store, Terminal, Truck, Users,
} from "lucide-react";
import { Card, PageTitle, Pill } from "@/components/ui";
import { StatGrid } from "@/components/StatCard";
import { cn } from "@/lib/cn";
import { ROLE_LABEL, stageLabel, type Role } from "@/lib/workflow";
import { isSite } from "@/lib/hsp";

type Company = { id: number; name: string; kind: "transport" | "client"; parent_id: number | null; created_at: string; users: number; dealers: number; last_seen: string | null };
type Data = {
  counts: Record<string, number>;
  roles: Partial<Record<Role, number>>;
  companies: Company[];
  recentUsers: { name: string; email: string; role: Role; company: string | null; last_seen: string; online: number }[];
  events: { at: string; field: string; new_value: string | null; site: string; chassis: string; user: string | null }[];
  db: { tables: number; sizeMb: number; version: string };
};

const LINKS = [
  { title: "Gestión", icon: Building2, items: [
    { label: "Empresas y consorcios", href: "/companies", icon: Building2 },
    { label: "Usuarios", href: "/admins", icon: Users },
    { label: "En vivo", href: "/live", icon: Activity },
  ] },
  { title: "Base de datos", icon: Database, items: [
    { label: "Tablas y conexión", href: "/dev/database", icon: Server },
    { label: "Consola SQL", href: "/dev/sql", icon: Terminal },
  ] },
  { title: "Operación", icon: Truck, items: [
    { label: "Dashboard HSP", href: "/dashboard", icon: Activity },
    { label: "PCL · Pucallpa", href: "/units/pcl", icon: Truck },
    { label: "YUR · Yurimaguas", href: "/units/yur", icon: Truck },
  ] },
];

/** Árbol de empresas: SWM Labs → transportista → sus consorcios. */
function Tree({ companies }: { companies: Company[] }) {
  const roots = companies.filter((c) => !c.parent_id);
  const kids = (id: number) => companies.filter((c) => c.parent_id === id);
  const Row = ({ c, depth }: { c: Company; depth: number }) => (
    <div className={cn("flex items-center gap-2 border-b border-sb-outline-variant/25 py-2.5 text-xs last:border-0", depth > 0 && "pl-7")}>
      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", c.kind === "transport" ? "bg-sb-primary text-sb-on-primary" : "bg-sb-surface-container-high")}>
        {c.kind === "transport" ? <Truck className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{c.name}</span>
        <span className="block truncate text-[11px] text-sb-on-surface-variant">
          {c.kind === "transport" ? "Transportista · administra el sistema" : "Consorcio · solo lectura"} · desde {c.created_at}
          {c.last_seen ? ` · última conexión ${c.last_seen}` : ""}
        </span>
      </span>
      <Pill>{c.users} {c.users === 1 ? "cuenta" : "cuentas"}{c.dealers ? ` · ${c.dealers} dealers` : ""}</Pill>
    </div>
  );
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-sb-outline-variant/25 pb-2.5 text-xs">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-sb-on-surface text-[9px] font-bold text-sb-surface">SWM</span>
        <span className="flex-1"><b className="font-medium">SWM Labs</b> <span className="text-sb-on-surface-variant">· desarrolla y supervisa la plataforma</span></span>
      </div>
      {roots.map((r) => (
        <div key={r.id} className="pl-4">
          <Row c={r} depth={0} />
          {kids(r.id).map((k) => <Row key={k.id} c={k} depth={1} />)}
        </div>
      ))}
      {!roots.length && <p className="py-6 text-center text-xs text-sb-on-surface-variant">Todavía no hay empresas. Regístralas en Empresas.</p>}
    </div>
  );
}

export default function DevConsole() {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    // Si la sesión venció o no es SWM Labs, la API responde error: no reemplazar los datos con él
    const load = () => fetch("/api/dev/overview").then((r) => (r.ok ? r.json() : null)).then((x) => x && setD(x)).catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);
  if (!d) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando consola…</div>;
  const c = d.counts;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Consola SWM Labs" sub="Lo que pasa en la plataforma: empresas y consorcios creados, cuentas, datos y base de datos. Se actualiza cada 15 segundos." />

      <StatGrid
        className="grid-cols-2 lg:grid-cols-5"
        items={[
          { label: "Empresas y consorcios", value: c.companies, icon: Building2 },
          { label: "Cuentas", value: `${c.users} · ${c.online} en línea`, icon: Users },
          { label: "Dealers con cuenta", value: `${c.dealers_with_account} de ${c.dealers}`, icon: Store },
          { label: "Unidades", value: c.units.toLocaleString(), icon: Truck },
          { label: "Base de datos", value: `${d.db.sizeMb} MB · ${d.db.tables} tablas`, icon: HardDrive },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {LINKS.map((g, i) => (
          <motion.div key={g.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2.5 border-b border-sb-outline-variant/30 px-4 py-3">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-sb-primary-soft text-sb-primary"><g.icon className="h-4 w-4" /></span>
                <span className="text-[13px] font-semibold">{g.title}</span>
              </div>
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} className="group flex items-center gap-2.5 border-b border-sb-outline-variant/20 px-4 py-2.5 text-xs last:border-0 hover:bg-sb-surface-container-low">
                  <it.icon className="h-3.5 w-3.5 text-sb-on-surface-variant/60" />
                  <span className="flex-1 font-medium">{it.label}</span>
                  <ChevronRight className="h-3 w-3 text-sb-on-surface-variant/40 transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Empresas y consorcios</h3>
          <Tree companies={d.companies} />
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Cuentas por tipo</h3>
          <div className="flex flex-col">
            {(["dev", "admin", "operator", "viewer", "dealer"] as Role[]).map((r) => (
              <div key={r} className="flex items-center gap-2 border-b border-sb-outline-variant/25 py-2 text-xs last:border-0">
                {r === "dev" || r === "admin" ? <ShieldCheck className="h-3.5 w-3.5 text-sb-on-surface-variant" /> : r === "dealer" ? <Store className="h-3.5 w-3.5 text-sb-on-surface-variant" /> : r === "viewer" ? <Eye className="h-3.5 w-3.5 text-sb-on-surface-variant" /> : <Users className="h-3.5 w-3.5 text-sb-on-surface-variant" />}
                <span className="flex-1">{ROLE_LABEL[r]}</span>
                <b>{d.roles[r] ?? 0}</b>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-sb-on-surface-variant">MariaDB/MySQL {d.db.version} · {c.events.toLocaleString()} registros de fechas ({c.events_today} hoy)</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Últimas conexiones</h3>
          {d.recentUsers.map((u) => (
            <div key={u.email} className="flex items-center gap-2 border-b border-sb-outline-variant/25 py-2 text-xs last:border-0">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", Number(u.online) ? "bg-sb-primary" : "bg-sb-surface-container-highest")} />
              <span className="min-w-0 flex-1 truncate"><b className="font-medium">{u.name}</b> <span className="text-sb-on-surface-variant">· {ROLE_LABEL[u.role]}{u.company ? ` · ${u.company}` : ""}</span></span>
              <span className="shrink-0 text-sb-on-surface-variant">{u.last_seen}</span>
            </div>
          ))}
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Últimas fechas registradas</h3>
          {d.events.length ? d.events.map((e, i) => (
            <div key={i} className="flex items-center gap-2 border-b border-sb-outline-variant/25 py-2 text-xs last:border-0">
              <span className="min-w-0 flex-1 truncate">
                <b className="font-mono font-medium">{e.chassis}</b>{" "}
                <span className="text-sb-on-surface-variant">· {isSite(e.site) ? stageLabel(e.site, e.field) : e.field}: {e.new_value ?? "borrada"} · {e.user ?? "—"}</span>
              </span>
              <span className="shrink-0 text-sb-on-surface-variant">{e.at}</span>
            </div>
          )) : <p className="text-xs text-sb-on-surface-variant">Sin registros todavía.</p>}
        </Card>
      </div>
    </div>
  );
}
