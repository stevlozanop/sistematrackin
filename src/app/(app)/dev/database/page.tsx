"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Database, HardDrive, KeyRound, Layers, Search, Server, Table2, Terminal, User } from "lucide-react";
import { Card, Pill } from "@/components/ui";
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
  unit_events: "Historial: cada fecha registrada, quién y cuándo.",
  dealers: "Tiendas que reciben las unidades (se crean con el Excel) y su consorcio.",
  containers: "Contenedores embarcados en Iquitos y su nave.",
  vessels: "Naves y chatas: tamaño de bodega para el plano de estiba.",
  dispatches: "Viajes de camión despachados desde el almacén.",
  dispatch_stops: "Paradas de cada viaje en orden, con su llegada.",
  receptions: "Lo que confirmó el dealer al recibir (completo u observación).",
  lead_times: "Plazos en días por departamento (PCL) o ruta (YUR).",
  district_routes: "Ruta 1, 2… de Yurimaguas que le toca a cada distrito.",
  settings: "Meta %, meses de creciente y días de aviso.",
  users: "Cuentas: The Iceberg Labs, supervisores, encargados, consorcios y clientes.",
  user_stages: "Etapas asignadas a cada encargado.",
  companies: "Empresas: la transportista (Consorcio Leyva) y sus consorcios clientes.",
  licenses: "Licencia de cada empresa: plan, vencimiento y cuentas.",
  license_events: "Cambios en las licencias (quién y cuándo).",
  license_payments: "Cobros de la licencia y su estado.",
  import_batches: "Cada Excel subido: archivo, filas y resultado.",
  import_stash: "Excel guardado temporalmente mientras se procesa.",
  data_version: "Marca de cambio de datos (para refrescar pantallas).",
  auth_events: "Inicios de sesión, fallos y salidas.",
  auth_blocks: "Bloqueos por intentos fallidos.",
  account_events: "Cambios en cuentas: creación, clave, rol.",
  api_usage: "Consumo de la API por día y rol.",
  assistant_log: "Preguntas al asistente y lo que respondió.",
  page_views: "Pantallas visitadas.",
  push_subscriptions: "Celulares y navegadores suscritos a avisos.",
  push_log: "Avisos enviados.",
  dev_actions: "Acciones de The Iceberg Labs en la consola.",
  platform: "Estado de la plataforma: mantenimiento y avisos.",
};

/** Grupos de tablas, en el orden en que se muestran. */
const GROUPS: [string, string[]][] = [
  ["Operación", ["units", "v_units", "unit_events", "dealers", "containers", "vessels", "dispatches", "dispatch_stops", "receptions", "lead_times", "district_routes", "settings"]],
  ["Cuentas y empresas", ["users", "user_stages", "companies", "licenses", "license_events", "license_payments"]],
  ["Carga de Excel", ["import_batches", "import_stash", "data_version"]],
  ["Registro y seguridad", ["auth_events", "auth_blocks", "account_events", "api_usage", "assistant_log", "page_views", "push_subscriptions", "push_log", "dev_actions", "platform"]],
];

const fmt = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "object" ? JSON.stringify(v) : String(v));
const kb = (v: number) => (v >= 1024 ? `${(v / 1024).toFixed(1)} MB` : `${v.toLocaleString("es-PE")} KB`);

