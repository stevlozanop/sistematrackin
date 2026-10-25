"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, toast } from "@heroui/react";
import { CheckCircle2, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { ProcessRoute } from "@/components/ProcessRoute";
import { cn } from "@/lib/cn";
import { SITE_INFO, STATUS_LABEL, fmtDate, type DateField, type Site, type Status } from "@/lib/hsp";
import { areaOf, previousDate, stageLabel, today, type Stage } from "@/lib/workflow";

type Me = {
  name: string; area: string | null; carrier: string | null;
  pending: (Stage & { pending: number })[];
  today: { id: number; at: string; field: string; new_value: string | null; site: Site; chassis: string }[];
  carriers: string[];
};
type Unit = {
  id: number; site: Site; chassis: string; motor: string | null; material: string | null; category: string | null;
  dealer: string | null; zone: string | null; district: string | null; billing_date: string | null; status: Status; carrier: string | null;
} & Partial<Record<DateField, string | null>>;

const PAGE = 50;
const input = "h-10 rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-on-surface";

/** Pantalla simple del encargado: solo lo que le toca registrar. */
export default function MyWorkPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [rows, setRows] = useState<Unit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [date, setDate] = useState(today());
  const [carrier, setCarrier] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  const loadMe = useCallback(() => fetch("/api/me").then((r) => r.json()).then((m: Me) => {
    setMe(m);
    setStage((cur) => cur ?? m.pending[0] ?? null);
  }), []);
  useEffect(() => { loadMe(); }, [loadMe]);

  useEffect(() => { const t = setTimeout(() => { setQDebounced(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  useEffect(() => {
    if (!stage) return;
    let alive = true;
    const p = new URLSearchParams({ site: stage.site, pending: stage.field, page: String(page), size: String(PAGE), sort: "billing_date", dir: "asc" });
    if (qDebounced) p.set("q", qDebounced);
    fetch(`/api/units?${p}`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      setRows(j.rows ?? []); setTotal(j.total ?? 0); setLoading(false);
    });
    return () => { alive = false; };
  }, [stage, page, qDebounced, reload]);

  // Se mantiene al día solo (cada 15 s), salvo mientras eliges unidades
  useEffect(() => {
    const t = setInterval(() => { if (!sel.size) { setReload((n) => n + 1); loadMe(); } }, 15_000);
    return () => clearInterval(t);
  }, [sel.size, loadMe]);

  const selected = rows.filter((u) => sel.has(u.id));
  const minDate = useMemo(
    () => (stage ? selected.map((u) => previousDate(stage.site, u, stage.field)).filter((d): d is string => !!d).sort().at(-1) ?? undefined : undefined),
    [selected, stage],
  );
  const needsCarrier = stage?.site === "PCL" && stage.field === "d_despacho";

  async function register() {
    if (!stage || !selected.length) return;
    if (minDate && date < minDate) return toast.danger(`La fecha no puede ser anterior al ${fmtDate(minDate)} (etapa anterior)`);
    if (needsCarrier && !carrier.trim()) return toast.danger("Indica la empresa de transporte que lleva las unidades");
    setSaving(true);
    const changes: Record<string, string> = { [stage.field]: date };
    if (needsCarrier) changes.carrier = carrier.trim();
    const r = await fetch("/api/units", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...sel], changes }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setSaving(false);
    if (!r.ok) return toast.danger(j.error);
    toast.success(`${j.count} ${j.count === 1 ? "unidad registrada" : "unidades registradas"}`, {
      description: j.skipped ? `${j.skipped} no se registraron: ${j.skipReason}` : "Pasan a la siguiente etapa.",
    });
    setSel(new Set());
    setReload((n) => n + 1);
    loadMe();
  }

  if (!me) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  const area = areaOf(me.area);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const allOnPage = rows.length > 0 && rows.every((u) => sel.has(u.id));

  return (
    <div className="flex flex-col gap-4 pb-28">
      <PageTitle title={`Hola, ${me.name.split(" ")[0]}`} sub={`${area && area.id !== "CUSTOM" ? area.label : "Encargado"}${me.carrier ? ` · ${me.carrier}` : ""}`} />

      {!me.pending.length ? (
        <Card className="p-6 text-sm text-sb-on-surface-variant">Todavía no tienes etapas asignadas. Pide a tu supervisor que te asigne tu área.</Card>
      ) : (
        <>
          {/* Etapas a cargo */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {me.pending.map((st) => {
              const on = stage?.site === st.site && stage.field === st.field;
              return (
                <button
                  key={`${st.site}${st.field}`}
                  onClick={() => { setStage(st); setSel(new Set()); setPage(1); setQ(""); setLoading(true); }}
                  className={cn("rounded-2xl border p-4 text-left transition-colors", on ? "border-sb-on-surface bg-sb-on-surface text-sb-surface" : "border-sb-outline-variant/40 bg-sb-surface hover:bg-sb-surface-container-low")}
                >
                  <div className="text-[11px] uppercase tracking-wider opacity-60">{SITE_INFO[st.site].title}</div>
                  <div className="mt-0.5 text-sm font-semibold">{stageLabel(st.site, st.field)}</div>
                  <div className="mt-2 text-2xl font-bold">{st.pending.toLocaleString()}</div>
                  <div className="text-[11px] opacity-70">{st.pending === 1 ? "unidad por registrar" : "unidades por registrar"}</div>
                </button>
              );
            })}
          </div>

          {[...new Set(me.pending.map((p) => p.site))].map((site) => (
            <Card key={site} className="p-4">
              <p className="mb-2 text-xs font-semibold">Dónde está tu trabajo en el recorrido ({SITE_INFO[site].title}):</p>
              <ProcessRoute site={site} mine={me.pending.filter((p) => p.site === site).map((p) => p.field)} />
            </Card>
          ))}

          <Card className="flex flex-col gap-2 p-4 text-xs text-sb-on-surface-variant sm:flex-row sm:items-center sm:gap-6">
            <b className="text-sb-on-surface">Cómo registrar:</b>
            <span>1. Marca las unidades que ya pasaron por esta etapa.</span>
            <span>2. Elige la fecha{needsCarrier ? " y la empresa de transporte" : ""}.</span>
            <span>3. Presiona <b>Registrar</b>. La fecha queda guardada y no se puede cambiar; si te equivocas, avisa a tu supervisor.</span>
          </Card>

          {stage && (
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sb-outline-variant/40 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold">Por registrar: {stageLabel(stage.site, stage.field)}</h3>
                  <p className="text-[11px] text-sb-on-surface-variant/70">{total.toLocaleString()} unidades · primero las más antiguas</p>
                </div>
                <label className="sbf-search sm:w-80">
                  <Search className="h-4 w-4 opacity-40" />
                  <input placeholder="Buscar chasis, motor, guía o factura…" value={q} onChange={(e) => setQ(e.target.value)} />
                  {q && <button onClick={() => setQ("")} className="opacity-40 hover:opacity-100"><X className="h-4 w-4" /></button>}
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant/60">
                      <th className="w-10 px-4 py-2.5">
                        <input type="checkbox" aria-label="Marcar todas las de esta página" checked={allOnPage}
                          onChange={() => setSel(allOnPage ? new Set() : new Set(rows.map((u) => u.id)))} className="h-4 w-4 accent-[var(--sb-primary)]" />
                      </th>
                      <th className="px-2 py-2.5 font-semibold">Unidad</th>
                      <th className="px-2 py-2.5 font-semibold">Destino</th>
                      <th className="px-2 py-2.5 font-semibold">Etapa anterior</th>
                      <th className="px-2 py-2.5 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!rows.length && (
                      <tr><td colSpan={5} className="px-4 py-12 text-center text-sb-on-surface-variant/60">
                        {loading ? "Cargando…" : q ? "Ninguna unidad coincide con la búsqueda." : <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> No tienes unidades pendientes en esta etapa.</span>}
                      </td></tr>
                    )}
                    {rows.map((u) => {
                      const prev = previousDate(u.site, u, stage.field);
                      const prevKey = SITE_INFO[u.site].dates.find((d) => u[d.key] === prev)?.key;
                      const on = sel.has(u.id);
                      return (
                        <tr key={u.id} onClick={() => setSel((s) => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })}
                          className={cn("cursor-pointer border-b border-sb-outline-variant/25 last:border-0", on ? "bg-sb-surface-container" : "hover:bg-sb-surface-container-low")}>
                          <td className="px-4 py-2.5"><input type="checkbox" aria-label={`Marcar ${u.chassis}`} checked={on} readOnly className="pointer-events-none h-4 w-4 accent-[var(--sb-primary)]" /></td>
                          <td className="px-2 py-2.5">
                            <div className="font-mono text-xs font-semibold">{u.chassis}</div>
                            <div className="text-[11px] text-muted">{u.material} · {u.category} · motor {u.motor}</div>
                          </td>
                          <td className="px-2 py-2.5">
                            <div className="max-w-[16rem] truncate text-xs">{u.dealer}</div>
                            <div className="text-[11px] text-muted">{u.district ?? u.zone}{u.carrier ? ` · ${u.carrier}` : ""}</div>
                          </td>
                          <td className="px-2 py-2.5 text-xs">{prevKey ? <>{stageLabel(u.site, prevKey)}: <b>{fmtDate(prev)}</b></> : <>Facturada {fmtDate(u.billing_date)}</>}</td>
                          <td className="px-2 py-2.5 text-xs">{STATUS_LABEL[u.status]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-end gap-1 border-t border-sb-outline-variant/40 px-4 py-2 text-[11px]">
                  <button className="rounded-full p-1.5 hover:bg-sb-surface-container disabled:opacity-30" aria-label="Página anterior" disabled={page <= 1} onClick={() => { setPage(page - 1); setSel(new Set()); }}><ChevronLeft className="h-4 w-4" /></button>
                  <span className="min-w-16 text-center">{page} / {pages}</span>
                  <button className="rounded-full p-1.5 hover:bg-sb-surface-container disabled:opacity-30" aria-label="Página siguiente" disabled={page >= pages} onClick={() => { setPage(page + 1); setSel(new Set()); }}><ChevronRight className="h-4 w-4" /></button>
                </div>
              )}
            </Card>
          )}

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Registrado hoy por ti ({me.today.length})</h3>
            {!me.today.length && <p className="text-xs text-sb-on-surface-variant/60">Aún nada hoy.</p>}
            <ul className="flex flex-col gap-1 text-xs">
              {me.today.map((e) => (
                <li key={e.id} className="flex gap-3"><span className="w-10 font-mono text-muted">{e.at}</span><span className="font-mono">{e.chassis}</span><span>{stageLabel(e.site, e.field)}: {e.field.startsWith("d_") ? fmtDate(e.new_value) : e.new_value}</span></li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {/* Barra para registrar las unidades marcadas */}
      {sel.size > 0 && stage && (
        <div className="fixed inset-x-0 bottom-20 z-20 flex justify-center px-4 md:bottom-6 md:left-[240px]">
          <div className="flex w-full max-w-3xl flex-wrap items-end gap-3 rounded-2xl border border-sb-outline-variant/60 bg-sb-surface p-3 shadow-xl">
            <div className="min-w-32 flex-1 text-sm"><b>{sel.size}</b> {sel.size === 1 ? "unidad marcada" : "unidades marcadas"}<div className="text-[11px] text-muted">{stageLabel(stage.site, stage.field)}</div></div>
            <label className="flex flex-col gap-1 text-[11px]">Fecha
              <input type="date" value={date} min={minDate} max={today()} onChange={(e) => setDate(e.target.value)} className={input} />
            </label>
            {needsCarrier && (
              <label className="flex flex-col gap-1 text-[11px]">Empresa de transporte
                <input list="carriers" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Ej. JOSEPH S.A.C." className={`w-60 ${input}`} />
                <datalist id="carriers">{me.carriers.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
            )}
            <Button variant="secondary" className="rounded-full" onPress={() => setSel(new Set())}>Cancelar</Button>
            <Button variant="primary" className="rounded-full" isDisabled={saving || !date} onPress={register}>{saving ? "Registrando…" : "Registrar"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
