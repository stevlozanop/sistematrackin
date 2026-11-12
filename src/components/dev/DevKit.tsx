"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, FileSpreadsheet, LogIn, LogOut, MousePointerClick, PenLine } from "lucide-react";
import { DATA_EVENT } from "@/components/UploadCenter";
import { cn } from "@/lib/cn";
import { isSite } from "@/lib/hsp";
import { ROLE_LABEL, stageLabel, type Role } from "@/lib/workflow";

/** Piezas comunes de la consola The Iceberg Labs: datos en vivo, etiquetas y la gráfica de barras. */

/** Trae datos y los vuelve a traer cada `ms` (solo con la pestaña a la vista) y cuando algo cambia en el sistema */
export function useLive<T>(url: string, ms = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [at, setAt] = useState("");
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (!alive || !j) return;
        setData(j);
        setAt(new Date().toLocaleTimeString("es-PE", { timeZone: "America/Lima" }));
      }).catch(() => {});
    };
    load();
    const t = setInterval(load, ms);
    window.addEventListener(DATA_EVENT, load);
    document.addEventListener("visibilitychange", load);
    return () => { alive = false; clearInterval(t); window.removeEventListener(DATA_EVENT, load); document.removeEventListener("visibilitychange", load); };
  }, [url, ms]);
  return { data, at };
}

/** Nombre de la pantalla a partir de su dirección */
const PAGES: [RegExp, string][] = [
  [/^\/dashboard/, "Dashboard general"], [/^\/live/, "Encargados en vivo"], [/^\/board/, "Tablero mensual"], [/^\/alerts/, "Alertas"],
  [/^\/units\/pcl/i, "PCL · Pucallpa"], [/^\/units\/yur/i, "YUR · Yurimaguas"], [/^\/reports/, "Reportes"],
  [/^\/embarque/, "Embarque y zarpe"], [/^\/guias/, "Carga por guía"], [/^\/my/, "Mi trabajo"],
  [/^\/admins/, "Usuarios"], [/^\/dealers/, "Dealers"], [/^\/settings/, "Plazos y meta"], [/^\/companies/, "Empresas"],
  [/^\/clients/, "Clientes"], [/^\/portal\/resumen/, "Portal · resumen"], [/^\/portal/, "Portal · unidades"], [/^\/profile/, "Mi perfil"],
  [/^\/dev\/users/, "Consola · usuarios"], [/^\/dev\/activity/, "Consola · interacciones"], [/^\/dev\/usage/, "Consola · consumo"],
  [/^\/dev\/database/, "Consola · base de datos"], [/^\/dev\/sql/, "Consola · SQL"], [/^\/dev\/live/, "Consola · en vivo"], [/^\/dev\/adoption/, "Consola · adopción"], [/^\/dev\/security/, "Consola · seguridad"], [/^\/dev\/health/, "Consola · salud de la base"], [/^\/dev\/licenses/, "Consola · licencias"], [/^\/dev\/control/, "Consola · control"], [/^\/dev/, "Consola · dashboard"],
];
export const pageLabel = (path: string | null) => (path ? PAGES.find(([re]) => re.test(path))?.[1] ?? path : "—");

