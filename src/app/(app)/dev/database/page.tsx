"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Database, HardDrive, KeyRound, Server, Table2, Terminal, User } from "lucide-react";
import { Card, PageTitle, Pill } from "@/components/ui";
import { StatGrid } from "@/components/StatCard";
import { cn } from "@/lib/cn";

type TableRow = { name: string; kind: string; engine: string | null; rows: number | null; size_kb: number; updated: string | null; collation: string | null };
type Info = {
  connection: { host: string; port: number; user: string; database: string; poolLimit: number; engine: string; version: string; charset: string; collation: string };
  tables: TableRow[];
};
type Detail = {
  table: TableRow;
  columns: { Field: string; Type: string; Null: string; Key: string; Default: string | null; Extra: string; Comment: string }[];
  indexes: { Key_name: string; Column_name: string; Non_unique: number }[];
  sample: Record<string, unknown>[];
};

/** Qué guarda cada tabla, en palabras simples. */
const ABOUT: Record<string, string> = {
  units: "Cada moto o motokar: chasis, dealer y las fechas de cada etapa.",
  v_units: "Vista: unidades con estado, plazo, fecha estimada y nivel de servicio ya calculados.",
  users: "Cuentas: SWM Labs, supervisores, encargados, solo lectura y dealers.",
  companies: "Empresas: la transportista (Consorcio Leyva) y sus consorcios (Honda…).",
  dealers: "Tiendas que reciben las unidades (se crean con el Excel).",
  unit_events: "Historial: cada fecha registrada, quién y cuándo.",
  user_stages: "Etapas asignadas a cada encargado.",
  lead_times: "Plazos en días por departamento (PCL) o ruta (YUR).",
  settings: "Meta %, meses de creciente y días de aviso.",
};

const fmt = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default function DevDatabase() {
  const [info, setInfo] = useState<Info | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => { fetch("/api/dev/db").then((r) => r.json()).then(setInfo); }, []);
  useEffect(() => {
    if (!sel) return;
    let alive = true;
    fetch(`/api/dev/db?table=${encodeURIComponent(sel)}`).then((r) => r.json()).then((d) => alive && setDetail(d));
    return () => { alive = false; };
  }, [sel]);

  if (!info) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando base de datos…</div>;
  const c = info.connection;
  const total = info.tables.reduce((s, t) => s + t.size_kb, 0);
  const shown = detail && detail.table.name === sel ? detail : null;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Base de datos" sub="Conexión real de la app (de .env) y las tablas del sistema. Toca una tabla para ver sus columnas y últimas filas.">
        <Link href="/dev/sql" className="sbf-chip flex items-center gap-1.5"><Terminal className="h-3.5 w-3.5" /> Consola SQL</Link>
      </PageTitle>

      <StatGrid
        className="grid-cols-2 lg:grid-cols-4"
        items={[
          { label: "Base de datos", value: c.database, icon: Database },
          { label: "Servidor", value: `${c.host}:${c.port}`, icon: Server },
          { label: "Usuario", value: c.user, icon: User },
          { label: "Motor", value: `${c.engine} ${c.version.split("-")[0]}`, icon: HardDrive },
        ]}
      />
      <p className="-mt-2 text-[11px] text-sb-on-surface-variant">{c.charset} · {c.collation} · pool de {c.poolLimit} conexiones · {(total / 1024).toFixed(1)} MB en total</p>

      <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
        <Card className="overflow-hidden">
          {info.tables.map((t) => (
            <button key={t.name} type="button" onClick={() => setSel(t.name)}
              className={cn("flex w-full items-start gap-2.5 border-b border-sb-outline-variant/25 px-4 py-2.5 text-left text-xs last:border-0 hover:bg-sb-surface-container-low", sel === t.name && "bg-sb-surface-container")}>
              <Table2 className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", t.kind === "VIEW" ? "text-sb-on-surface-variant/50" : "text-sb-primary")} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-mono font-medium">{t.name}{t.kind === "VIEW" && <Pill>vista</Pill>}</span>
                <span className="block text-[11px] text-sb-on-surface-variant">{ABOUT[t.name] ?? "—"}</span>
              </span>
              <span className="shrink-0 text-right text-[11px] text-sb-on-surface-variant">
                {t.rows !== null && <b className="block text-sb-on-surface">{t.rows.toLocaleString()}</b>}
                {t.kind !== "VIEW" && `${t.size_kb.toLocaleString()} KB`}
              </span>
            </button>
          ))}
        </Card>

        <Card className="min-w-0 p-5">
          {!sel ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-sm text-sb-on-surface-variant">
              <Table2 className="h-8 w-8 opacity-40" /> Elige una tabla para ver su estructura.
            </div>
          ) : !shown ? (
            <p className="text-sm text-sb-on-surface-variant">Cargando {sel}…</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="font-mono text-base font-semibold">{shown.table.name}</h3>
                <p className="text-[12px] text-sb-on-surface-variant">
                  {ABOUT[shown.table.name] ?? ""} {shown.table.engine ? `· ${shown.table.engine}` : ""}{shown.table.updated ? ` · actualizada ${shown.table.updated}` : ""}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead><tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant/60">
                    <th className="py-2 pr-3">Columna</th><th className="py-2 pr-3">Tipo</th><th className="py-2 pr-3">Nulo</th><th className="py-2 pr-3">Default</th><th className="py-2">Nota</th>
                  </tr></thead>
                  <tbody>
                    {shown.columns.map((col) => (
                      <tr key={col.Field} className="border-b border-sb-outline-variant/20 last:border-0">
                        <td className="py-1.5 pr-3 font-mono">
                          <span className="flex items-center gap-1">{col.Key === "PRI" && <KeyRound className="h-3 w-3 text-sb-primary" />}{col.Field}</span>
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-sb-on-surface-variant">{col.Type}</td>
                        <td className="py-1.5 pr-3">{col.Null === "YES" ? "sí" : "no"}</td>
                        <td className="py-1.5 pr-3 font-mono text-sb-on-surface-variant">{col.Default ?? "—"}</td>
                        <td className="py-1.5 text-sb-on-surface-variant">{[col.Key === "UNI" ? "único" : col.Key === "MUL" ? "índice" : "", col.Extra, col.Comment].filter(Boolean).join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {shown.indexes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {[...new Set(shown.indexes.map((x) => x.Key_name))].map((k) => (
                    <Pill key={k}>{k}: {shown.indexes.filter((x) => x.Key_name === k).map((x) => x.Column_name).join(", ")}</Pill>
                  ))}
                </div>
              )}

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-sb-on-surface-variant/60">Últimas {shown.sample.length} filas</p>
                <div className="max-h-80 overflow-auto rounded-xl border border-sb-outline-variant/30">
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 bg-sb-surface-container-low">
                      <tr>{Object.keys(shown.sample[0] ?? {}).map((k) => <th key={k} className="whitespace-nowrap px-2 py-1.5 font-mono font-semibold">{k}</th>)}</tr>
                    </thead>
                    <tbody>
                      {shown.sample.map((r, i) => (
                        <tr key={i} className="border-t border-sb-outline-variant/20">
                          {Object.values(r).map((v, j) => <td key={j} className={cn("max-w-[16rem] truncate whitespace-nowrap px-2 py-1 font-mono", v === null && "text-sb-on-surface-variant/50")}>{fmt(v)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
