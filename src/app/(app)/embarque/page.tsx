"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, toast } from "@heroui/react";
import { Sheet } from "@/components/modal/Sheet";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowDown, Box, Eye, Plus, Ship, X } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn } from "@/lib/cn";
import { DATA_EVENT } from "@/components/UploadCenter";
import { DELAY_REASONS, SITE_INFO, fmtDate, type Site } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { DockScene } from "@/components/figures/dock/DockScene";
import { SuggestInput } from "@/components/SuggestInput";
import { DatePicker, pastQuick } from "@/components/modal/DatePicker";
import { NaveContents } from "@/components/embarque/NaveContents";
import { StowagePlan } from "@/components/embarque/StowagePlan";

/**
 * Embarque y zarpe (Iquitos):
 * 1. Embarque: se busca cada guía y se agrega al contenedor; con el contenedor, la nave y la fecha se registra el embarque
 *    → sus unidades pasan de IQT-Port a «Embarque». Se repite por cada contenedor de la nave.
 * 2. Embarcación · detalle: las naves cargando, con sus contenedores y unidades. Cuando una nave completó su carga,
 *    se marca (check) y se registra el zarpe → sus unidades pasan a «Tránsito fluvial» y la nave sale de la lista.
 */

type Guia = { guia: string; district: string; dealer: string; w2: number; w3: number; total: number; need: number; skipped: number };
type Nave = { nave: string; containers: number; w2: number; w3: number; total: number; first: string; last: string; need: number; list: { code: string; id: number }[] };
type Data = { site: Site; canEmbark: boolean; canSail: boolean; naves: Nave[]; known: string[]; error?: string };
type Row = { cid: number; code: string; loaded_on: string; guia: string | null; district: string | null; dealer: string | null; category: string | null; chassis: string; motor: string | null; material: string | null };

const EASE = [0.22, 1, 0.36, 1] as const;
const field = "h-10 w-full rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-on-surface";
const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");

/** Estado actual → estado siguiente (como en el boceto). */
function StateChange({ from, to }: { from: string; to: string }) {
  return (
    <div className="flex flex-col items-start gap-1 text-xs">
      <span className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant">Estado</span>
      <span className="rounded-full border border-sb-outline-variant px-3 py-1 font-semibold">{from}</span>
      <ArrowDown className="ml-4 h-3.5 w-3.5 text-sb-on-surface-variant" />
      <span className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant">Estado siguiente</span>
      <span className="rounded-full bg-sb-primary px-3 py-1 font-semibold text-sb-on-primary">{to}</span>
    </div>
  );
}

const Label = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">{t}{children}</label>
);

