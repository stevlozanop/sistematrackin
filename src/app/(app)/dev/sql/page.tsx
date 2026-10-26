"use client";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { Button, toast } from "@heroui/react";
import { Download, History, Lock, Play, Trash2 } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { cn } from "@/lib/cn";

type Result = { columns: string[]; rows: Record<string, unknown>[]; total: number; truncated: boolean; ms: number } | { error: string; ms?: number };
type Past = { sql: string; at: string; ok: boolean; rows?: number };

/** Consultas listas para lo que más se revisa. */
const EXAMPLES: { label: string; sql: string }[] = [
  { label: "Empresas y consorcios", sql: "SELECT c.id, c.name, c.kind, p.name AS creada_por, c.created_at,\n  (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) AS cuentas\nFROM companies c LEFT JOIN companies p ON p.id = c.parent_id\nORDER BY c.id" },
  { label: "Cuentas por empresa y tipo", sql: "SELECT IFNULL(c.name, 'The Iceberg Labs / sin empresa') AS empresa, u.role, COUNT(*) AS cuentas\nFROM users u LEFT JOIN companies c ON c.id = u.company_id\nGROUP BY empresa, u.role ORDER BY empresa, u.role" },
  { label: "Dealers sin cuenta", sql: "SELECT d.id, d.name, d.department, COUNT(un.id) AS unidades\nFROM dealers d LEFT JOIN units un ON un.dealer_id = d.id\nWHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.dealer_id = d.id)\nGROUP BY d.id ORDER BY unidades DESC" },
  { label: "% a tiempo por transportista", sql: "SELECT UPPER(carrier) AS transportista, COUNT(*) AS unidades,\n  ROUND(100 * SUM(service = 'A TIEMPO') / COUNT(*)) AS pct_a_tiempo\nFROM v_units WHERE carrier IS NOT NULL AND carrier <> ''\nGROUP BY UPPER(carrier) ORDER BY unidades DESC LIMIT 20" },
  { label: "Unidades por estado", sql: "SELECT site, status, COUNT(*) AS unidades FROM v_units GROUP BY site, status ORDER BY site, unidades DESC" },
  { label: "Últimos registros", sql: "SELECT e.at, us.name AS usuario, un.site, un.chassis, e.field, e.old_value, e.new_value\nFROM unit_events e JOIN units un ON un.id = e.unit_id LEFT JOIN users us ON us.id = e.user_id\nORDER BY e.id DESC LIMIT 50" },
];

