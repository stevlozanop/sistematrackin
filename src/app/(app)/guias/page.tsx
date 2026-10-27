"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Button, toast } from "@heroui/react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { AlertTriangle, ChevronRight, FileStack, Search, Ship, X } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { ServiceBadge } from "@/components/Service";
import { cn } from "@/lib/cn";
import { DELAY_REASONS, SITE_INFO, fmtDate, type DateField, type Site } from "@/lib/hsp";
import { stageLabel, today } from "@/lib/workflow";

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
  d_carga: "IQT-Port (cargada)", d_zarpe: "Tránsito fluvial", d_arribo: "Arribo puerto", d_almacen: "En almacén",
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
  const [data, setData] = useState<Data | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [nave, setNave] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => { fetch("/api/me").then((r) => r.json()).then(setMe); }, []);
  const sites = useMemo<Site[]>(() => {
    if (!me) return [];
    if (me.role !== "operator") return ["PCL", "YUR"];
    return (["PCL", "YUR"] as Site[]).filter((s) => me.stages.some((st) => st.site === s));
  }, [me]);
  const current = site ?? sites[0] ?? null;

  // Cada consulta tiene su clave; mientras la respuesta no sea de la clave actual, se muestra «cargando»
  const key = current ? `${current}|${stage ?? ""}|${q}|${reload}` : "";
  useEffect(() => {
    if (!current) return;
    let alive = true;
    const p = new URLSearchParams({ site: current });
    if (stage) p.set("stage", stage);
    if (q) p.set("q", q);
    fetch(`/api/guias?${p}`).then((r) => r.json()).then((d: Data) => {
      if (!alive) return;
      setData({ ...d, key });
      if (d.error) toast.danger(d.error);
    });
    return () => { alive = false; };
  }, [current, stage, q, key]);
  const loading = data?.key !== key;
  // La búsqueda se aplica al dejar de escribir
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 350); return () => clearTimeout(t); }, [qInput]);

  const groups = useMemo(() => data?.groups ?? [], [data]);
  const chosen = groups.filter((g) => sel.has(g.guia));
  const units = chosen.reduce((t, g) => t + Number(g.n), 0);
  const needReason = chosen.reduce((t, g) => t + g.need_reason, 0);
  const minDate = chosen.reduce<string>((m, g) => (g.prev && g.prev > m ? g.prev : m), "");
  const activeStage = data?.stage ?? stage;
  const readOnly = me?.role === "dev";
  const allSelected = groups.length > 0 && groups.every((g) => sel.has(g.guia));

  const toggle = (g: string) => setSel((s) => { const x = new Set(s); if (x.has(g)) x.delete(g); else x.add(g); return x; });
  const resetSelection = () => { setSel(new Set()); setOpen(null); };

  async function apply() {
    if (!activeStage || !chosen.length) return;
    if (!date) return toast.danger("Indica la fecha");
    if (date > today()) return toast.danger("No se puede registrar una fecha futura");
    if (minDate && date < minDate) return toast.danger(`La fecha no puede ser anterior a ${fmtDate(minDate)} (etapa previa)`);
    if (activeStage === "d_zarpe" && !nave.trim()) return toast.danger("Indica la nave en la que zarpan");
    if (needReason && !reason) return toast.danger(`Elige el motivo de demora para las ${needReason} unidades fuera de tiempo`);
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
        <div className="flex flex-wrap items-center gap-2">
          {stages.map((st) => (
            <button key={st} type="button" onClick={() => { setStage(st); resetSelection(); }}
              className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                activeStage === st ? "border-sb-primary bg-sb-primary-soft text-sb-on-surface" : "border-sb-outline-variant text-sb-on-surface-variant hover:text-sb-on-surface")}>
              {stageLabel(current!, st)}
            </button>
          ))}
          <label className="relative ml-auto w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sb-on-surface-variant" />
            <input className={cn(field, "w-full pl-9")} placeholder="Buscar guías (varias separadas por coma)" value={qInput} onChange={(e) => setQInput(e.target.value)} aria-label="Buscar guías" />
          </label>
        </div>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sb-outline-variant/40 px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <FileStack className="h-4 w-4 text-sb-on-surface-variant" />
              <b>{n(groups.length)} guías</b>
              <span className="text-sb-on-surface-variant">· {n(groups.reduce((t, g) => t + Number(g.n), 0))} unidades esperan «{activeStage ? stageLabel(current!, activeStage) : "—"}»</span>
            </div>
            {!!data?.withoutGuia && <span className="text-[11px] text-sb-on-surface-variant">{n(data.withoutGuia)} unidades sin guía: regístralas en «Mi trabajo» o en el módulo</span>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead>
                <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant">
                  <th className="w-10 px-3 py-2">
                    <input type="checkbox" aria-label="Marcar todas" checked={allSelected} disabled={readOnly || !groups.length}
                      onChange={() => setSel(allSelected ? new Set() : new Set(groups.map((g) => g.guia)))} className="h-4 w-4 accent-[var(--sb-primary)]" />
                  </th>
                  <th className="px-2 py-2 font-semibold">Guía de remisión</th>
                  <th className="px-2 py-2 text-right font-semibold">Unidades</th>
                  <th className="px-2 py-2 text-right font-semibold">2W · 3W</th>
                  <th className="px-2 py-2 font-semibold">Dealer</th>
                  <th className="px-2 py-2 font-semibold">Factura</th>
                  <th className="px-2 py-2 font-semibold">Facturación</th>
                  <th className="px-2 py-2 font-semibold">F. estimada</th>
                  <th className="px-3 py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {loading && !groups.length && <tr><td colSpan={9} className="py-10 text-center text-sb-on-surface-variant">Cargando guías…</td></tr>}
                {!loading && !groups.length && <tr><td colSpan={9} className="py-10 text-center text-sb-on-surface-variant">{q ? "Ninguna guía coincide con la búsqueda." : "No hay guías pendientes de esta etapa."}</td></tr>}
                {groups.map((g, i) => {
                  const on = sel.has(g.guia), isOpen = open === g.guia;
                  return (
                    <Fragment key={g.guia}>
                      <motion.tr initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(i, 15) * 0.02, ease: EASE }}
                        onClick={() => !readOnly && toggle(g.guia)}
                        className={cn("cursor-pointer border-b border-sb-outline-variant/20 transition-colors duration-200", on ? "bg-sb-primary-soft" : "hover:bg-sb-surface-container-low")}>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" aria-label={`Marcar guía ${g.guia}`} checked={on} disabled={readOnly} onChange={() => toggle(g.guia)} className="h-4 w-4 accent-[var(--sb-primary)]" />
                        </td>
                        <td className="px-2 py-2 font-mono font-semibold">{g.guia}{g.naves && <span className="ml-2 font-sans text-[10px] font-normal text-sb-on-surface-variant">· {g.naves}</span>}</td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{n(g.n)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-sb-on-surface-variant">{n(g.w2)} · {n(g.w3)}</td>
                        <td className="max-w-[16rem] truncate px-2 py-2" title={g.dealers ?? ""}>{g.dealers}</td>
                        <td className="px-2 py-2 font-mono text-[11px] text-sb-on-surface-variant">{g.invoices}</td>
                        <td className="px-2 py-2">{fmtDate(g.billing) || "—"}</td>
                        <td className="px-2 py-2">
                          {fmtDate(g.est) || "—"}
                          {g.need_reason > 0 && (
                            <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-sb-late-soft px-1.5 py-0.5 text-[10px] font-semibold text-sb-late" title="Unidades fuera de tiempo sin motivo de demora">
                              <AlertTriangle className="h-2.5 w-2.5" />{g.need_reason}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => setOpen(isOpen ? null : g.guia)} aria-expanded={isOpen} aria-label={`Ver unidades de ${g.guia}`}
                            className="rounded-full p-1 text-sb-on-surface-variant hover:bg-sb-surface-container hover:text-sb-on-surface">
                            <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.25, ease: EASE }} className="inline-flex"><ChevronRight className="h-4 w-4" /></motion.span>
                          </button>
                        </td>
                      </motion.tr>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.25, ease: EASE }}>
                            <td colSpan={9} className="bg-sb-surface-container-low">
                              <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
                                <GuiaUnits site={current!} stage={activeStage!} guia={g.guia} />
                              </motion.div>
                            </td>
                          </motion.tr>
                        )}
                      </AnimatePresence>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Barra para registrar: aparece al marcar guías */}
        <AnimatePresence>
          {chosen.length > 0 && activeStage && (
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}
              className="sticky bottom-3 z-40 rounded-2xl border border-sb-outline-variant bg-sb-surface p-3 shadow-2xl">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[10rem] flex-1">
                  <p className="text-sm font-semibold">{chosen.length} guía(s) · {n(units)} unidades</p>
                  <p className="text-[11px] text-sb-on-surface-variant">Pasan a <b className="text-sb-on-surface">{NEXT_STATUS[activeStage]}</b></p>
                </div>
                <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">
                  {stageLabel(current!, activeStage)}
                  <input type="date" className={field} value={date} min={minDate || undefined} max={today()} onChange={(e) => setDate(e.target.value)} />
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
                    Motivo de demora ({needReason} fuera de tiempo)
                    <select className={cn(field, "w-52")} value={reason} onChange={(e) => setReason(e.target.value)}>
                      <option value="">Elegir…</option>
                      {DELAY_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
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
