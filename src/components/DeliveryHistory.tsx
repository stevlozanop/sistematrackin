"use client";
import { useEffect, useState } from "react";
import { Check, CheckCheck, History, MessageSquareWarning, Search, X } from "lucide-react";
import { Card } from "@/components/ui";
import { Kind } from "@/components/Kinds";
import { DATA_EVENT } from "@/components/UploadCenter";
import { fmtDate } from "@/lib/hsp";
import { cn } from "@/lib/cn";

/** Guía entregada: ✓ el transportista registró la entrega · ✓✓ el cliente confirmó lo recibido */
export type Delivery = {
  guia: string; site: string; dealer: string | null; district: string | null; driver: string | null; delivered_on: string | null; total: number; w2: number; w3: number;
  kind: string | null; note: string | null; received_on: string | null; received_by: string | null; delivered_by: string | null; carrier_check: boolean;
};

const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");

/** Los dos checks, como en un chat: gris = falta · color = hecho */
export function Checks({ first, second, obs }: { first: boolean; second: boolean; obs?: boolean }) {
  const both = first && second;
  return (
    <span className={cn("inline-flex h-7 w-9 shrink-0 items-center justify-center rounded-full",
      both ? (obs ? "bg-sb-late-soft text-sb-late" : "bg-sb-primary-soft text-sb-primary")
        : first ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-sb-surface-container text-sb-on-surface-variant")}
      title={`${first ? "✓ Entrega registrada por el transportista" : "Sin registro del transportista"} · ${second ? "✓ Recibido por el cliente" : "El cliente aún no confirma"}`}>
      {both || second ? <CheckCheck className={cn("h-4 w-4", !first && "opacity-70")} strokeWidth={2.6} /> : <Check className={cn("h-4 w-4", !first && "opacity-30")} strokeWidth={2.8} />}
    </span>
  );
}

/**
 * Historial de entregas con doble check. Lo ven el cliente (sus guías), el transportista (lo que entregó) y la empresa.
 * Una guía con un solo check = el transportista entregó pero el cliente aún no confirma lo recibido.
 */
export function DeliveryHistory({ highlight, title = "Historial de entregas" }: { highlight?: Set<string>; title?: string }) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "one" | "two">("all");
  const [rows, setRows] = useState<Delivery[] | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const again = () => setReload((x) => x + 1);
    window.addEventListener(DATA_EVENT, again);
    return () => window.removeEventListener(DATA_EVENT, again);
  }, []);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      fetch(`/api/entrega?${new URLSearchParams({ received: "1", q: q.trim() })}`).then((r) => r.json()).then((j) => { if (alive) setRows(j.rows ?? []); }).catch(() => {});
    }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, reload, highlight]);

  const two = (r: Delivery) => !!r.kind;
  const oneCount = (rows ?? []).filter((r) => !two(r)).length;
  const shown = (rows ?? []).filter((r) => only === "all" || (only === "two") === two(r));

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-sb-outline-variant/40 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sb-surface-container text-sb-on-surface-variant"><History className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="flex flex-wrap items-center gap-x-3 text-[11px] text-sb-on-surface-variant">
            <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-sb-primary" strokeWidth={3} /> el transportista entregó</span>
            <span className="inline-flex items-center gap-1"><CheckCheck className="h-3 w-3 text-sb-primary" strokeWidth={3} /> el cliente confirmó que recibió</span>
          </p>
        </div>
        <label className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sb-on-surface-variant" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar guía, dealer, distrito o chofer"
            className="h-10 w-full rounded-full border border-sb-outline-variant bg-sb-surface pl-9 pr-8 text-sm outline-none transition-colors focus:border-sb-on-surface" />
          {q && <button type="button" aria-label="Limpiar" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-sb-on-surface-variant hover:bg-sb-surface-container"><X className="h-3.5 w-3.5" /></button>}
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <div className="flex rounded-full bg-sb-surface-container p-0.5">
          {([["all", "Todas", rows?.length ?? 0], ["one", "Un check", oneCount], ["two", "Doble check", (rows?.length ?? 0) - oneCount]] as const).map(([k, l, c]) => (
            <button key={k} type="button" onClick={() => setOnly(k)} aria-pressed={only === k}
              className={cn("sb-pill flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold",
                only === k ? "bg-sb-surface text-sb-on-surface shadow-sm" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
              {k === "one" && <Check className="h-3 w-3" strokeWidth={3} />}{k === "two" && <CheckCheck className="h-3 w-3" strokeWidth={3} />}
              {l}<span className="tabular-nums opacity-60">{n(c)}</span>
            </button>
          ))}
        </div>
        {oneCount > 0 && <span className="text-[11px] text-amber-600 dark:text-amber-400">{n(oneCount)} {oneCount === 1 ? "guía espera" : "guías esperan"} que el cliente confirme lo recibido</span>}
      </div>
      <div className="flex flex-col p-1.5">
        {!rows && <div className="m-2 h-16 animate-pulse rounded-xl bg-sb-surface-container-low" />}
        {rows && !shown.length && <p className="px-4 py-6 text-center text-xs text-sb-on-surface-variant">{q ? `Nada coincide con «${q}».` : only === "one" ? "Todas las entregas tienen doble check." : "Todavía no hay entregas registradas."}</p>}
        {shown.map((h) => {
          const obs = h.kind === "observacion";
          return (
            <div key={h.guia} className={cn("flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors duration-700", highlight?.has(h.guia) && "bg-sb-primary-soft")}>
              <Checks first={h.carrier_check} second={two(h)} obs={obs} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-sm font-semibold">{h.guia}</span>
                  {two(h)
                    ? <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", obs ? "bg-sb-late-soft text-sb-late" : "bg-sb-primary-soft text-sb-primary")}>{obs ? "Recibido con observación" : "Recibido completo"}</span>
                    : <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Falta que el cliente confirme</span>}
                  {(h.w2 > 0 || !h.w3) && <Kind v={h.w2} k="w2" />}{h.w3 > 0 && <Kind v={h.w3} k="w3" short />}
                </p>
                <p className="truncate text-[11px] text-sb-on-surface-variant">{h.dealer ?? "—"}{h.district ? ` · ${h.district}` : ""}</p>
                <div className="mt-1.5 grid gap-1 text-[11px] sm:grid-cols-2">
                  <span className={cn("flex items-start gap-1.5", !h.carrier_check && "text-sb-on-surface-variant")}>
                    <Check className={cn("mt-px h-3.5 w-3.5 shrink-0", h.carrier_check ? "text-sb-primary" : "opacity-30")} strokeWidth={3} />
                    <span className="min-w-0">{h.carrier_check ? <>Entregó el transportista · <b>{fmtDate(h.delivered_on)}</b>{h.driver ? ` · ${h.driver}` : ""}</> : "El transportista no registró la entrega"}</span>
                  </span>
                  <span className={cn("flex items-start gap-1.5", !two(h) && "text-sb-on-surface-variant")}>
                    <CheckCheck className={cn("mt-px h-3.5 w-3.5 shrink-0", two(h) ? (obs ? "text-sb-late" : "text-sb-primary") : "opacity-30")} strokeWidth={3} />
                    <span className="min-w-0">{two(h) ? <>Recibió el cliente · <b>{fmtDate(h.received_on)}</b>{h.received_by ? ` · ${h.received_by}` : ""}</> : "El cliente aún no confirma lo recibido"}</span>
                  </span>
                </div>
                {h.note && <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-sb-surface-container-low px-2 py-1 text-xs"><MessageSquareWarning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sb-late" />{h.note}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{n(h.total)}</p>
                <p className="text-[10px] text-sb-on-surface-variant">unid.</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
