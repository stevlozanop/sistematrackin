"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, toast } from "@heroui/react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { AlertTriangle, ChevronRight, FileStack, Search, Ship, X } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { ServiceBadge } from "@/components/Service";
import { cn } from "@/lib/cn";
import { DATA_EVENT } from "@/components/UploadCenter";
import { DELAY_REASONS, SITE_INFO, fmtDate, type DateField, type Site } from "@/lib/hsp";
import { stageLabel, today } from "@/lib/workflow";
import { SoftSelect } from "@/components/SoftSelect";

/**
 * Carga por guía de remisión: el encargado marca las guías (cada una trae varias motos/motokares)
 * y registra la fecha de su etapa de una vez. En el zarpe también indica la nave.
 * Ej.: Iquitos marca las guías que subieron a la «HENRY 1», pone la fecha de zarpe → pasan a Tránsito fluvial.
 */

type Group = {
  guia: string; n: number; w2: number; w3: number; billing: string | null; est: string | null; dealers: string | null;
  invoices: string | null; naves: string | null; need_reason: number; prev: string | null; ids: number[];
};
type Data = { site: Site; stage: DateField; stages: DateField[]; groups: Group[]; naves: string[]; withoutGuia: number; error?: string; key?: string };
type Me = { role: string; stages: { site: Site; field: DateField }[] };
type Unit = { id: number; chassis: string; motor: string | null; material: string | null; category: string | null; dealer: string | null; est_date: string | null; service: "A TIEMPO" | "FUERA DE TIEMPO" | null; delay_reason: string | null };

const EASE = [0.22, 1, 0.36, 1] as const;
const field = "h-10 rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-on-surface";
const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");
/** Estado al que pasa la unidad al registrar cada etapa (lo que verá Honda). */
const NEXT_STATUS: Record<DateField, string> = {
  d_carga: "Embarque", d_zarpe: "Tránsito fluvial", d_arribo: "Arribo puerto", d_almacen: "En almacén",
  d_despacho: "Tránsito dealer", d_alm_lima: "En almacén Lima", d_sal_lima: "Tránsito dealer 2", d_entrega: "Entregado",
};

function GuiaUnits({ site, stage, guia }: { site: Site; stage: DateField; guia: string }) {
  const [units, setUnits] = useState<Unit[] | null>(null);
  useEffect(() => {
    fetch(`/api/guias?${new URLSearchParams({ site, stage, guia })}`).then((r) => r.json()).then((j) => setUnits(j.units ?? []));
  }, [site, stage, guia]);
  if (!units) return <p className="px-4 py-3 text-xs text-sb-on-surface-variant">Cargando unidades…</p>;
  return (
    <div className="grid gap-x-6 gap-y-1 px-4 py-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
      {units.map((u) => (
        <div key={u.id} className="flex items-center justify-between gap-2 border-b border-sb-outline-variant/20 py-1">
          <span className="min-w-0">
            <b className="font-mono font-medium">{u.chassis}</b>
            <span className="ml-1.5 text-sb-on-surface-variant">{u.material} · {u.category}</span>
          </span>
          {u.service === "FUERA DE TIEMPO" && !u.delay_reason ? <ServiceBadge s="FUERA DE TIEMPO" size="xs" /> : null}
        </div>
      ))}
    </div>
  );
}

