"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { CalendarDays, Magnet, MousePointerClick, Repeat, UserCheck, Users } from "lucide-react";
import { Card, Empty, PageTitle, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { StatGrid } from "@/components/StatCard";
import { Bars, LiveDot, pageLabel, roleLabel, useLive } from "@/components/dev/DevKit";

type Adoption = {
  kpis: Record<string, number>;
  daily: { d: string; n: number }[];
  companies: { id: number; name: string; kind: string; accounts: number; wau: number; mau: number; views: number; events: number; last_at: string | null }[];
  roles: { role: string; accounts: number; wau: number; mau: number }[];
  screens: { role: string; path: string; n: number }[];
};
const ORDER = ["admin", "operator", "viewer", "dealer"];
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function lastDays(n: number) {
  const out: string[] = [];
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

function Meter({ value, delay = 0 }: { value: number; delay?: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sb-surface-container-high">
      <motion.div className="h-full rounded-full bg-sb-primary" initial={{ width: 0 }} animate={{ width: `${Math.min(100, value)}%` }} transition={{ duration: 0.8, delay, ease: [0.32, 0.72, 0, 1] }} />
    </div>
  );
}

/** Consola The Iceberg Labs · Adopción: cuánto se usa la plataforma de verdad, por empresa y por tipo de cuenta. */
export default function DevAdoption() {
  const { data: d, at } = useLive<Adoption>("/api/dev/adoption", 15000);
  if (!d) return <div className="p-6 text-sm text-sb-on-surface-variant">Midiendo la adopción…</div>;
  const k = d.kpis;
  const days = lastDays(30);
  const daily = new Map(d.daily.map((r) => [r.d, r.n]));
  const roles = [...d.roles].sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role));

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Adopción" sub="Cuánto se usa la plataforma de verdad: personas activas, si vuelven y qué usa cada tipo de cuenta. Sin contar a The Iceberg Labs.">
        <LiveDot at={at} />
      </PageTitle>

      <StatGrid
        className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
        items={[
          { label: "Activos hoy", value: k.dau, icon: UserCheck },
          { label: "Activos 7 días", value: `${k.wau} de ${k.accounts}`, icon: Users },
          { label: "Activos 30 días", value: `${k.mau} · ${pct(k.mau, k.accounts)}%`, icon: CalendarDays },
          { label: "Fidelidad (hoy / mes)", value: `${pct(k.dau, k.mau)}%`, icon: Magnet },
          { label: "Volvieron esta semana", value: k.last_week ? `${k.returned} de ${k.last_week} · ${pct(k.returned, k.last_week)}%` : "—", icon: Repeat },
          { label: "Pantallas por día y persona", value: k.views_per_session ? Number(k.views_per_session).toLocaleString("es-PE") : "—", icon: MousePointerClick },
        ]}
      />

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Personas activas por día · últimos 30 días</h3>
        <p className="mb-4 text-[11px] text-sb-on-surface-variant">Cuentas distintas que abrieron al menos una pantalla ese día</p>
        <Bars data={days.map((day) => ({ label: day, value: daily.get(day) ?? 0, title: `${day.slice(8)}/${day.slice(5, 7)}` }))} tick={(l, i) => (i % 5 === 0 || i === 29 ? `${l.slice(8)}/${l.slice(5, 7)}` : null)} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <div className="px-5 pt-4">
            <h3 className="text-sm font-semibold">Adopción por empresa</h3>
            <p className="text-[11px] text-sb-on-surface-variant">Qué parte de las cuentas de cada empresa usa el sistema (7 y 30 días).</p>
          </div>
          <Table>
            <Thead><Th>Empresa</Th><Th className="w-40">Activas 7 días</Th><Th className="text-right">30 días</Th><Th className="text-right">Pantallas</Th><Th className="text-right">Fechas</Th><Th>Último uso</Th></Thead>
            <tbody>
              {!d.companies.length ? <Empty cols={6}>Todavía no hay empresas registradas.</Empty> : d.companies.map((c, i) => (
                <Tr key={c.id}>
                  <Td><Link href={`/dev/users?q=${encodeURIComponent(c.name)}`} className="font-medium hover:underline">{c.name}</Link><span className="block text-[11px] text-sb-on-surface-variant">{c.kind === "transport" ? "Empresa" : "Consorcio"} · {c.accounts} {c.accounts === 1 ? "cuenta" : "cuentas"}</span></Td>
                  <Td><div className="flex items-center gap-2"><Meter value={pct(c.wau, c.accounts)} delay={i * 0.04} /><b className="w-14 shrink-0 text-right">{c.wau} · {pct(c.wau, c.accounts)}%</b></div></Td>
                  <Td className="text-right">{c.mau}</Td>
                  <Td className="text-right">{Number(c.views).toLocaleString()}</Td>
                  <Td className="text-right">{Number(c.events).toLocaleString()}</Td>
                  <Td>{c.last_at ?? <span className="text-sb-on-surface-variant">Nunca</span>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Adopción por tipo de cuenta</h3>
          {roles.map((r, i) => (
            <div key={r.role} className="mb-3">
              <div className="mb-1 flex justify-between text-xs"><span>{roleLabel(r.role)}</span><span className="text-sb-on-surface-variant"><b className="text-sb-on-surface">{r.wau}</b> de {r.accounts} esta semana · {r.mau} en 30 días</span></div>
              <Meter value={pct(r.wau, r.accounts)} delay={i * 0.05} />
            </div>
          ))}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Qué usa cada tipo de cuenta · 30 días</h3>
        <p className="mb-4 text-[11px] text-sb-on-surface-variant">Las pantallas más abiertas por cada tipo. Una pantalla que nadie abre es candidata a mejorarse o quitarse.</p>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {ORDER.map((role) => {
            const rows = d.screens.filter((s) => s.role === role).slice(0, 6);
            const max = Math.max(1, ...rows.map((r) => r.n));
            return (
              <div key={role}>
                <p className="mb-2 text-xs font-semibold">{roleLabel(role)}</p>
                {rows.length ? rows.map((s, i) => (
                  <div key={s.path} className="mb-2">
                    <div className="mb-0.5 flex justify-between gap-2 text-[11px]"><span className="truncate">{pageLabel(s.path)}</span><b>{s.n.toLocaleString()}</b></div>
                    <Meter value={(s.n / max) * 100} delay={i * 0.04} />
                  </div>
                )) : <p className="text-[11px] text-sb-on-surface-variant">Sin uso en 30 días.</p>}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
