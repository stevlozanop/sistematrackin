"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, toast } from "@heroui/react";
import { Sheet } from "@/components/modal/Sheet";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Box, ChevronUp, Eye, Plus, Ship } from "lucide-react";
import { GuiaRow, Head, PickList, PickRow, QuickChips, Register, TotalRow, field, n, plural } from "@/components/stage/StageKit";
import { Card, PageTitle } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn } from "@/lib/cn";
import { DATA_EVENT } from "@/components/UploadCenter";
import { SITE_INFO, fmtDate, unitsText, type Site } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { DockScene } from "@/components/figures/dock/DockScene";
import { SuggestInput } from "@/components/SuggestInput";
import { NaveContents } from "@/components/embarque/NaveContents";
import { StowagePlan } from "@/components/embarque/StowagePlan";
import { PendingGuias } from "@/components/embarque/PendingGuias";
import { ContainerPanel } from "@/components/embarque/ContainerPanel";

/**
 * Embarque y zarpe (Iquitos):
 * 1. Embarque: se busca cada guía y se agrega al contenedor; con el contenedor, la nave y la fecha se registra el embarque
 *    → sus unidades pasan de IQT-Port a «Embarque». Se repite por cada contenedor de la nave.
 * 2. Embarcación · detalle: las naves cargando, con sus contenedores y unidades. Cuando una nave completó su carga,
 *    se marca (check) y se registra el zarpe → sus unidades pasan a «Tránsito fluvial» y la nave sale de la lista.
 */

type Guia = { guia: string; district: string; dealer: string; w2: number; w3: number; total: number; need: number; skipped: number };
type Nave = { nave: string; containers: number; w2: number; w3: number; total: number; first: string; last: string; need: number; list: { code: string; id: number; slot: { bay: number; row: number; tier: number } | null }[]; vessel: { bays: number; rows: number; tiers: number } };
type Data = { site: Site; canEmbark: boolean; canSail: boolean; naves: Nave[]; known: string[]; error?: string };
type Row = { cid: number; code: string; loaded_on: string; guia: string | null; district: string | null; dealer: string | null; category: string | null; chassis: string; motor: string | null; material: string | null };