export default function DevDatabase() {
  const [info, setInfo] = useState<Info | null>(null);
  const [sel, setSel] = useState<string>("units");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"cols" | "rows">("cols");

  useEffect(() => { fetch("/api/dev/db").then((r) => r.json()).then(setInfo); }, []);
  useEffect(() => {
    let alive = true;
    fetch(`/api/dev/db?table=${encodeURIComponent(sel)}`).then((r) => r.json()).then((d) => alive && setDetail(d));
    return () => { alive = false; };
  }, [sel]);

  const groups = useMemo(() => {
    if (!info) return [];
    const needle = q.trim().toLowerCase();
    const match = (t: TableRow) => !needle || t.name.includes(needle) || (ABOUT[t.name] ?? "").toLowerCase().includes(needle);
    const known = new Set(GROUPS.flatMap(([, l]) => l));
    const all: [string, string[]][] = [...GROUPS, ["Otras", info.tables.map((t) => t.name).filter((n) => !known.has(n))]];
    return all.map(([g, names]) => [g, names.map((n) => info.tables.find((t) => t.name === n)).filter((t): t is TableRow => !!t && match(t))] as const).filter(([, l]) => l.length);
  }, [info, q]);

  if (!info) {
    return <div className="flex flex-col gap-3 lg:h-[calc(100dvh-5rem)]">{[0, 1].map((i) => <div key={i} className={cn("animate-pulse rounded-3xl bg-sb-surface-container-low", i ? "flex-1 min-h-64" : "h-16")} />)}</div>;
  }
  const c = info.connection;
  const total = info.tables.reduce((s, t) => s + t.size_kb, 0);
  const biggest = Math.max(1, ...info.tables.map((t) => t.size_kb));
  const shown = detail && detail.table?.name === sel ? detail : null;
  const idx = shown ? [...new Set(shown.indexes.map((x) => x.Key_name))] : [];
  const indexed = new Set(shown?.indexes.map((x) => x.Column_name) ?? []);

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-5rem)]">
      {/* Conexión en una sola franja */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="mr-auto min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Base de datos</h1>
          <p className="text-[11px] text-sb-on-surface-variant">Conexión real de la app y sus tablas · {info.tables.length} tablas · {kb(total)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {([[Database, c.database], [Server, `${c.host}:${c.port}`], [User, c.user], [HardDrive, `${c.engine} ${c.version.split("-")[0]}`], [Layers, `pool ${c.poolLimit} · ${c.charset}`]] as const).map(([Icon, v], i) => (
            <span key={i} className="flex max-w-[16rem] items-center gap-1.5 rounded-full bg-sb-surface-container-low px-2.5 py-1 font-mono text-sb-on-surface-variant" title={String(v)}>
              <Icon className="h-3 w-3 shrink-0" /><span className="truncate">{v}</span>
            </span>
          ))}
          <Link href="/dev/sql" className="sb-pill flex items-center gap-1.5 rounded-full bg-sb-primary px-3 py-1 font-semibold text-sb-on-primary"><Terminal className="h-3.5 w-3.5" /> Consola SQL</Link>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[19rem_minmax(0,1fr)]">
        {/* Tablas */}
        <Card className="flex max-h-[45vh] min-h-0 flex-col overflow-hidden lg:max-h-none">
          <div className="border-b border-sb-outline-variant/40 p-2.5">
            <label className="flex h-9 items-center gap-2 rounded-full bg-sb-surface-container-low px-3 text-[13px]">
              <Search className="h-3.5 w-3.5 shrink-0 text-sb-on-surface-variant" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tabla…" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-sb-on-surface-variant/60" />
            </label>
          </div>
          <div className="scroll-hidden min-h-0 flex-1 overflow-y-auto p-1.5">
            {groups.map(([g, list]) => (
              <div key={g} className="mb-1">
                <p className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">{g}</p>
                {list.map((t) => {
                  const on = sel === t.name;
                  return (
                    <button key={t.name} type="button" onClick={() => setSel(t.name)} title={ABOUT[t.name] ?? t.name}
                      className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors", on ? "bg-sb-primary-soft" : "hover:bg-sb-surface-container-low")}>
                      <Table2 className={cn("h-3.5 w-3.5 shrink-0", t.kind === "VIEW" ? "text-sb-on-surface-variant/60" : on ? "text-sb-primary" : "text-sb-on-surface-variant")} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("flex items-center gap-1.5 truncate font-mono text-[12px]", on && "font-semibold text-sb-primary")}>{t.name}{t.kind === "VIEW" && <span className="rounded-full bg-sb-surface-container px-1.5 font-sans text-[9px] text-sb-on-surface-variant">vista</span>}</span>
                        {t.kind !== "VIEW" && <span className="mt-1 flex h-0.5 w-full overflow-hidden rounded-full bg-sb-surface-container"><span className="bg-sb-primary/60" style={{ width: `${Math.max(2, (t.size_kb / biggest) * 100)}%` }} /></span>}
                      </span>
                      <span className="shrink-0 text-right text-[11px] font-semibold tabular-nums">{t.rows !== null ? t.rows.toLocaleString("es-PE") : "—"}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {!groups.length && <p className="px-3 py-8 text-center text-xs text-sb-on-surface-variant">Ninguna tabla coincide.</p>}
          </div>
        </Card>

        {/* Detalle */}
        <Card className="flex min-h-[28rem] min-w-0 flex-col overflow-hidden lg:min-h-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-sb-outline-variant/40 px-4 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sb-primary-soft text-sb-primary"><Table2 className="h-[18px] w-[18px]" /></span>
            <div className="mr-auto min-w-0">
              <h3 className="truncate font-mono text-sm font-semibold">{sel}</h3>
              <p className="truncate text-[11px] text-sb-on-surface-variant">{ABOUT[sel] ?? "Sin descripción"}</p>
            </div>
            {shown && (
              <div className="flex flex-wrap gap-1.5 text-[11px] tabular-nums">
                {[`${(info.tables.find((t) => t.name === sel)?.rows ?? shown.table.rows ?? 0).toLocaleString("es-PE")} filas`, shown.table.kind !== "VIEW" ? kb(shown.table.size_kb) : "vista", `${shown.columns.length} columnas`, `${idx.length} índices`].map((v) => (
                  <span key={v} className="rounded-full bg-sb-surface-container-low px-2.5 py-1 text-sb-on-surface-variant">{v}</span>
                ))}
              </div>
            )}
            <div className="flex rounded-full bg-sb-surface-container p-0.5">
              {([["cols", "Estructura"], ["rows", `Filas${shown ? ` · ${shown.sample.length}` : ""}`]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
                  className={cn("sb-pill rounded-full px-3 py-1 text-[11px] font-semibold", tab === k ? "bg-sb-surface text-sb-on-surface shadow-sm" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>{l}</button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {!shown ? (
              <div className="flex flex-col gap-1.5 p-4">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-sb-surface-container-low" />)}</div>
            ) : tab === "cols" ? (
              <div className="p-2 sm:p-3">
                <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_3rem] gap-x-3 px-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_3rem_minmax(0,1fr)]">
                  <span>Columna</span><span>Tipo</span><span>Nulo</span><span className="hidden sm:block">Default · nota</span>
                </div>
                {shown.columns.map((col) => {
                  const note = [col.Key === "UNI" ? "único" : col.Key === "MUL" || indexed.has(col.Field) && col.Key !== "PRI" ? "índice" : "", col.Extra, col.Comment].filter(Boolean).join(" · ");
                  return (
                    <div key={col.Field} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_3rem] items-center gap-x-3 rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:bg-sb-surface-container-low sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_3rem_minmax(0,1fr)]">
                      <span className="flex min-w-0 items-center gap-1.5 font-mono">
                        {col.Key === "PRI" ? <KeyRound className="h-3 w-3 shrink-0 text-sb-primary" /> : <span className="w-3 shrink-0" />}
                        <span className="truncate">{col.Field}</span>
                      </span>
                      <span className="truncate font-mono text-[11px] text-sb-on-surface-variant" title={col.Type}>{col.Type}</span>
                      <span className={cn("text-[11px]", col.Null === "YES" ? "text-sb-on-surface-variant" : "font-semibold")}>{col.Null === "YES" ? "sí" : "no"}</span>
                      <span className="hidden min-w-0 truncate text-[11px] text-sb-on-surface-variant sm:block" title={[col.Default, note].filter(Boolean).join(" · ")}>
                        {col.Default && <span className="font-mono">{col.Default}</span>}{col.Default && note ? " · " : ""}{note}{!col.Default && !note ? "—" : ""}
                      </span>
                    </div>
                  );
                })}
                {idx.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-sb-outline-variant/30 px-2.5 pt-3">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">Índices</span>
                    {idx.map((k) => <Pill key={k}>{k}: {shown.indexes.filter((x) => x.Key_name === k).map((x) => x.Column_name).join(", ")}</Pill>)}
                  </div>
                )}
              </div>
            ) : !shown.sample.length ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-xs text-sb-on-surface-variant"><Table2 className="h-6 w-6 opacity-40" />La tabla está vacía.</div>
            ) : (
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 z-10 bg-sb-surface">
                  <tr className="border-b border-sb-outline-variant/40">{Object.keys(shown.sample[0]).map((k) => <th key={k} className="whitespace-nowrap px-3 py-2 font-mono font-semibold">{k}</th>)}</tr>
                </thead>
                <tbody>
                  {shown.sample.map((r, i) => (
                    <tr key={i} className="border-b border-sb-outline-variant/15 transition-colors hover:bg-sb-surface-container-low">
                      {Object.values(r).map((v, j) => <td key={j} title={fmt(v)} className={cn("max-w-[16rem] truncate whitespace-nowrap px-3 py-1.5 font-mono", v === null && "text-sb-on-surface-variant/50")}>{fmt(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {shown && tab === "rows" && <p className="border-t border-sb-outline-variant/30 px-4 py-1.5 text-[10px] text-sb-on-surface-variant">Últimas {shown.sample.length} filas{shown.table.updated ? ` · actualizada ${shown.table.updated}` : ""} · las claves se ocultan</p>}
        </Card>
      </div>
    </div>
  );
}
