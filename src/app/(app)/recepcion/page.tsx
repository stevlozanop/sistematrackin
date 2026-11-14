"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Check, CheckCircle2, History, Inbox, MessageSquareWarning, PackageCheck, Search, X } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { ChoiceCards } from "@/components/modal/ChoiceCards";
import { DatePicker, pastQuick } from "@/components/modal/DatePicker";
import { DATA_EVENT } from "@/components/UploadCenter";
import { fmtDate } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { cn } from "@/lib/cn";
import { Kind } from "@/components/Kinds";

/**
 * 6. Entrega · Dealer: busca su guía de remisión y confirma que la recibió,
 * completa o con observación. Las observaciones las revisa la empresa (Leyva) aquí mismo.
 */

/** Guía despachada que aún no se confirma */
type Pend = { guia: string; site: string; dealer: string | null; district: string | null; driver: string | null; dispatched: string; w2: number; w3: number; total: number };
/** Recepción ya registrada (historial) */
type Rec = { id: number; guia: string; site: string; kind: string; note: string | null; received_on: string; created_at: string; units: number; usuario: string | null; dealer: string | null; district: string | null };
/** Fila de guía: marca · guía/distrito · despachada · motos y motokares · total (celular: marca · guía · total) */
const GCOLS = "grid-cols-[1.25rem_minmax(0,1fr)_3rem] gap-x-3 sm:grid-cols-[1.25rem_minmax(0,1fr)_6rem_10rem_3rem]";
const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-sb-outline-variant/60 px-4 py-10 text-center text-xs text-sb-on-surface-variant">
    <Inbox className="h-5 w-5 opacity-50" />{children}
  </div>
);
const Kinds = ({ w2, w3, short }: { w2: number; w3: number; short?: boolean }) => (
  <>{(w2 > 0 || !w3) && <Kind v={w2} k="w2" />}{w3 > 0 && <Kind v={w3} k="w3" short={short} />}</>
);
type Obs = { id: number; site: string; guia: string; note: string; received_on: string; units: number; usuario: string | null; dealer: string | null };

const field = "h-10 w-full rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-on-surface";
const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");

/** La empresa ve las recepciones con observación y las marca como revisadas */
function Observations() {
  const [rows, setRows] = useState<Obs[] | null>(null);
  const load = useCallback(() => { fetch("/api/entrega?observations=1").then((r) => r.json()).then((j) => setRows(j.rows ?? [])); }, []);
  useEffect(() => {
    load();
    window.addEventListener(DATA_EVENT, load);
    return () => window.removeEventListener(DATA_EVENT, load);
  }, [load]);
  async function review(id: number) {
    const r = await fetch("/api/entrega", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review", id }) });
    if (!r.ok) return toast.danger("No se pudo marcar");
    setRows((x) => x?.filter((o) => o.id !== id) ?? null);
  }
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-sb-outline-variant/40 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><MessageSquareWarning className="h-4 w-4 text-sb-late" /> Observaciones de los dealers por revisar</h3>
        <span className="text-[11px] text-sb-on-surface-variant">{rows?.length ?? 0}</span>
      </div>
      <div className="flex flex-col">
        {rows?.map((o) => (
          <div key={o.id} className="flex flex-wrap items-start gap-3 border-b border-sb-outline-variant/20 px-4 py-3 text-xs last:border-0">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{o.dealer ?? "—"} <span className="font-mono font-normal text-sb-on-surface-variant">· {o.guia} · {o.site}</span></p>
              <p className="mt-1 rounded-lg bg-sb-late-soft/60 px-2 py-1.5 text-sb-on-surface">{o.note}</p>
              <p className="mt-1 text-[11px] text-sb-on-surface-variant">Recibido {fmtDate(o.received_on)} · {n(o.units)} unidades{o.usuario ? ` · registró ${o.usuario}` : ""}</p>
            </div>
            <Button size="sm" variant="secondary" className="rounded-full" onPress={() => review(o.id)}><CheckCircle2 className="h-3.5 w-3.5" /> Revisado</Button>
          </div>
        ))}
        {rows && !rows.length && <p className="px-4 py-6 text-center text-xs text-sb-on-surface-variant">No hay observaciones pendientes.</p>}
      </div>
    </Card>
  );
}