const EASE = [0.22, 1, 0.36, 1] as const;

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
        <Link href={`/units/${site.toLowerCase()}?${new URLSearchParams({ nave })}`} className="sb-pill [--px:1rem] rounded-full bg-sb-surface-container-high px-4 py-2 text-xs font-medium transition-colors hover:bg-sb-primary hover:text-sb-on-primary">
          Ver sus unidades en {SITE_INFO[site].short} →
        </Link>
      ) : null}>
              <div className="mb-3 flex w-max gap-1 rounded-full bg-sb-surface-container p-1">
                {([["plano", "Plano de estiba"], ["contenido", "Contenido"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setTab(k)}
                    className={cn("sb-pill [--px:1rem] rounded-full px-4 py-1.5 text-xs font-semibold transition-colors", tab === k ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>{l}</button>
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
  // Contenedor tocado en el muelle: su contenido en el panel del costado
  const [boxPick, setBoxPick] = useState<{ id: number; code: string; nave: string } | null>(null);

  useEffect(() => { fetch("/api/me").then((r) => r.json()).then(setMe); }, []);
  const formRef = useRef<HTMLDivElement>(null);
  const [formSeen, setFormSeen] = useState(false);
  useEffect(() => {
    const el = formRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setFormSeen(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  });
  const sites = useMemo<Site[]>(() => {
    if (!me) return [];
    // Solo Pucallpa: Yurimaguas tiene sus propias pantallas (sin contenedores, con despacho por ruta)
    if (me.role !== "operator") return ["PCL"];
    return (["PCL"] as Site[]).filter((s) => me.stages.some((st) => st.site === s && (st.field === "d_carga" || st.field === "d_zarpe")));
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
    toast.success(`Guía ${j.guia} agregada`, { description: `${n(j.total)} unidades al contenedor`, timeout: 2500 });
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
                  className={cn("sb-pill rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200", current === s ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
                  {SITE_INFO[s].title}
                </button>
              ))}
            </div>
          )}
        </PageTitle>

        {/* Muelle en vivo */}
        <Card className="overflow-hidden p-2 sm:p-3">
          <DockScene naves={data?.naves ?? []} checked={checked} leaving={leaving} canSail={!!data?.canSail}
            building={{ guias: guias.length, units: tot.total, w2: tot.w2, w3: tot.w3, container, nave }}
            onOpen={setView}
            onToggle={(v) => setChecked((st) => { const y = new Set(st); if (y.has(v)) y.delete(v); else y.add(v); return y; })}
            onPickContainer={setBoxPick} selectedContainer={boxPick?.id ?? null} />
        </Card>

        {/* Guías que esperan embarque, con aviso de duplicadas */}
        <PendingGuias site={current} inBox={guias.map((g) => g.guia)} canEmbark={!!data?.canEmbark}
          onAdd={(g) => addGuia(g)} onChanged={() => setReload((x) => x + 1)} />

        {/* 1. Embarque de un contenedor */}
        <Card className="scroll-mt-4 overflow-hidden">
          <div ref={formRef} id="armar">
            <Head icon={Box} title="1. Embarque · arma el contenedor"
              sub={guias.length ? `${plural(guias.length, ["guía", "guías"])} · ${n(tot.total)} motos en el contenedor${container.trim() ? ` ${container.trim().toUpperCase()}` : ""}` : "Busca las guías que van en el contenedor y súmalas"} />
          </div>
          <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="flex min-w-0 flex-col gap-3">
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addGuia(); }}>
                <SuggestInput inputClassName={field} mono placeholder="Buscar guía…" value={guiaInput} onChange={setGuiaInput}
                  ariaLabel="Guía de remisión" disabled={!data?.canEmbark} onPick={(v) => { setGuiaInput(v); addGuia(v); }} onEnter={() => addGuia()}
                  source={(q) => `/api/suggest?${new URLSearchParams({ kind: "guia", site: current, step: "d_carga", q })}`} />
                <Button type="submit" variant="primary" className="shrink-0 rounded-full" isDisabled={adding || !guiaInput.trim() || !data?.canEmbark} aria-label="Agregar guía">
                  <Plus className="h-4 w-4" /><span className="hidden sm:inline">{adding ? "Buscando…" : "Agregar"}</span>
                </Button>
              </form>
              <PickList title={guias.length ? "Guías en el contenedor" : "Contenedor vacío"} loading={false}
                empty={guias.length ? null : "Busca una guía y pulsa «Agregar». Se van sumando sus motos al contenedor."}>
                <AnimatePresence initial={false}>
                  {guias.map((g) => (
                    <motion.div key={g.guia} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 16, transition: { duration: 0.15 } }} transition={{ duration: 0.3, ease: EASE }}
                      >
                      <GuiaRow guia={g.guia} district={g.district} dealer={g.dealer} w2={g.w2} w3={g.w3} total={g.total} late={g.need} onRemove={() => setGuias((x) => x.filter((y) => y.guia !== g.guia))} />
                    </motion.div>
                  ))}
                </AnimatePresence>
                {guias.length > 1 && <TotalRow label="Total del contenedor" count={guias.length} w2={tot.w2} w3={tot.w3} total={tot.total} />}
              </PickList>
            </div>
            <Register from="IQT-Port" to="Embarque" label="Embarque" noun={["guía", "guías"]} title="En el contenedor" hint="Agrega guías a la lista"
              date={date} setDate={setDate} min="" need={tot.need} reason={reason} setReason={setReason} count={guias.length} units={tot.total}
              busy={saving} disabled={!guias.length} readOnly={!data?.canEmbark} readOnlyText="Solo lectura: el embarque no es tu etapa." onSave={embark}>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Contenedor
                  <input className={cn(field, "font-mono uppercase")} placeholder="Ej. SKU-007358" value={container} onChange={(e) => setContainer(e.target.value)} disabled={!data?.canEmbark} autoCapitalize="characters" />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Nave
                  <input className={cn(field, "uppercase")} list="naves-emb" placeholder="Ej. HENRY 3" value={nave} onChange={(e) => setNave(e.target.value)} disabled={!data?.canEmbark} autoCapitalize="characters" />
                  <datalist id="naves-emb">{naveOptions.map((v) => <option key={v} value={v} />)}</datalist>
                </label>
              </div>
              {data?.canEmbark && <QuickChips items={naveOptions} value={nave} onPick={setNave} icon={Ship} />}
            </Register>
          </div>
        </Card>

        {/* 2. Zarpe: naves cargando */}
        <Card className="overflow-hidden">
          <Head icon={Ship} title="2. Zarpe · naves cargando"
            sub={data ? (data.naves.length ? `${plural(data.naves.length, ["nave", "naves"])} en el muelle · ${n(data.naves.reduce((t, x) => t + Number(x.total), 0))} motos a bordo` : "Ninguna nave cargando") : "Cargando…"} />
          <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <PickList title="Marca la nave que completó su carga y zarpa" loading={!data} all={["Marcar todas", "Quitar todas"]}
              canAll={(data?.naves.length ?? 0) > 1 && !!data?.canSail}
              allOn={!!data?.naves.length && data.naves.every((x) => checked.has(x.nave))}
              onAll={() => setChecked((s) => (data?.naves.every((x) => s.has(x.nave)) ? new Set() : new Set(data?.naves.map((x) => x.nave))))}
              empty={data?.naves.length ? null : "No hay naves cargando. Registra un embarque arriba."}>
              <AnimatePresence initial={false}>
                {(data?.naves ?? []).map((x) => (
                  <motion.div key={x.nave} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30, transition: { duration: 0.25 } }} transition={{ duration: 0.3, ease: EASE }}>
                    <PickRow on={checked.has(x.nave)} disabled={!data?.canSail} label={`Marcar zarpe de ${x.nave}`}
                      onToggle={() => setChecked((s) => { const y = new Set(s); if (y.has(x.nave)) y.delete(x.nave); else y.add(x.nave); return y; })}
                      title={x.nave} meta={`${plural(x.containers, ["contenedor", "contenedores"])} · embarque ${fmtDate(x.first)}${x.last !== x.first ? ` – ${fmtDate(x.last)}` : ""}`}
                      late={x.need} w2={x.w2} w3={x.w3} total={x.total}
                      aside={<Button size="sm" variant="secondary" className="rounded-full" aria-label={`Ver ${x.nave}`} onPress={() => setView(x.nave)}><Eye className="h-3.5 w-3.5" /><span className="hidden sm:inline">Ver</span></Button>} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </PickList>
            <Register from="Embarque" to="Tránsito fluvial" label="Zarpe" noun={["nave", "naves"]} date={sailDate} setDate={setSailDate} min={sailMin}
              need={sailNeed} reason={sailReason} setReason={setSailReason} count={checkedNaves.length} units={checkedNaves.reduce((t, x) => t + Number(x.total), 0)}
              busy={sailing} disabled={!checkedNaves.length} readOnly={!data?.canSail} readOnlyText="Solo lectura: el zarpe no es tu etapa." onSave={sail} />
          </div>
        </Card>
      </div>
      <AnimatePresence>
        {guias.length > 0 && !formSeen && (
          <motion.button type="button" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}
            onClick={() => document.getElementById("armar")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="fixed inset-x-3 z-40 flex items-center gap-3 rounded-2xl bg-sb-on-surface px-4 py-3 text-left text-sb-surface shadow-2xl sm:hidden"
            style={{ bottom: "calc(6.25rem + env(safe-area-inset-bottom))" }}>
            <Box className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1 text-[13px] leading-tight">
              <b>Contenedor en armado</b>
              <span className="block truncate text-[11px] opacity-75">{guias.length} guía(s) · {n(tot.total)} unid. · {unitsText(tot.w2, tot.w3)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-sb-primary px-3 py-1.5 text-[12px] font-semibold text-sb-on-primary">Registrar <ChevronUp className="h-3.5 w-3.5 rotate-180" /></span>
          </motion.button>
        )}
      </AnimatePresence>
      <ContainerPanel site={current} pick={boxPick} onClose={() => setBoxPick(null)} onOpenNave={setView} />
      <NaveDetail key={view ?? "none"} site={current} nave={view} naves={naveOptions} canUndo={!!data?.canEmbark} onClose={() => setView(null)} onChanged={() => setReload((x) => x + 1)} />
    </MotionConfig>
  );
}