/** Detalle de una nave: contenedores → guías → chasis. */
function NaveDetail({ site, nave, naves, canUndo, onClose, onChanged }: { site: Site; nave: string | null; naves: string[]; canUndo: boolean; onClose: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [again, setAgain] = useState(0);
  const [tab, setTab] = useState<"plano" | "contenido">("plano");
  useEffect(() => {
    if (!nave) return;
    fetch(`/api/embarque?${new URLSearchParams({ site, nave })}`).then((r) => r.json()).then((j) => setRows(j.rows ?? []));
  }, [site, nave, again]);
  const containers = useMemo(() => {
    const m = new Map<number, { code: string; loaded_on: string; guias: Map<string, Row[]> }>();
    for (const r of rows ?? []) {
      const c = m.get(r.cid) ?? { code: r.code, loaded_on: r.loaded_on, guias: new Map() };
      const g = r.guia ?? "(sin guía)";
      c.guias.set(g, [...(c.guias.get(g) ?? []), r]);
      m.set(r.cid, c);
    }
    return [...m.entries()];
  }, [rows]);
  // Contenedor que se va a quitar (se confirma en el modal del sistema)
  const [ask, setAsk] = useState<{ id: number; code: string } | null>(null);
  const [undoing, setUndoing] = useState(false);
  async function undo(id: number, code: string) {
    setUndoing(true);
    const r = await fetch("/api/embarque", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "undo", id }) });
    const j = await r.json().catch(() => ({}));
    setUndoing(false);
    setAsk(null);
    if (!r.ok) return toast.danger(j.error ?? "No se pudo quitar");
    toast.success(`Contenedor ${code} quitado`, { description: `${n(j.units)} unidades volvieron a IQT-Port` });
    onChanged();
    setRows((x) => x?.filter((r) => r.cid !== id) ?? null);
  }
  return (
    <>
    <Sheet open={!!nave} onClose={onClose} size="lg" icon={Ship} title={`Nave ${nave ?? ""}`}
      sub={rows ? `${containers.length} ${containers.length === 1 ? "contenedor" : "contenedores"} · ${n(rows.length)} unidades` : "Cargando…"}
      summary={rows ? <>Contenedores y unidades a bordo de <b className="text-sb-on-surface">{nave}</b></> : null}
      footer={nave ? (
        <Link href={`/units/${site.toLowerCase()}?${new URLSearchParams({ nave })}`} className="rounded-full bg-sb-surface-container-high px-4 py-2 text-xs font-medium transition-colors hover:bg-sb-primary hover:text-sb-on-primary">
          Ver sus unidades en {SITE_INFO[site].short} →
        </Link>
      ) : null}>
              <div className="mb-3 flex w-max gap-1 rounded-full bg-sb-surface-container p-1">
                {([["plano", "Plano de estiba"], ["contenido", "Contenido"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setTab(k)}
                    className={cn("rounded-full px-4 py-1.5 text-xs font-semibold transition-colors", tab === k ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>{l}</button>
                ))}
              </div>
              {tab === "plano" && nave ? <StowagePlan site={site} nave={nave} onChanged={onChanged} />
              : !rows ? <p className="py-8 text-center text-sm text-sb-on-surface-variant">Cargando…</p>
                : <NaveContents site={site} nave={nave ?? ""} naves={naves} rows={rows} canUndo={canUndo} onUndo={(id, code) => setAsk({ id, code })} onEdited={() => { setAgain((x) => x + 1); onChanged(); }} />}
    </Sheet>
      <ConfirmDialog open={!!ask} title={`¿Quitar el contenedor ${ask?.code ?? ""}?`} confirmLabel="Sí, quitar contenedor" busy={undoing}
        onCancel={() => setAsk(null)} onConfirm={() => ask && undo(ask.id, ask.code)}>
        Sus unidades salen de la nave <b className="text-sb-on-surface">{nave}</b> y <b className="text-sb-on-surface">vuelven a IQT-Port</b>, listas para embarcarse de nuevo.
      </ConfirmDialog>
    </>
  );
}

export default function EmbarquePage() {
  const [me, setMe] = useState<{ role: string; stages: { site: Site; field: string }[] } | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [reload, setReload] = useState(0);
  // Se guardó un Excel con «Subir Excel» del menú: recargar
  useEffect(() => {
    const again = () => setReload((n) => n + 1);
    window.addEventListener(DATA_EVENT, again);
    return () => window.removeEventListener(DATA_EVENT, again);
  }, []);
  // Contenedor que se está armando
  const [guiaInput, setGuiaInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [guias, setGuias] = useState<Guia[]>([]);
  const [container, setContainer] = useState("");
  const [nave, setNave] = useState("");
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  // Zarpe
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [sailDate, setSailDate] = useState(today());
  const [sailReason, setSailReason] = useState("");
  const [sailing, setSailing] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());

  useEffect(() => { fetch("/api/me").then((r) => r.json()).then(setMe); }, []);
  const sites = useMemo<Site[]>(() => {
    if (!me) return [];
    if (me.role !== "operator") return ["PCL", "YUR"];
    return (["PCL", "YUR"] as Site[]).filter((s) => me.stages.some((st) => st.site === s && (st.field === "d_carga" || st.field === "d_zarpe")));
  }, [me]);
  const current = site ?? sites[0] ?? null;

  useEffect(() => {
    if (!current) return;
    let alive = true;
    fetch(`/api/embarque?site=${current}`).then((r) => r.json()).then((d: Data) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [current, reload]);

  const tot = guias.reduce((t, g) => ({ w2: t.w2 + g.w2, w3: t.w3 + g.w3, total: t.total + g.total, need: t.need + g.need }), { w2: 0, w3: 0, total: 0, need: 0 });
  const checkedNaves = (data?.naves ?? []).filter((x) => checked.has(x.nave));
  const sailNeed = checkedNaves.reduce((t, x) => t + x.need, 0);
  const sailMin = checkedNaves.reduce((m, x) => (x.last > m ? x.last : m), "");

  async function addGuia(pick?: string) {
    const g = (pick ?? guiaInput).trim();
    if (!g || !current) return;
    if (guias.some((x) => x.guia.toUpperCase() === g.toUpperCase())) return toast.warning("Esa guía ya está en el contenedor");
    setAdding(true);
    const r = await fetch(`/api/embarque?${new URLSearchParams({ site: current, guia: g })}`);
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setAdding(false);
    if (!r.ok) return toast.danger(j.error);
    setGuias((x) => [...x, j]);
    setGuiaInput("");
    if (j.skipped) toast.warning(`${j.skipped} unidades de esa guía ya no están en IQT-Port y no se agregan`);
  }

  async function embark() {
    if (!current) return;
    if (!guias.length) return toast.danger("Agrega al menos una guía");
    if (!container.trim()) return toast.danger("Indica el número de contenedor");
    if (!nave.trim()) return toast.danger("Indica la nave");
    setSaving(true);
    const r = await fetch("/api/embarque", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "embark", site: current, container, nave, date, guias: guias.map((g) => g.guia), lateReason: tot.need ? reason : undefined }),
    });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setSaving(false);
    if (!r.ok) return toast.danger(j.error);
    toast.success(`Contenedor ${j.code} embarcado en la nave ${j.nave}`, { description: `${n(j.units)} unidades → Embarque. Sigue con el próximo contenedor.`, timeout: 7000 });
    if (tot.need && !reason) toast.warning(`${tot.need} unidades quedaron sin motivo de demora`, { description: "Puedes justificarlas después desde PCL/YUR o Alertas", timeout: 8000 });
    setGuias([]); setContainer(""); setReason("");
    setReload((x) => x + 1);
  }

  async function sail() {
    if (!current || !checkedNaves.length) return toast.danger("Marca la nave que zarpa");
    if (sailMin && sailDate < sailMin) return toast.danger(`El zarpe no puede ser antes del último embarque (${fmtDate(sailMin)})`);
    setSailing(true);
    const r = await fetch("/api/embarque", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sail", site: current, naves: checkedNaves.map((x) => x.nave), date: sailDate, lateReason: sailNeed ? sailReason : undefined }),
    });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setSailing(false);
    if (!r.ok) return toast.danger(j.error);
    toast.success(`Zarpe registrado: ${checkedNaves.map((x) => x.nave).join(", ")}`, { description: `${n(j.units)} unidades → Tránsito fluvial`, timeout: 7000 });
    if (sailNeed && !sailReason) toast.warning(`${sailNeed} unidades quedaron sin motivo de demora`, { description: "Puedes justificarlas después desde PCL/YUR o Alertas", timeout: 8000 });
    setChecked(new Set()); setSailReason("");
    // La chata se va río abajo en el muelle y luego se recarga la lista
    setLeaving(new Set(checkedNaves.map((x) => x.nave)));
    setTimeout(() => { setReload((x) => x + 1); setLeaving(new Set()); }, 1700);
  }

  if (!me) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  if (!sites.length || !current) return <div className="p-6 text-sm text-sb-on-surface-variant">El embarque y el zarpe no son etapas asignadas a ti. Pídelas a tu supervisor.</div>;
  const naveOptions = [...new Set([...(data?.naves ?? []).map((x) => x.nave), ...(data?.known ?? [])])];

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-4">
        <PageTitle title="Embarque y zarpe" sub="1. Arma cada contenedor con sus guías y regístralo en su nave. 2. Cuando la nave completó su carga, márcala y registra el zarpe.">
          {sites.length > 1 && (
            <div className="flex rounded-full bg-sb-surface-container p-1">
              {sites.map((s) => (
                <button key={s} type="button" onClick={() => { setSite(s); setGuias([]); setChecked(new Set()); }}
                  className={cn("rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200", current === s ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
                  {SITE_INFO[s].title}
                </button>
              ))}
            </div>
          )}
        </PageTitle>

        {/* Muelle en vivo */}
        <Card className="overflow-hidden p-2 sm:p-3">
          <DockScene naves={data?.naves ?? []} checked={checked} leaving={leaving} canSail={!!data?.canSail}
            building={{ guias: guias.length, units: tot.total, container, nave }}
            onOpen={setView}
            onToggle={(v) => setChecked((st) => { const y = new Set(st); if (y.has(v)) y.delete(v); else y.add(v); return y; })} />
        </Card>

        {/* 1. Embarque de un contenedor */}
        <Card className="overflow-hidden">
          <div className="border-b border-sb-outline-variant/40 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Box className="h-4 w-4" /> 1. Embarque · arma el contenedor</h3>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-[1fr_17rem]">
            <div className="flex min-w-0 flex-col gap-3">
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addGuia(); }}>
                <SuggestInput inputClassName={field} mono placeholder="Guía de remisión (escribe para buscar)" value={guiaInput} onChange={setGuiaInput}
                  ariaLabel="Guía de remisión" disabled={!data?.canEmbark} onPick={(v) => { setGuiaInput(v); addGuia(v); }} onEnter={() => addGuia()}
                  source={(q) => `/api/suggest?${new URLSearchParams({ kind: "guia", site: current, step: "d_carga", q })}`} />
                <Button type="submit" variant="primary" className="shrink-0 rounded-full" isDisabled={adding || !guiaInput.trim() || !data?.canEmbark}>
                  <Plus className="h-4 w-4" /> {adding ? "Buscando…" : "Agregar"}
                </Button>
              </form>
              {/* Celular: una fila compacta por guía */}
              <div className="flex flex-col rounded-xl border border-sb-outline-variant/40 sm:hidden">
                {!guias.length && <p className="px-3 py-6 text-center text-xs text-sb-on-surface-variant">Busca una guía y pulsa «Agregar». Se van sumando las unidades del contenedor.</p>}
                <AnimatePresence initial={false}>
                  {guias.map((g) => (
                    <motion.div key={g.guia} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10, transition: { duration: 0.15 } }} transition={{ duration: 0.3, ease: EASE }}
                      className="flex items-center gap-2 border-b border-sb-outline-variant/20 px-3 py-2.5 text-xs last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono font-semibold">{g.guia}</p>
                        <p className="truncate text-[11px] text-sb-on-surface-variant">{g.district} · {g.dealer}</p>
                      </div>
                      <span className="shrink-0 text-right tabular-nums"><b>{g.total}</b><span className="block text-[10px] text-sb-on-surface-variant">2W {g.w2 || 0} · 3W {g.w3 || 0}</span></span>
                      <button type="button" onClick={() => setGuias((x) => x.filter((y) => y.guia !== g.guia))} aria-label={`Quitar ${g.guia}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sb-on-surface-variant hover:bg-sb-surface-container hover:text-sb-late"><X className="h-4 w-4" /></button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {guias.length > 0 && <p className="flex justify-between border-t border-sb-outline-variant/40 px-3 py-2 text-xs font-bold"><span>{guias.length} guía(s)</span><span>{tot.total} unid. · 2W {tot.w2} · 3W {tot.w3}</span></p>}
              </div>
              <div className="hidden overflow-x-auto rounded-xl border border-sb-outline-variant/40 sm:block">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant">
                      <th className="px-3 py-2 font-semibold">G.R.</th><th className="px-2 py-2 font-semibold">Distrito</th><th className="px-2 py-2 font-semibold">Dealer</th>
                      <th className="px-2 py-2 text-right font-semibold">2W</th><th className="px-2 py-2 text-right font-semibold">3W</th><th className="px-2 py-2 text-right font-semibold">Total</th><th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence initial={false}>
                      {guias.map((g) => (
                        <motion.tr key={g.guia} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10, transition: { duration: 0.15 } }} transition={{ duration: 0.3, ease: EASE }}
                          className="border-b border-sb-outline-variant/20">
                          <td className="px-3 py-2 font-mono font-semibold">{g.guia}</td>
                          <td className="px-2 py-2">{g.district}</td>
                          <td className="max-w-[14rem] truncate px-2 py-2" title={g.dealer}>{g.dealer}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{g.w2 || ""}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{g.w3 || ""}</td>
                          <td className="px-2 py-2 text-right font-semibold tabular-nums">{g.total}</td>
                          <td className="px-1 py-2 text-right">
                            <button type="button" onClick={() => setGuias((x) => x.filter((y) => y.guia !== g.guia))} aria-label={`Quitar ${g.guia}`} className="rounded-full p-1 text-sb-on-surface-variant hover:bg-sb-surface-container hover:text-sb-late"><X className="h-3.5 w-3.5" /></button>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                    {!guias.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-sb-on-surface-variant">Busca una guía y pulsa «Agregar». Se van sumando las unidades del contenedor.</td></tr>}
                  </tbody>
                  {guias.length > 0 && (
                    <tfoot>
                      <tr className="font-bold">
                        <td className="px-3 py-2" colSpan={3}>{guias.length} guía(s)</td>
                        <td className="px-2 py-2 text-right tabular-nums">{tot.w2}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{tot.w3}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{tot.total}</td><td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-sb-outline-variant/40 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <StateChange from="IQT-Port" to="Embarque" />
              <Label t="Contenedor"><input className={cn(field, "uppercase")} placeholder="Ej. SKU-007358" value={container} onChange={(e) => setContainer(e.target.value)} disabled={!data?.canEmbark} /></Label>
              <Label t="Nave">
                <input className={cn(field, "uppercase")} list="naves-emb" placeholder="Ej. HENRY 3" value={nave} onChange={(e) => setNave(e.target.value)} disabled={!data?.canEmbark} />
                <datalist id="naves-emb">{naveOptions.map((v) => <option key={v} value={v} />)}</datalist>
              </Label>
              <div className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Fecha de embarque
                <DatePicker label="Fecha de embarque" value={date} onChange={setDate} disabled={!data?.canEmbark} quick={pastQuick(null, today())} /></div>
              {tot.need > 0 && (
                <Label t={`Motivo de demora (${tot.need} fuera de tiempo · puedes dejarlo para después)`}>
                  <select className={field} value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Elegir…</option>{DELAY_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
                </Label>
              )}
              <Button variant="primary" className="rounded-full" onPress={embark} isDisabled={saving || !guias.length || !data?.canEmbark}>
                {saving ? "Registrando…" : "Registrar embarque"}
              </Button>
              {data && !data.canEmbark && <p className="text-[11px] text-sb-on-surface-variant">Solo lectura: el embarque no es tu etapa.</p>}
            </div>
          </div>
        </Card>

        {/* 2. Embarcación · detalle y zarpe */}
        <Card className="overflow-hidden">
          <div className="border-b border-sb-outline-variant/40 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Ship className="h-4 w-4" /> 2. Embarcación · detalle (naves cargando, aún sin zarpar)</h3>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-[1fr_17rem]">
            {/* Celular: una tarjeta por nave */}
            <div className="flex flex-col rounded-xl border border-sb-outline-variant/40 sm:hidden">
              {data && !data.naves.length && <p className="px-3 py-6 text-center text-xs text-sb-on-surface-variant">No hay naves cargando. Registra un embarque arriba.</p>}
              {(data?.naves ?? []).map((x) => {
                const on = checked.has(x.nave);
                return (
                  <div key={x.nave} className={cn("flex items-center gap-3 border-b border-sb-outline-variant/20 px-3 py-3 text-xs transition-colors last:border-0", on && "bg-sb-primary-soft")}>
                    <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--sb-primary)]" aria-label={`Marcar zarpe de ${x.nave}`} checked={on} disabled={!data?.canSail}
                      onChange={() => setChecked((st) => { const y = new Set(st); if (y.has(x.nave)) y.delete(x.nave); else y.add(x.nave); return y; })} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{x.nave}</p>
                      <p className="text-[11px] text-sb-on-surface-variant">{x.containers} contenedor(es) · {n(x.total)} unid. (2W {n(x.w2)} · 3W {n(x.w3)})</p>
                      <p className="text-[10px] text-sb-on-surface-variant">embarque {fmtDate(x.first)}{x.last !== x.first ? ` – ${fmtDate(x.last)}` : ""}</p>
                    </div>
                    <Button size="sm" variant="secondary" isIconOnly aria-label={`Ver ${x.nave}`} onPress={() => setView(x.nave)}><Eye className="h-4 w-4" /></Button>
                  </div>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto rounded-xl border border-sb-outline-variant/40 sm:block">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead>
                  <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant">
                    <th className="px-3 py-2 font-semibold">Nave</th><th className="px-2 py-2 text-right font-semibold">Contenedores</th>
                    <th className="px-2 py-2 text-right font-semibold">2W</th><th className="px-2 py-2 text-right font-semibold">3W</th><th className="px-2 py-2 text-right font-semibold">Total</th>
                    <th className="px-2 py-2 text-center font-semibold">Zarpa</th><th className="px-3 py-2 text-center font-semibold">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {(data?.naves ?? []).map((x) => {
                      const on = checked.has(x.nave);
                      return (
                        <motion.tr key={x.nave} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30, transition: { duration: 0.25 } }} transition={{ duration: 0.3, ease: EASE }}
                          className={cn("border-b border-sb-outline-variant/20 transition-colors duration-200", on && "bg-sb-primary-soft")}>
                          <td className="px-3 py-2 font-semibold">{x.nave}<span className="block text-[10px] font-normal text-sb-on-surface-variant">embarque {fmtDate(x.first)}{x.last !== x.first ? ` – ${fmtDate(x.last)}` : ""}</span></td>
                          <td className="px-2 py-2 text-right tabular-nums">{x.containers}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{n(x.w2)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{n(x.w3)}</td>
                          <td className="px-2 py-2 text-right font-semibold tabular-nums">{n(x.total)}</td>
                          <td className="px-2 py-2 text-center">
                            <input type="checkbox" className="h-4 w-4 accent-[var(--sb-primary)]" aria-label={`Marcar zarpe de ${x.nave}`} checked={on} disabled={!data?.canSail}
                              onChange={() => setChecked((s) => { const y = new Set(s); if (y.has(x.nave)) y.delete(x.nave); else y.add(x.nave); return y; })} />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Button size="sm" variant="secondary" className="rounded-full" onPress={() => setView(x.nave)}><Eye className="h-3.5 w-3.5" /> Ver</Button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                  {data && !data.naves.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-sb-on-surface-variant">No hay naves cargando. Registra un embarque arriba.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-sb-outline-variant/40 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <StateChange from="Embarque" to="Tránsito fluvial" />
              <div className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Fecha de zarpe
                <DatePicker label="Fecha de zarpe" value={sailDate} min={sailMin || null} onChange={setSailDate} disabled={!data?.canSail} quick={pastQuick(sailMin || null, today())} /></div>
              {sailNeed > 0 && (
                <Label t={`Motivo de demora (${sailNeed} fuera de tiempo · puedes dejarlo para después)`}>
                  <select className={field} value={sailReason} onChange={(e) => setSailReason(e.target.value)}><option value="">Elegir…</option>{DELAY_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
                </Label>
              )}
              <Button variant="primary" className="rounded-full" onPress={sail} isDisabled={sailing || !checkedNaves.length || !data?.canSail}>
                {sailing ? "Registrando…" : checkedNaves.length ? `Registrar zarpe (${checkedNaves.length})` : "Registrar zarpe"}
              </Button>
              {checkedNaves.length > 0 && <p className="text-[11px] text-sb-on-surface-variant">{n(checkedNaves.reduce((t, x) => t + x.total, 0))} unidades pasan a Tránsito fluvial.</p>}
              {data && !data.canSail && <p className="text-[11px] text-sb-on-surface-variant">Solo lectura: el zarpe no es tu etapa.</p>}
            </div>
          </div>
        </Card>
      </div>
      <NaveDetail key={view ?? "none"} site={current} nave={view} naves={naveOptions} canUndo={!!data?.canEmbark} onClose={() => setView(null)} onChanged={() => setReload((x) => x + 1)} />
    </MotionConfig>
  );
}