export default function RecepcionPage() {
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Pend[] | null>(null);
  const [history, setHistory] = useState<Rec[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<"completo" | "observacion">("completo");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [justDone, setJustDone] = useState<Set<string>>(new Set()); // recién recibidas: se resaltan en el historial
  const load = useCallback(() => {
    fetch("/api/entrega?pending=1").then((r) => r.json()).then((j) => setRows(j.rows ?? []));
    fetch("/api/entrega?received=1").then((r) => r.json()).then((j) => setHistory(j.rows ?? []));
  }, []);
  useEffect(() => { fetch("/api/me").then((r) => r.json()).then(setMe); load(); }, [load]);
  useEffect(() => {
    window.addEventListener(DATA_EVENT, load);
    return () => window.removeEventListener(DATA_EVENT, load);
  }, [load]);

  // Búsqueda: guía (basta con los últimos dígitos), dealer, distrito o chofer; varias separadas por coma o espacio
  const terms = q.trim().toLowerCase().split(/[\s,;]+/).filter(Boolean);
  const shown = (rows ?? []).filter((r) => !terms.length || terms.some((t) => [r.guia, r.dealer, r.district, r.driver].some((x) => (x ?? "").toLowerCase().includes(t))));
  // Por dealer: así se ven juntas las guías que llegan juntas (ej. SERMAX …125 y …126)
  const groups = [...shown.reduce((m, r) => { const d = r.dealer ?? "—"; m.set(d, [...(m.get(d) ?? []), r]); return m; }, new Map<string, Pend[]>())];
  const chosen = (rows ?? []).filter((r) => sel.has(r.guia));
  const units = chosen.reduce((t, r) => t + r.total, 0);
  const min = chosen.reduce((m, r) => (r.dispatched > m ? r.dispatched : m), "");
  const flip = (g: string) => setSel((s) => { const y = new Set(s); if (y.has(g)) y.delete(g); else y.add(g); return y; });
  const flipMany = (list: Pend[]) => setSel((s) => { const y = new Set(s); const all = list.every((r) => y.has(r.guia)); for (const r of list) { if (all) y.delete(r.guia); else y.add(r.guia); } return y; });

  async function save() {
    if (!chosen.length) return toast.danger("Marca las guías que recibiste");
    if (kind === "observacion" && !note.trim()) return toast.danger("Escribe la observación");
    if (min && date < min) return toast.danger(`La recepción no puede ser antes del despacho (${fmtDate(min)})`);
    setSaving(true);
    const r = await fetch("/api/entrega", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "receive", guias: chosen.map((x) => x.guia), kind, note, date }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setSaving(false);
    if (!r.ok) return toast.danger(j.error);
    toast.success(`${chosen.length === 1 ? "Guía recibida" : `${chosen.length} guías recibidas`}${kind === "completo" ? ": llegó completo" : " con observación"}`,
      { description: kind === "observacion" ? "La empresa revisará tu observación" : `${n(j.units)} unidades → Entregado. Quedan en el historial.`, timeout: 7000 });
    setJustDone(new Set(chosen.map((x) => x.guia)));
    setSel(new Set()); setNote(""); setKind("completo"); setQ("");
    load();
  }

  if (!me) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  const ready = chosen.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Entrega · Dealer" sub="6. Marca las guías que recibiste (si llegaron juntas, márcalas todas) y confirma: completas o con observación." />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-sb-outline-variant/40 px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sb-primary-soft text-sb-primary"><PackageCheck className="h-[18px] w-[18px]" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">Guías por recibir</h3>
            <p className="text-[11px] text-sb-on-surface-variant">{rows ? `${n(rows.length)} guía${rows.length === 1 ? "" : "s"} despachada${rows.length === 1 ? "" : "s"} sin confirmar` : "Cargando…"}</p>
          </div>
          <label className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sb-on-surface-variant" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Guía (o sus últimos dígitos), dealer o distrito"
              onKeyDown={(e) => { if (e.key === "Enter" && shown.length === 1) { e.preventDefault(); flip(shown[0].guia); } }}
              className="h-10 w-full rounded-full border border-sb-outline-variant bg-sb-surface pl-9 pr-8 text-sm outline-none transition-colors focus:border-sb-on-surface" />
            {q && <button type="button" aria-label="Limpiar" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-sb-on-surface-variant hover:bg-sb-surface-container"><X className="h-3.5 w-3.5" /></button>}
          </label>
        </div>
        <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[1fr_19rem]">
          <div className="flex min-w-0 flex-col gap-2.5">
            {!rows && [0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-sb-surface-container-low" />)}
            {rows && !rows.length && <Empty>No tienes guías por recibir. Las que confirmes quedan en el historial de abajo.</Empty>}
            {rows && !!rows.length && !shown.length && <Empty>Ninguna guía por recibir coincide con «{q}». Si ya la recibiste, está en el historial.</Empty>}
            {groups.map(([dealer, list]) => {
              const marked = list.filter((r) => sel.has(r.guia)).length, all = marked === list.length;
              const t = list.reduce((a, r) => ({ w2: a.w2 + r.w2, w3: a.w3 + r.w3 }), { w2: 0, w3: 0 });
              return (
                <div key={dealer} className="overflow-hidden rounded-2xl border border-sb-outline-variant/50">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-sb-surface-container-low/70 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] uppercase tracking-wider text-sb-on-surface-variant">{[...new Set(list.map((r) => r.district).filter(Boolean))].join(" · ") || "—"}</p>
                      <p className="truncate text-sm font-semibold" title={dealer}>{dealer}</p>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
                      <Kinds w2={t.w2} w3={t.w3} />
                      {list.length > 1 && (
                        <button type="button" onClick={() => flipMany(list)}
                          className={cn("sb-pill-sm ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors",
                            all ? "border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant bg-sb-surface hover:border-sb-primary")}>
                          <Check className="h-3 w-3" strokeWidth={3} />{all ? "Marcadas" : `Llegaron juntas · marcar las ${list.length}`}
                          <span className="tabular-nums opacity-70">{marked}/{list.length}</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className={cn(GCOLS, "hidden border-b border-sb-outline-variant/30 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant sm:grid")}>
                    <span /><span>Guía</span><span>Despachada</span><span>Motos y motokares</span><span className="text-right">Total</span>
                  </div>
                  <div className="flex flex-col p-1">
                    {list.map((r) => {
                      const on = sel.has(r.guia);
                      return (
                        <button key={r.guia} type="button" role="checkbox" aria-checked={on} aria-label={`Recibí ${r.guia}`} onClick={() => flip(r.guia)}
                          className={cn(GCOLS, "grid items-center gap-y-1 rounded-xl px-2 py-2.5 text-left transition-colors duration-200", on ? "bg-sb-primary-soft" : "hover:bg-sb-surface-container-low")}>
                          <span className={cn("grid h-5 w-5 place-items-center rounded-full border transition-all duration-200", on ? "scale-105 border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant bg-sb-surface")}>
                            <Check className={cn("h-3 w-3 transition-opacity", on ? "opacity-100" : "opacity-0")} strokeWidth={3} />
                          </span>
                          <span className="min-w-0">
                            <span className="block font-mono text-sm font-semibold tracking-tight">{r.guia}</span>
                            <span className="block truncate text-[11px] text-sb-on-surface-variant">{r.district ?? "—"}{r.driver ? ` · chofer ${r.driver}` : ""}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-1 sm:hidden"><Kinds w2={r.w2} w3={r.w3} short /><span className="text-[10px] text-sb-on-surface-variant">· despacho {fmtDate(r.dispatched)}</span></span>
                          </span>
                          <span className="hidden text-xs sm:block">{fmtDate(r.dispatched)}</span>
                          <span className="hidden flex-wrap gap-1 sm:flex"><Kinds w2={r.w2} w3={r.w3} short /></span>
                          <span className="text-right"><span className="block text-sm font-semibold tabular-nums">{n(r.total)}</span><span className="block text-[10px] text-sb-on-surface-variant">unid.</span></span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div id="confirmar-recepcion" className="flex scroll-mt-4 flex-col gap-3 border-t border-sb-outline-variant/40 pt-3 lg:sticky lg:top-4 lg:self-start lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <div className={cn("rounded-xl px-3 py-2.5 text-xs", ready ? "bg-sb-primary-soft" : "bg-sb-surface-container-low text-sb-on-surface-variant")}>
              {ready ? <><b className="text-base tabular-nums">{chosen.length}</b> guía{chosen.length === 1 ? "" : "s"} marcada{chosen.length === 1 ? "" : "s"} · <b className="tabular-nums">{n(units)}</b> unidades
                <span className="mt-0.5 block truncate font-mono text-[10px] text-sb-on-surface-variant">{chosen.map((r) => r.guia).join(", ")}</span></>
                : "Marca a la izquierda las guías que recibiste."}
            </div>
            <ChoiceCards label="Cómo llegó" columns={1} value={kind} onChange={setKind} options={[
              { key: "completo", label: "Entregado completo", desc: "Llegó todo bien", icon: CheckCircle2, disabled: !ready },
              { key: "observacion", label: "Entregado con observación", desc: "Falta algo o llegó dañado", icon: MessageSquareWarning, disabled: !ready },
            ]} />
            <div className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Fecha de recepción
              <DatePicker label="Fecha de recepción" value={date} min={min || null} onChange={setDate} disabled={!ready} quick={pastQuick(min || null, today())} />
            </div>
            <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Observación{kind === "observacion" ? " (obligatoria)" : " (opcional)"}
              <textarea className={cn(field, "h-24 resize-none py-2")} value={note} onChange={(e) => setNote(e.target.value)} disabled={!ready} placeholder="Ej. llegó con el espejo roto" />
            </label>
            <Button variant="primary" className="rounded-full" onPress={save} isDisabled={saving || !ready}>
              {saving ? "Registrando…" : ready ? `Registrar recepción (${chosen.length})` : "Registrar recepción"}
            </Button>
            {kind === "observacion" && ready && <p className="text-[11px] text-sb-on-surface-variant">La empresa verá tu observación y la revisará.</p>}
          </div>
        </div>
      </Card>

      {/* Celular: con guías marcadas, una barra lleva a confirmar (el formulario queda debajo de la lista) */}
      {ready && (
        <div className="sticky bottom-24 z-40 flex items-center gap-3 rounded-2xl border border-sb-outline-variant/60 bg-sb-surface/90 p-3 pl-4 shadow-2xl backdrop-blur-xl lg:hidden">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold"><span className="text-lg tabular-nums">{chosen.length}</span> guía{chosen.length === 1 ? "" : "s"} <span className="font-normal text-sb-on-surface-variant">· {n(units)} unid.</span></p>
          <Button variant="primary" className="shrink-0 rounded-full" onPress={() => document.getElementById("confirmar-recepcion")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            <PackageCheck className="h-4 w-4" /> Confirmar
          </Button>
        </div>
      )}

      {/* Historial: lo ya recibido (no vuelve a aparecer en «Guías por recibir») */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-sb-outline-variant/40 px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sb-surface-container text-sb-on-surface-variant"><History className="h-[18px] w-[18px]" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">Historial de recepciones</h3>
            <p className="text-[11px] text-sb-on-surface-variant">Lo que ya se recibió: cuándo, cómo llegó y quién lo registró</p>
          </div>
        </div>
        <div className="flex flex-col p-1.5">
          {!history && <div className="m-2 h-16 animate-pulse rounded-xl bg-sb-surface-container-low" />}
          {history && !history.length && <p className="px-4 py-6 text-center text-xs text-sb-on-surface-variant">Todavía no hay recepciones registradas.</p>}
          {history?.map((h) => {
            const ok = h.kind === "completo";
            return (
              <div key={h.id} className={cn("flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors duration-700", justDone.has(h.guia) && "bg-sb-primary-soft")}>
                <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full", ok ? "bg-sb-primary text-sb-on-primary" : "bg-sb-late-soft text-sb-late")}>
                  {ok ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <MessageSquareWarning className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-mono text-sm font-semibold">{h.guia}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", ok ? "bg-sb-primary-soft text-sb-primary" : "bg-sb-late-soft text-sb-late")}>{ok ? "Entregado completo" : "Con observación"}</span>
                  </p>
                  <p className="truncate text-[11px] text-sb-on-surface-variant">{h.dealer ?? "—"}{h.district ? ` · ${h.district}` : ""}</p>
                  {h.note && <p className="mt-1 rounded-lg bg-sb-surface-container-low px-2 py-1 text-xs">{h.note}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-semibold">{fmtDate(h.received_on)}</p>
                  <p className="text-[10px] text-sb-on-surface-variant">{n(h.units)} unid.{h.usuario ? ` · ${h.usuario}` : ""}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      {me.role === "admin" && <Observations />}
    </div>
  );
}