const KEY = "swm-sql-history";
const load = (): Past[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };
const fmt = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default function DevSql() {
  const [sql, setSql] = useState(EXAMPLES[0].sql);
  const [res, setRes] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);
  const [past, setPast] = useState<Past[]>([]);
  useEffect(() => { setPast(load()); }, []); // eslint-disable-line react-hooks/set-state-in-effect -- historial local del navegador

  const remember = (p: Past) => {
    const next = [p, ...past.filter((x) => x.sql !== p.sql)].slice(0, 20);
    setPast(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* sin almacenamiento: solo en esta sesión */ }
  };

  async function run() {
    if (!sql.trim()) return;
    setRunning(true);
    const r = await fetch("/api/dev/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql }) });
    const j: Result = await r.json().catch(() => ({ error: "Error del servidor" }));
    setRunning(false);
    setRes(j);
    remember({ sql, at: new Date().toLocaleTimeString(), ok: !("error" in j), rows: "rows" in j ? j.total : undefined });
  }

  function exportXlsx() {
    if (!res || "error" in res) return;
    const ws = XLSX.utils.json_to_sheet(res.rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null ? "" : typeof v === "object" ? JSON.stringify(v) : v]))));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consulta");
    XLSX.writeFile(wb, `consulta-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.xlsx`);
    toast.success("Excel descargado");
  }

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Consola SQL" sub="Consulta la base de datos directamente. Ctrl + Enter para ejecutar.">
        <span className="flex items-center gap-1.5 rounded-full bg-sb-surface-container-high px-3 py-1 text-[11px] text-sb-on-surface-variant">
          <Lock className="h-3.5 w-3.5" /> Solo lectura · máx. 10 s y 1000 filas
        </span>
      </PageTitle>

      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((e) => <button key={e.label} className={`sbf-chip ${sql === e.sql ? "active" : ""}`} onClick={() => setSql(e.sql)}>{e.label}</button>)}
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); } }}
          spellCheck={false}
          rows={7}
          aria-label="Consulta SQL"
          className="w-full resize-y rounded-xl border border-sb-outline-variant bg-sb-surface-container-low p-3 font-mono text-[13px] leading-relaxed outline-none focus:border-sb-primary"
          placeholder="SELECT * FROM companies"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-sb-on-surface-variant">SELECT, SHOW, DESCRIBE, EXPLAIN o WITH. Para cambiar datos usa las pantallas del sistema.</span>
          <div className="flex gap-2">
            {res && !("error" in res) && res.rows.length > 0 && (
              <Button size="sm" variant="secondary" className="rounded-full" onPress={exportXlsx}><Download className="h-3.5 w-3.5" /> Excel</Button>
            )}
            <Button size="sm" variant="primary" className="rounded-full" isDisabled={running} onPress={run}><Play className="h-3.5 w-3.5" /> {running ? "Ejecutando…" : "Ejecutar"}</Button>
          </div>
        </div>
      </Card>

      {res && (
        "error" in res ? (
          <Card className="border-sb-late/40 px-4 py-3 font-mono text-xs text-sb-late">{res.error}</Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="border-b border-sb-outline-variant/30 px-4 py-2 text-[11px] text-sb-on-surface-variant">
              {res.total.toLocaleString()} {res.total === 1 ? "fila" : "filas"} · {res.ms} ms{res.truncated ? " · se muestran las primeras 1000" : ""}
            </div>
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-sb-surface-container-low">
                  <tr>{res.columns.map((k) => <th key={k} className="whitespace-nowrap px-3 py-2 font-mono font-semibold">{k}</th>)}</tr>
                </thead>
                <tbody>
                  {res.rows.map((r, i) => (
                    <tr key={i} className="border-t border-sb-outline-variant/20 hover:bg-sb-surface-container-low">
                      {res.columns.map((k) => <td key={k} className={cn("max-w-[20rem] truncate whitespace-nowrap px-3 py-1.5 font-mono", r[k] === null && "text-sb-on-surface-variant/50")} title={fmt(r[k])}>{fmt(r[k])}</td>)}
                    </tr>
                  ))}
                  {!res.rows.length && <tr><td className="px-3 py-6 text-center text-sb-on-surface-variant" colSpan={res.columns.length || 1}>Sin filas.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        )
      )}

      {past.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sb-on-surface-variant/60"><History className="h-3.5 w-3.5" /> Historial (este navegador)</span>
            <button className="flex items-center gap-1 text-[11px] text-sb-on-surface-variant hover:text-sb-on-surface" onClick={() => { setPast([]); try { localStorage.removeItem(KEY); } catch { /* nada */ } }}>
              <Trash2 className="h-3 w-3" /> Borrar
            </button>
          </div>
          {past.map((p, i) => (
            <button key={i} onClick={() => setSql(p.sql)} className="flex w-full items-center gap-2 border-b border-sb-outline-variant/20 py-1.5 text-left text-[11px] last:border-0 hover:text-sb-primary">
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", p.ok ? "bg-sb-primary" : "bg-sb-late")} />
              <span className="min-w-0 flex-1 truncate font-mono">{p.sql.replace(/\s+/g, " ")}</span>
              <span className="shrink-0 text-sb-on-surface-variant">{p.rows !== undefined ? `${p.rows} filas · ` : ""}{p.at}</span>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
