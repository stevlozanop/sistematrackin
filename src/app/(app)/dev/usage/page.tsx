"use client";
import { useState } from "react";
import { Cable, Database, Gauge, HardDrive, Repeat2, Server } from "lucide-react";
import { Card, Empty, PageTitle, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { StatGrid } from "@/components/StatCard";
import { Bars, Chips, LiveDot, roleLabel, useLive } from "@/components/dev/DevKit";
import { cn } from "@/lib/cn";

type Usage = {
  db: { mb: number; limitMb: number; version: string };
  tables: { name: string; rows: number; bytes: number; index_bytes: number; seq_scan: number; idx_scan: number; ins: number; upd: number; del: number }[];
  connections: { byState: { state: string; n: number }[]; max: number };
  stats: { commits: number; rollbacks: number; hit: number; read: number; returned: number; inserted: number; updated: number; deleted: number; since: string | null } | null;
  statements: { query: string; calls: number; total_ms: number; mean_ms: number; rows: number }[];
  days: { api: { d: string; role: string; n: number }[]; views: { d: string; n: number }[]; events: { d: string; n: number }[] };
};

const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} kB` : `${b} B`);
const big = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)} k` : n.toLocaleString());
const STATE: Record<string, string> = { active: "Ejecutando", idle: "En espera", "idle in transaction": "En transacción", otro: "Internas" };

const SERIES = [
  { key: "api", label: "Llamadas a la API" },
  { key: "views", label: "Pantallas abiertas" },
  { key: "events", label: "Fechas registradas" },
] as const;
type Serie = (typeof SERIES)[number]["key"];