export default function GuiasPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [stage, setStage] = useState<DateField | null>(null);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  // Fecha de facturación (ej. «todo lo facturado del 21 al 24»)
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [nave, setNave] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  // Se guardó un Excel con «Subir Excel» del menú: recargar
  useEffect(() => {
    const again = () => setReload((n) => n + 1);
    window.addEventListener(DATA_EVENT, again);
    return () => window.removeEventListener(DATA_EVENT, again);
  }, []);

  useEffect(() => { fetch("/api/me").then((r) => r.json()).then(setMe); }, []);
  const sites = useMemo<Site[]>(() => {
    if (!me) return [];
    if (me.role !== "operator") return ["PCL", "YUR"];
    return (["PCL", "YUR"] as Site[]).filter((s) => me.stages.some((st) => st.site === s));
  }, [me]);
  const current = site ?? sites[0] ?? null;

  // Cada consulta tiene su clave; mientras la respuesta no sea de la clave actual, se muestra «cargando»
  const key = current ? `${current}|${stage ?? ""}|${q}|${from}|${to}|${reload}` : "";
  useEffect(() => {
    if (!current) return;
    let alive = true;
    const p = new URLSearchParams({ site: current });
    if (stage) p.set("stage", stage);
    if (q) p.set("q", q);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    fetch(`/api/guias?${p}`).then((r) => r.json()).then((d: Data) => {
      if (!alive) return;
      setData({ ...d, key });
      if (d.error) toast.danger(d.error);
    });
    return () => { alive = false; };
  }, [current, stage, q, from, to, key]);
  const loading = data?.key !== key;
  // La búsqueda se aplica al dejar de escribir
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 150); return () => clearTimeout(t); }, [qInput]);

  const groups = useMemo(() => data?.groups ?? [], [data]);
  const chosen = groups.filter((g) => sel.has(g.guia));
  const units = chosen.reduce((t, g) => t + Number(g.n), 0);
  const needReason = chosen.reduce((t, g) => t + g.need_reason, 0);
  const minDate = chosen.reduce<string>((m, g) => (g.prev && g.prev > m ? g.prev : m), "");
  const activeStage = data?.stage ?? stage;
  const readOnly = me?.role === "dev";

  const [groupBy, setGroupBy] = useState<"dia" | "dealer">("dia");
  const [openBlocks, setOpenBlocks] = useState<Set<string>>(new Set());
  const toggleBlock = (k: string) => setOpenBlocks((s) => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; });
  // Bloques: guías del mismo día de facturación (o del mismo dealer)
  const blocks = useMemo(() => {
    const m = new Map<string, Group[]>();
    for (const g of groups) {
      const k = groupBy === "dia" ? (g.billing ?? "") : (g.dealers ?? "—");
      m.set(k, [...(m.get(k) ?? []), g]);
    }
    const list = [...m.entries()].map(([key, gs]) => {
      const units = gs.reduce((t, g) => t + Number(g.n), 0);
      const dealers = new Set(gs.map((g) => g.dealers)).size;
      return {
        key, guias: gs, units,
        title: groupBy === "dia" ? (key ? `Facturadas el ${fmtDate(key)}` : "Sin fecha de factura") : key,
        sub: groupBy === "dia" ? `${dealers} ${dealers === 1 ? "dealer" : "dealers"}` : "",
      };
    });
    return groupBy === "dealer" ? list.sort((a, b) => b.units - a.units) : list;
  }, [groups, groupBy]);

  const toggle = (g: string) => setSel((s) => { const x = new Set(s); if (x.has(g)) x.delete(g); else x.add(g); return x; });
  const resetSelection = () => { setSel(new Set()); setOpen(null); };

  async function apply() {
    if (!activeStage || !chosen.length) return;
    if (!date) return toast.danger("Indica la fecha");
    if (minDate && date < minDate) return toast.danger(`La fecha no puede ser anterior a ${fmtDate(minDate)} (etapa previa)`);
    if (activeStage === "d_zarpe" && !nave.trim()) return toast.danger("Indica la nave en la que zarpan");
    setSaving(true);
    const changes: Record<string, string> = { [activeStage]: date };
    if (activeStage === "d_zarpe") changes.nave = nave.trim().toUpperCase();
    const r = await fetch("/api/units", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: chosen.flatMap((g) => g.ids), changes, lateReason: needReason ? reason : undefined }),
    });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setSaving(false);
    if (!r.ok) return toast.danger(j.error ?? "No se pudo guardar", j.skipped ? { description: `${j.skipped} unidades no se guardaron` } : undefined);
    toast.success(`${n(j.count)} unidades → ${NEXT_STATUS[activeStage]}`, {
      description: [
        `${chosen.length} guía(s) · ${stageLabel(current!, activeStage)} ${fmtDate(date)}${changes.nave ? ` · Nave ${changes.nave}` : ""}`,
        j.late ? `Motivo «${reason}» en ${j.late} fuera de tiempo` : "",
        j.skipped ? `${j.skipped} no se guardaron: ${j.skipReason}` : "",
      ].filter(Boolean).join("\n"),
      timeout: 8000,
    });
    if (needReason && !reason) toast.warning(`${needReason} unidades quedaron sin motivo de demora`, { description: "Puedes justificarlas después desde PCL/YUR o Alertas", timeout: 8000 });
    resetSelection(); setReason("");
    setReload((x) => x + 1);
  }

  if (!me) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  if (!sites.length) return <div className="p-6 text-sm text-sb-on-surface-variant">No tienes etapas asignadas. Pídelas a tu supervisor.</div>;
  const stages = data?.stages ?? [];

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-4 pb-4">
        <PageTitle title="Carga por guía" sub="Marca las guías de remisión y registra la fecha de tu etapa: todas sus unidades cambian de estado a la vez.">
          {sites.length > 1 && (
            <div className="flex rounded-full bg-sb-surface-container p-1">
              {sites.map((s) => (
                <button key={s} type="button" onClick={() => { setSite(s); setStage(null); resetSelection(); }}
                  className={cn("rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200", current === s ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
                  {SITE_INFO[s].title}
                </button>
              ))}
            </div>
          )}
        </PageTitle>

        {/* Etapa a registrar */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {stages.map((st) => (
            <button key={st} type="button" onClick={() => { setStage(st); resetSelection(); }}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                activeStage === st ? "border-sb-primary bg-sb-primary-soft text-sb-on-surface" : "border-sb-outline-variant text-sb-on-surface-variant hover:text-sb-on-surface")}>
              {stageLabel(current!, st)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-sb-on-surface-variant">
            <span>Facturadas del</span>
            <input type="date" aria-label="Facturadas desde" className={cn(field, "h-9 w-[8.5rem] px-2 text-xs sm:w-auto sm:text-sm")} value={from} max={to || undefined}
              onChange={(e) => { setFrom(e.target.value); resetSelection(); }} />
            <span>al</span>
            <input type="date" aria-label="Facturadas hasta" className={cn(field, "h-9 w-[8.5rem] px-2 text-xs sm:w-auto sm:text-sm")} value={to} min={from || undefined}
              onChange={(e) => { setTo(e.target.value); resetSelection(); }} />
            {(from || to) && (
              <button type="button" onClick={() => { setFrom(""); setTo(""); resetSelection(); }} aria-label="Quitar filtro de fechas"
                className="rounded-full p-1 hover:bg-sb-surface-container hover:text-sb-on-surface"><X className="h-3.5 w-3.5" /></button>
            )}
          </div>
          <label className="relative w-full sm:ml-auto sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sb-on-surface-variant" />
            <input className={cn(field, "w-full pl-9")} placeholder="Buscar guías (separa con coma)" value={qInput} onChange={(e) => setQInput(e.target.value)} aria-label="Buscar guías" />
          </label>
        </div>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sb-outline-variant/40 px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
              <FileStack className="h-4 w-4 text-sb-on-surface-variant" />
              <b className="whitespace-nowrap">{n(groups.length)} guías</b>
              <span className="text-sb-on-surface-variant">· {n(groups.reduce((t, g) => t + Number(g.n), 0))} unidades por registrar</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-sb-on-surface-variant">Agrupar por</span>
              <div className="flex rounded-full bg-sb-surface-container p-0.5">
                {([["dia", "Día de factura"], ["dealer", "Dealer"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => { setGroupBy(k); setOpenBlocks(new Set()); }}
                    className={cn("rounded-full px-3 py-1 text-[11px] font-semibold transition-colors", groupBy === k ? "bg-sb-surface text-sb-on-surface shadow-sm" : "text-sb-on-surface-variant")}>{l}</button>
                ))}
              </div>
            </div>
            {!!data?.withoutGuia && <span className="w-full text-[11px] text-sb-on-surface-variant">{n(data.withoutGuia)} unidades sin guía: regístralas en «Mi trabajo» o en el módulo</span>}
          </div>

          {loading && !groups.length && <p className="py-10 text-center text-xs text-sb-on-surface-variant">Cargando guías…</p>}
          {!loading && !groups.length && <p className="px-4 py-10 text-center text-xs text-sb-on-surface-variant">{q ? "Ninguna guía coincide con la búsqueda." : "No hay guías pendientes de esta etapa."}</p>}

          {/* Guías en bloques (por día de facturación o por dealer), cerrados hasta que los abres */}
          <div className="flex flex-col">
            {blocks.map((b) => {
              const isOpen = !!q || openBlocks.has(b.key) || blocks.length === 1;
              const marked = b.guias.filter((g) => sel.has(g.guia)).length;
              const all = marked === b.guias.length, some = marked > 0 && !all;
              const late = b.guias.reduce((t, g) => t + g.need_reason, 0);
              return (
                <div key={b.key} className="border-b border-sb-outline-variant/30 last:border-0">
                  <div className={cn("flex items-center gap-3 px-4 py-3 transition-colors", marked ? "bg-sb-primary-soft/60" : "hover:bg-sb-surface-container-low")}>
                    <input type="checkbox" aria-label={`Marcar todas las guías de ${b.title}`} checked={all} disabled={readOnly}
                      ref={(el) => { if (el) el.indeterminate = some; }}
                      onChange={() => setSel((s) => { const x = new Set(s); for (const g of b.guias) { if (all) x.delete(g.guia); else x.add(g.guia); } return x; })}
                      className="h-5 w-5 shrink-0 accent-[var(--sb-primary)]" />
                    <button type="button" onClick={() => toggleBlock(b.key)} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{b.title}</span>
                        <span className="block text-[11px] text-sb-on-surface-variant">
                          {n(b.guias.length)} guías{marked ? <b className="text-sb-on-surface"> · {marked} marcadas</b> : null}
                          {b.sub ? ` · ${b.sub}` : ""}
                        </span>
                      </span>
                      {late > 0 && <span className="hidden items-center gap-1 rounded-full bg-sb-late-soft px-2 py-0.5 text-[10px] font-semibold text-sb-late sm:inline-flex"><AlertTriangle className="h-3 w-3" />{late} sin motivo</span>}
                      <span className="text-right"><b className="block text-base leading-none tabular-nums">{n(b.units)}</b><span className="text-[10px] text-sb-on-surface-variant">unid.</span></span>
                      <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.25, ease: EASE }} className="inline-flex text-sb-on-surface-variant"><ChevronRight className="h-4 w-4" /></motion.span>
                    </button>
                  </div>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
                        <ul className="border-t border-sb-outline-variant/30 bg-sb-surface-container-low/40 pl-4 sm:pl-8">
                          {b.guias.map((g) => {
                            const on = sel.has(g.guia), unitsOpen = open === g.guia;
                            return (
                              <li key={g.guia} className="border-b border-sb-outline-variant/20 last:border-0">
                                <div onClick={() => !readOnly && toggle(g.guia)}
                                  className={cn("flex cursor-pointer items-center gap-3 py-2 pr-4 transition-colors", on ? "bg-sb-primary-soft" : "hover:bg-sb-surface-container-low")}>
                                  <input type="checkbox" aria-label={`Marcar guía ${g.guia}`} checked={on} disabled={readOnly} onClick={(e) => e.stopPropagation()} onChange={() => toggle(g.guia)} className="ml-1 h-4 w-4 shrink-0 accent-[var(--sb-primary)]" />
                                  <span className="min-w-0 flex-1">
                                    <span className="block font-mono text-xs font-semibold">{g.guia}</span>
                                    <span className="block truncate text-[11px] text-sb-on-surface-variant">{groupBy === "dia" ? g.dealers : `Facturada ${fmtDate(g.billing) || "—"}`}{g.naves ? ` · ${g.naves}` : ""}</span>
                                  </span>
                                  <span className="hidden text-[11px] text-sb-on-surface-variant sm:block">Llega {fmtDate(g.est) || "—"}</span>
                                  {g.need_reason > 0 && <span className="inline-flex items-center gap-0.5 rounded-full bg-sb-late-soft px-1.5 py-0.5 text-[10px] font-semibold text-sb-late" title="Fuera de tiempo sin motivo"><AlertTriangle className="h-2.5 w-2.5" />{g.need_reason}</span>}
                                  <span className="w-14 text-right"><b className="text-sm tabular-nums">{n(g.n)}</b> <span className="text-[10px] text-sb-on-surface-variant">{g.w2 && g.w3 ? "mix" : g.w2 ? "2W" : "3W"}</span></span>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(unitsOpen ? null : g.guia); }} aria-expanded={unitsOpen} aria-label={`Ver unidades de ${g.guia}`}
                                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sb-on-surface-variant hover:bg-sb-surface-container">
                                    <motion.span animate={{ rotate: unitsOpen ? 90 : 0 }} transition={{ duration: 0.25, ease: EASE }} className="inline-flex"><ChevronRight className="h-3.5 w-3.5" /></motion.span>
                                  </button>
                                </div>
                                <AnimatePresence initial={false}>
                                  {unitsOpen && (
                                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden bg-sb-surface-container-low">
                                      <p className="px-4 pt-2 text-[11px] text-sb-on-surface-variant">Factura <span className="font-mono">{g.invoices ?? "—"}</span> · facturada {fmtDate(g.billing) || "—"} · llega {fmtDate(g.est) || "—"} · 2W {n(g.w2)} · 3W {n(g.w3)}</p>
                                      <GuiaUnits site={current!} stage={activeStage!} guia={g.guia} />
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </li>
                            );
                          })}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Barra para registrar: aparece al marcar guías */}
        <AnimatePresence>
          {chosen.length > 0 && activeStage && (
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}
              className="sticky bottom-24 z-40 rounded-2xl border border-sb-outline-variant bg-sb-surface p-3 shadow-2xl md:bottom-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[10rem] flex-1">
                  <p className="text-sm font-semibold">{chosen.length} guía(s) · {n(units)} unidades</p>
                  <p className="text-[11px] text-sb-on-surface-variant">Pasan a <b className="text-sb-on-surface">{NEXT_STATUS[activeStage]}</b></p>
                </div>
                <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">
                  {stageLabel(current!, activeStage)}
                  <input type="date" className={field} value={date} min={minDate || undefined} onChange={(e) => setDate(e.target.value)} />
                </label>
                {activeStage === "d_zarpe" && (
                  <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">
                    <span className="flex items-center gap-1"><Ship className="h-3 w-3" /> Nave</span>
                    <input className={cn(field, "w-44 uppercase")} list="naves" placeholder="Ej. HENRY 1" value={nave} onChange={(e) => setNave(e.target.value)} />
                    <datalist id="naves">{(data?.naves ?? []).map((v) => <option key={v} value={v} />)}</datalist>
                  </label>
                )}
                {needReason > 0 && (
                  <label className="flex flex-col gap-1 text-[11px] text-sb-late">
                    Motivo de demora ({needReason} fuera de tiempo · puedes dejarlo para después)
                    <SoftSelect className={cn(field, "w-52")} value={reason} onChange={(e) => setReason(e.target.value)}>
                      <option value="">Elegir…</option>
                      {DELAY_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </SoftSelect>
                  </label>
                )}
                <div className="flex items-center gap-2">
                  <Button variant="secondary" className="rounded-full" onPress={resetSelection} isDisabled={saving}><X className="h-4 w-4" /> Quitar</Button>
                  <Button variant="primary" className="rounded-full" onPress={apply} isDisabled={saving || readOnly}>
                    {saving ? "Guardando…" : `Registrar ${chosen.length} guía(s)`}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
