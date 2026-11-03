"use client";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Card, Empty, PageTitle, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { LiveDot, useLive } from "@/components/dev/DevKit";
import { cn } from "@/lib/cn";
import type { Check, Level } from "@/lib/dev-health";

type Health = {
  level: Level; checks: Check[];
  long: { pid: number; secs: number; state: string; query: string }[];
  dead: { name: string; live: number; dead: number; vacuum: string | null; analyze: string | null }[];
  unused: { table: string; index: string; bytes: number }[];
  slow: { query: string; calls: number; mean_ms: number; max_ms: number }[];
};

/** Estado: siempre ícono + palabra (nunca solo color) */
const STATUS: Record<Level, { label: string; icon: typeof CheckCircle2; text: string; soft: string }> = {
  good: { label: "Bien", icon: CheckCircle2, text: "text-sb-ontime", soft: "bg-sb-ontime-soft" },
  warn: { label: "Atención", icon: AlertTriangle, text: "text-amber-600 dark:text-amber-400", soft: "bg-amber-500/10" },
  crit: { label: "Crítico", icon: XCircle, text: "text-sb-late", soft: "bg-sb-late-soft" },
};
const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);

/** Consola The Iceberg Labs · Salud de la base: cada punto con su semáforo, medido en tiempo real. */
export default function DevHealth() {
  const { data: d, at } = useLive<Health>("/api/dev/health", 6000);
  if (!d) return <div className="p-6 text-sm text-sb-on-surface-variant">Revisando la base…</div>;
  const S = STATUS[d.level];
  const counts = { warn: d.checks.filter((c) => c.level === "warn").length, crit: d.checks.filter((c) => c.level === "crit").length };

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Salud de la base" sub="Postgres en Supabase, medido ahora mismo: respuesta, conexiones, caché, consultas lentas, bloqueos y limpieza.">
        <LiveDot at={at} />
      </PageTitle>

      <Card className={cn("flex items-center gap-3 p-4 text-sm", S.soft)}>
        <S.icon className={cn("h-6 w-6 shrink-0", S.text)} />
        <span>
          <b className={S.text}>{S.label}.</b>{" "}
          {d.level === "good" ? "Todos los puntos están en rango." : `${counts.crit ? `${counts.crit} en crítico` : ""}${counts.crit && counts.warn ? " y " : ""}${counts.warn ? `${counts.warn} en atención` : ""}. Revisa los marcados abajo.`}
        </span>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {d.checks.map((c, i) => {
          const s = STATUS[c.level];
          return (
            <motion.div key={c.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="flex h-full flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-sb-on-surface-variant/70">{c.label}</span>
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", s.soft, s.text)}><s.icon className="h-3 w-3" />{s.label}</span>
                </div>
                <b className="text-lg font-bold tracking-tight">{c.value}</b>
                <p className="text-[11px] leading-snug text-sb-on-surface-variant">{c.hint}</p>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 pt-4"><h3 className="text-sm font-semibold">Consultas en curso de más de 5 segundos</h3></div>
        <Table>
          <Thead><Th>Proceso</Th><Th className="text-right">Lleva</Th><Th>Estado</Th><Th>Consulta</Th></Thead>
          <tbody>
            {!d.long.length ? <Empty cols={4}>Ninguna consulta trabada en este momento.</Empty> : d.long.map((q) => (
              <Tr key={q.pid}><Td className="font-mono">{q.pid}</Td><Td className="text-right font-semibold">{q.secs} s</Td><Td>{q.state}</Td><Td className="max-w-[560px] whitespace-normal font-mono text-[10.5px]">{q.query}</Td></Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="px-5 pt-4">
            <h3 className="text-sm font-semibold">Consultas más lentas en promedio</h3>
            <p className="text-[11px] text-sb-on-surface-variant">Medido por Postgres (pg_stat_statements). Las que pasan de 500 ms conviene optimizarlas.</p>
          </div>
          <Table>
            <Thead><Th>Consulta</Th><Th className="text-right">Veces</Th><Th className="text-right">Promedio</Th><Th className="text-right">Peor</Th></Thead>
            <tbody>
              {!d.slow.length ? <Empty cols={4}>Sin datos de pg_stat_statements en esta base.</Empty> : d.slow.map((q, i) => (
                <Tr key={i}>
                  <Td className="max-w-[360px] whitespace-normal font-mono text-[10.5px] leading-snug">{q.query}</Td>
                  <Td className="text-right">{Number(q.calls).toLocaleString()}</Td>
                  <Td className={cn("text-right font-semibold", Number(q.mean_ms) >= 500 && "text-sb-late")}>{Number(q.mean_ms).toLocaleString()} ms</Td>
                  <Td className="text-right text-sb-on-surface-variant">{Number(q.max_ms).toLocaleString()} ms</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card className="overflow-hidden">
          <div className="px-5 pt-4">
            <h3 className="text-sm font-semibold">Limpieza de tablas</h3>
            <p className="text-[11px] text-sb-on-surface-variant">Filas muertas y la última limpieza (vacuum) y estadística (analyze) de cada tabla.</p>
          </div>
          <Table>
            <Thead><Th>Tabla</Th><Th className="text-right">Filas</Th><Th className="text-right">Muertas</Th><Th>Última limpieza</Th></Thead>
            <tbody>
              {d.dead.slice(0, 12).map((t) => {
                const pct = t.live + t.dead ? (t.dead / (t.live + t.dead)) * 100 : 0;
                return (
                  <Tr key={t.name}>
                    <Td className="font-mono">{t.name}</Td>
                    <Td className="text-right">{t.live.toLocaleString()}</Td>
                    <Td className={cn("text-right", pct >= 20 && t.live + t.dead > 1000 && "font-semibold text-sb-late")}>{t.dead.toLocaleString()} <span className="text-sb-on-surface-variant">({pct.toFixed(0)}%)</span></Td>
                    <Td className="text-[11px]">{t.vacuum ?? "—"}<span className="block text-sb-on-surface-variant">analyze {t.analyze ?? "—"}</span></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 pt-4">
          <h3 className="text-sm font-semibold">Índices que nunca se usan</h3>
          <p className="text-[11px] text-sb-on-surface-variant">Ocupan espacio y hacen más lento cada guardado. Antes de quitar uno, confirma que no lo use un reporte mensual.</p>
        </div>
        <Table>
          <Thead><Th>Tabla</Th><Th>Índice</Th><Th className="text-right">Espacio</Th></Thead>
          <tbody>
            {!d.unused.length ? <Empty cols={3}>Todos los índices se usan.</Empty> : d.unused.map((u) => (
              <Tr key={u.index}><Td className="font-mono">{u.table}</Td><Td className="font-mono">{u.index}</Td><Td className="text-right">{size(Number(u.bytes))}</Td></Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