/** Últimos 30 días, uno por uno (los días sin actividad van en cero) */
function lastDays() {
  const out: string[] = [];
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

/** Consola The Iceberg Labs · Consumo real de la base de datos y del servidor. */
export default function DevUsage() {
  const { data: d, at } = useLive<Usage>("/api/dev/usage", 10000);
  const [serie, setSerie] = useState<Serie>("api");
  if (!d) return <div className="p-6 text-sm text-sb-on-surface-variant">Midiendo el consumo…</div>;
  const used = Math.min(100, (d.db.mb / d.db.limitMb) * 100);
  const conns = d.connections.byState.reduce((t, c) => t + c.n, 0);
  const s = d.stats;
  const hit = s && s.hit + s.read ? (s.hit / (s.hit + s.read)) * 100 : null;
  const days = lastDays();
  const perDay = (rows: { d: string; n: number }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.d, (m.get(r.d) ?? 0) + r.n);
    return days.map((day) => ({ label: day, value: m.get(day) ?? 0, title: day.slice(5).split("-").reverse().join("/") }));
  };
  const series = perDay(d.days[serie]);
  const apiByRole = Object.entries(d.days.api.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.role]: (acc[r.role] ?? 0) + r.n }), {})).sort((a, b) => b[1] - a[1]);
  const apiTotal = apiByRole.reduce((t, [, n]) => t + n, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Consumo" sub={`Lo que la plataforma consume de verdad: espacio, conexiones, consultas y llamadas. PostgreSQL ${d.db.version} en Supabase.`}>
        <LiveDot at={at} />
      </PageTitle>

      <StatGrid
        className="grid-cols-2 lg:grid-cols-5"
        items={[
          { label: `Base de datos (de ${d.db.limitMb} MB)`, value: `${d.db.mb.toFixed(1)} MB · ${used.toFixed(1)}%`, icon: HardDrive },
          { label: "Conexiones abiertas", value: `${conns}${d.connections.max ? ` de ${d.connections.max}` : ""}`, icon: Cable },
          { label: "Aciertos de caché", value: hit === null ? "—" : `${hit.toFixed(2)}%`, icon: Gauge },
          { label: "Transacciones", value: s ? `${big(s.commits)}${s.rollbacks ? ` · ${big(s.rollbacks)} revertidas` : ""}` : "—", icon: Repeat2 },
          { label: "API · 30 días", value: big(apiTotal), icon: Server },
        ]}
      />

      <Card className="p-5">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold">Espacio usado</span>
          <span className="text-sb-on-surface-variant">{d.db.mb.toFixed(1)} MB de {d.db.limitMb} MB · quedan {(d.db.limitMb - d.db.mb).toFixed(0)} MB</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-sb-surface-container-high">
          <div className={cn("h-full rounded-full transition-[width] duration-700", used > 85 ? "bg-sb-late" : "bg-sb-primary")} style={{ width: `${Math.max(1, used)}%` }} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{SERIES.find((x) => x.key === serie)!.label} · últimos 30 días</h3>
              <p className="text-[11px] text-sb-on-surface-variant">{series.reduce((t, x) => t + x.value, 0).toLocaleString()} en total, día por día</p>
            </div>
            <Chips value={serie} onChange={setSerie} options={SERIES.map((x) => ({ key: x.key, label: x.label }))} />
          </div>
          <Bars data={series} tick={(l, i) => (i % 5 === 0 || i === 29 ? l.slice(8, 10) + "/" + l.slice(5, 7) : null)} />
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Quién usa la API · 30 días</h3>
          {apiByRole.length ? apiByRole.map(([r, n]) => (
            <div key={r} className="mb-2.5">
              <div className="mb-1 flex justify-between text-xs"><span>{roleLabel(r)}</span><b>{n.toLocaleString()} <span className="font-normal text-sb-on-surface-variant">· {((n / apiTotal) * 100).toFixed(0)}%</span></b></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-sb-surface-container-high"><div className="h-full rounded-full bg-sb-primary" style={{ width: `${(n / apiTotal) * 100}%` }} /></div>
            </div>
          )) : <p className="py-6 text-center text-xs text-sb-on-surface-variant">Aún sin llamadas registradas.</p>}
          <h3 className="mb-2 mt-5 text-sm font-semibold">Conexiones a la base</h3>
          {d.connections.byState.map((c) => (
            <div key={c.state} className="flex justify-between border-b border-sb-outline-variant/20 py-1.5 text-xs last:border-0"><span>{STATE[c.state] ?? c.state}</span><b>{c.n}</b></div>
          ))}
          {s && <p className="mt-3 text-[11px] text-sb-on-surface-variant">Desde {s.since ?? "el arranque"}: {big(s.returned)} filas leídas · {big(s.inserted)} insertadas · {big(s.updated)} actualizadas · {big(s.deleted)} borradas.</p>}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-4 text-sm font-semibold"><Database className="h-4 w-4" /> Tablas · espacio y movimiento</div>
        <Table>
          <Thead><Th>Tabla</Th><Th className="text-right">Filas</Th><Th className="text-right">Espacio</Th><Th className="text-right">Índices</Th><Th className="text-right">Lecturas (índice · completas)</Th><Th className="text-right">Insertadas</Th><Th className="text-right">Actualizadas</Th><Th className="text-right">Borradas</Th></Thead>
          <tbody>
            {d.tables.map((t) => (
              <Tr key={t.name}>
                <Td className="font-mono">{t.name}</Td>
                <Td className="text-right">{t.rows.toLocaleString()}</Td>
                <Td className="text-right">{size(t.bytes)}</Td>
                <Td className="text-right text-sb-on-surface-variant">{size(t.index_bytes)}</Td>
                <Td className="text-right">{big(t.idx_scan)} · <span className={cn(t.seq_scan > t.idx_scan * 4 && t.rows > 5000 && "font-semibold text-sb-late")}>{big(t.seq_scan)}</span></Td>
                <Td className="text-right">{big(t.ins)}</Td>
                <Td className="text-right">{big(t.upd)}</Td>
                <Td className="text-right">{big(t.del)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 pt-4">
          <h3 className="text-sm font-semibold">Consultas que más tiempo consumen</h3>
          <p className="text-[11px] text-sb-on-surface-variant">Medidas por Postgres (pg_stat_statements) desde el último reinicio de estadísticas.</p>
        </div>
        <Table>
          <Thead><Th>Consulta</Th><Th className="text-right">Veces</Th><Th className="text-right">Tiempo total</Th><Th className="text-right">Promedio</Th><Th className="text-right">Filas</Th></Thead>
          <tbody>
            {!d.statements.length ? <Empty cols={5}>La extensión pg_stat_statements no está disponible en esta base.</Empty> : d.statements.map((q, i) => (
              <Tr key={i}>
                <Td className="max-w-[520px] whitespace-normal font-mono text-[10.5px] leading-snug">{q.query}</Td>
                <Td className="text-right">{big(Number(q.calls))}</Td>
                <Td className="text-right">{Number(q.total_ms) >= 1000 ? `${(Number(q.total_ms) / 1000).toFixed(1)} s` : `${Number(q.total_ms).toFixed(0)} ms`}</Td>
                <Td className="text-right">{Number(q.mean_ms).toFixed(1)} ms</Td>
                <Td className="text-right">{big(Number(q.rows))}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