/** Navegador y sistema a partir del user-agent */
export function deviceOf(agent: string | null) {
  if (!agent) return "—";
  const browser = /Edg\//.test(agent) ? "Edge" : /OPR\//.test(agent) ? "Opera" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "Otro";
  const os = /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iPhone" : /Windows/.test(agent) ? "Windows" : /Mac OS X/.test(agent) ? "Mac" : /Linux/.test(agent) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}

export const roleLabel = (r: string | null) => (r && r in ROLE_LABEL ? ROLE_LABEL[r as Role] : "—");

export type FeedRow = {
  kind: "view" | "login" | "fail" | "logout" | "event" | "import";
  at: string; detail: string | null; extra: string | null; n: number;
  user_id: number | null; name: string | null; role: string | null; company: string | null;
};

const KIND = {
  view: { icon: MousePointerClick, tone: "text-sb-on-surface-variant" },
  login: { icon: LogIn, tone: "text-sb-primary" },
  logout: { icon: LogOut, tone: "text-sb-on-surface-variant" },
  fail: { icon: AlertTriangle, tone: "text-sb-late" },
  event: { icon: PenLine, tone: "text-sb-on-surface" },
  import: { icon: FileSpreadsheet, tone: "text-sb-on-surface" },
} as const;

/** Qué hizo, en palabras */
export function whatOf(r: FeedRow) {
  if (r.kind === "view") return <>abrió <b className="font-medium">{pageLabel(r.detail)}</b></>;
  if (r.kind === "login") return <>ingresó al sistema{r.extra ? <span className="text-sb-on-surface-variant"> · IP {r.extra}</span> : null}</>;
  if (r.kind === "logout") return <>cerró sesión</>;
  if (r.kind === "fail") return <>intento de ingreso fallido{r.detail ? <> con <b className="font-medium">{r.detail}</b></> : null}{r.extra ? <span className="text-sb-on-surface-variant"> · IP {r.extra}</span> : null}</>;
  if (r.kind === "event") {
    const step = r.extra && isSite(r.extra) && r.detail ? stageLabel(r.extra, r.detail) : r.detail;
    return <>registró <b className="font-medium">{step}</b> en {Number(r.n).toLocaleString()} {Number(r.n) === 1 ? "unidad" : "unidades"} · {r.extra}</>;
  }
  const what = r.extra === "wipe" ? "vació datos" : r.extra === "stage" ? "subió fechas de etapa" : "subió un Excel de unidades";
  return <>{what} <b className="font-medium">{r.detail ?? ""}</b>{Number(r.n) ? <span className="text-sb-on-surface-variant"> · {Number(r.n).toLocaleString()}</span> : null}</>;
}

/** Lista de interacciones (más reciente arriba) */
export function Feed({ rows, compact = false, fresh }: { rows: FeedRow[]; compact?: boolean; fresh?: Set<string> }) {
  if (!rows.length) return <p className="py-8 text-center text-xs text-sb-on-surface-variant">Todavía no hay actividad registrada.</p>;
  return (
    <ul className="flex flex-col">
      {rows.map((r, i) => {
        const k = KIND[r.kind] ?? KIND.view;
        const Icon = k.icon;
        const key = `${r.kind}|${r.at}|${r.user_id}|${r.detail}`;
        return (
          <li key={`${key}|${i}`} className={cn("flex items-start gap-2.5 border-b border-sb-outline-variant/20 py-2 text-xs transition-colors duration-700 last:border-0", fresh?.has(key) && "bg-sb-primary-soft")}>
            <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", k.tone)} />
            <span className="min-w-0 flex-1">
              {r.user_id ? <Link href={`/dev/activity?user=${r.user_id}`} className="font-semibold hover:underline">{r.name}</Link> : <b className="font-semibold">{r.kind === "fail" ? "Sin cuenta" : "—"}</b>}
              {!compact && r.role && <span className="text-sb-on-surface-variant"> · {roleLabel(r.role)}{r.company ? ` · ${r.company}` : ""}</span>}{" "}
              <span className="text-sb-on-surface/80">{whatOf(r)}</span>
            </span>
            <span className="shrink-0 font-mono text-[10px] text-sb-on-surface-variant">{compact ? r.at.slice(11, 19) : r.at.slice(5, 16)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Marca las filas que no estaban en la consulta anterior (para resaltarlas un momento) */
export function useFresh(rows: FeedRow[] | undefined) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!rows) return;
    const keys = rows.map((r) => `${r.kind}|${r.at}|${r.user_id}|${r.detail}`);
    const before = seen.current;
    seen.current = new Set(keys);
    if (!before) return;
    const news = new Set(keys.filter((k) => !before.has(k)));
    if (!news.size) return;
    const show = setTimeout(() => setFresh(news), 0);
    const hide = setTimeout(() => setFresh(new Set()), 2500);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [rows]);
  return fresh;
}

/**
 * Barras de una sola serie (sin leyenda: el título la nombra). Barra fina con punta redondeada sobre la base,
 * 2 px entre barras, una sola línea guía con el máximo y tooltip al pasar el cursor.
 */
export function Bars({ data, height = 140, unit = "", tick }: { data: { label: string; value: number; title?: string }[]; height?: number; unit?: string; tick?: (label: string, i: number) => string | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 100 / Math.max(1, data.length);
  return (
    <div className="relative">
      <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-sb-outline-variant/60" /><div className="absolute inset-x-0 top-1/2 border-t border-dashed border-sb-outline-variant/40" />
        <span className="absolute right-0 top-0 -translate-y-full pb-0.5 text-[10px] text-sb-on-surface-variant">{max.toLocaleString()}{unit}</span>
        <div className="absolute inset-0 flex items-end">
          {data.map((d, i) => (
            <div key={d.label} className="relative flex h-full items-end justify-center" style={{ width: `${W}%`, paddingInline: 1 }} onMouseEnter={() => setHover(i)}>
              <div
                className={cn("w-full max-w-[22px] rounded-t-[6px] rounded-b-[2px] transition-[height,background-color] duration-500 ease-out", hover === i || d.value === max ? "bg-sb-primary" : "bg-sb-primary/35")}
                style={{ height: d.value ? `${Math.max(2, (d.value / max) * 100)}%` : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 border-t border-sb-outline-variant" />
        {hover !== null && data[hover] && (
          <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-sb-outline-variant bg-sb-surface px-2 py-1 text-[11px] shadow-lg"
            style={{ left: `${(hover + 0.5) * W}%`, top: `${100 - (data[hover].value / max) * 100}%` }}>
            <b>{data[hover].value.toLocaleString()}{unit}</b> <span className="text-sb-on-surface-variant">· {data[hover].title ?? data[hover].label}</span>
          </div>
        )}
      </div>
      <div className="relative mt-1 h-3.5">
        {data.map((d, i) => {
          const t = tick ? tick(d.label, i) : null;
          return t ? <span key={d.label} className="absolute -translate-x-1/2 text-[10px] text-sb-on-surface-variant" style={{ left: `${(i + 0.5) * W}%` }}>{t}</span> : null;
        })}
      </div>
    </div>
  );
}

/** Botones de una sola elección (filtros en una fila) */
export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.key} type="button" onClick={() => onChange(o.key)}
          className={cn("sb-pill rounded-full border px-3 py-1 text-[11px] font-medium transition-colors", value === o.key ? "border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant text-sb-on-surface-variant hover:text-sb-on-surface")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Indicador "en vivo" con la hora de la última actualización */
export function LiveDot({ at }: { at: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-sb-outline-variant px-2.5 py-1 text-[11px] text-sb-on-surface-variant">
      <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sb-primary opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-sb-primary" /></span>
      En vivo{at ? ` · ${at}` : ""}
    </span>
  );
}
