"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { Card, Empty, PageTitle, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { StatGrid } from "@/components/StatCard";
import { Activity, AlertTriangle, UserCheck, Users } from "lucide-react";
import { Chips, LiveDot, deviceOf, pageLabel, roleLabel, useLive } from "@/components/dev/DevKit";
import { cn } from "@/lib/cn";

type U = {
  id: number; name: string; email: string; role: string; is_owner: number | null; company: string | null; created_at: string;
  last_seen: string | null; online: number; last_login: string | null; logins_30d: number; fails_30d: number; views_7d: number;
  days_30d: number; last_path: string | null; events_30d: number; imports: number; agent: string | null; ip: string | null;
};

const ROLES = [
  { key: "all", label: "Todas" }, { key: "admin", label: "Supervisores" }, { key: "operator", label: "Encargados" },
  { key: "viewer", label: "Consorcios" }, { key: "dealer", label: "Clientes" }, { key: "dev", label: "The Iceberg Labs" },
] as const;
type RoleKey = (typeof ROLES)[number]["key"];

/** Consola The Iceberg Labs · Usuarios reales: quién entra, cuánto usa el sistema y desde dónde. */
export default function DevUsersPage() {
  return <Suspense><DevUsers /></Suspense>;
}

function DevUsers() {
  const sp = useSearchParams();
  const { data, at } = useLive<{ users: U[] }>("/api/dev/users", 8000);
  const [role, setRole] = useState<RoleKey>("all");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const users = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.users ?? []).filter((u) => (role === "all" || u.role === role) && (!t || `${u.name} ${u.email} ${u.company ?? ""}`.toLowerCase().includes(t)));
  }, [data, role, q]);
  const all = data?.users ?? [];
  const real = all.filter((u) => u.role !== "dev");

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Usuarios" sub="Todas las cuentas reales: conexión, ingresos, pantallas vistas, fechas registradas y dispositivo. Toca una para ver todo lo que hizo.">
        <LiveDot at={at} />
      </PageTitle>
      <StatGrid
        className="grid-cols-2 lg:grid-cols-4"
        items={[
          { label: "Cuentas (sin The Iceberg Labs)", value: real.length, icon: Users },
          { label: "Conectadas ahora", value: real.filter((u) => Number(u.online)).length, icon: Activity },
          { label: "Usaron el sistema en 7 días", value: real.filter((u) => u.views_7d > 0).length, icon: UserCheck },
          { label: "Nunca ingresaron", value: real.filter((u) => !u.last_seen).length, icon: AlertTriangle },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chips value={role} onChange={setRole} options={[...ROLES]} />
        <label className="flex h-9 items-center gap-2 rounded-full border border-sb-outline-variant px-3 text-xs">
          <Search className="h-3.5 w-3.5 text-sb-on-surface-variant" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre, correo o empresa" className="w-56 bg-transparent outline-none" />
        </label>
      </div>
      <Card className="overflow-hidden">
        <Table>
          <Thead>
            <Th>Cuenta</Th><Th>Tipo · empresa</Th><Th>Última actividad</Th><Th className="text-right">Ingresos 30 d</Th>
            <Th className="text-right">Pantallas 7 d</Th><Th className="text-right">Días activos 30 d</Th><Th className="text-right">Fechas 30 d</Th>
            <Th className="text-right">Excel</Th><Th>Dispositivo · IP</Th>
          </Thead>
          <tbody>
            {!data ? <Empty cols={9}>Cargando…</Empty> : !users.length ? <Empty cols={9}>Sin cuentas con ese filtro.</Empty> : users.map((u) => (
              <Tr key={u.id}>
                <Td>
                  <Link href={`/dev/activity?user=${u.id}`} className="flex items-center gap-2 hover:underline">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", Number(u.online) ? "bg-sb-primary" : "bg-sb-surface-container-highest")} title={Number(u.online) ? "Conectado" : "Desconectado"} />
                    <span><b className="block font-semibold text-sb-on-surface">{u.name}</b><span className="text-[11px] text-sb-on-surface-variant">{u.email}</span></span>
                  </Link>
                </Td>
                <Td>{roleLabel(u.role)}{Number(u.is_owner) ? " (principal)" : ""}<span className="block text-[11px] text-sb-on-surface-variant">{u.company ?? "—"} · desde {u.created_at}</span></Td>
                <Td>
                  {u.last_seen ?? <span className="text-sb-on-surface-variant">Nunca</span>}
                  <span className="block text-[11px] text-sb-on-surface-variant">{u.last_path ? pageLabel(u.last_path) : ""}{u.last_login ? ` · ingresó ${u.last_login.slice(5)}` : ""}</span>
                </Td>
                <Td className="text-right">{u.logins_30d}{u.fails_30d ? <span className="block text-[11px] font-semibold text-sb-late">{u.fails_30d} fallidos</span> : null}</Td>
                <Td className="text-right">{u.views_7d.toLocaleString()}</Td>
                <Td className="text-right">{u.days_30d}</Td>
                <Td className="text-right">{u.events_30d.toLocaleString()}</Td>
                <Td className="text-right">{u.imports}</Td>
                <Td>{deviceOf(u.agent)}<span className="block font-mono text-[10px] text-sb-on-surface-variant">{u.ip ?? ""}</span></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <p className="text-[11px] text-sb-on-surface-variant">Ingresos, pantallas y dispositivo se registran desde esta versión; la última actividad viene de antes.</p>
    </div>
  );
}
