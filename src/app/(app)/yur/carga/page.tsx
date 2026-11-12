"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, toast } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Package, Plus, Ship } from "lucide-react";
import { GuiaRow, Head, PickList, PickRow, Register, TotalRow, field, n, plural } from "@/components/stage/StageKit";
import { Card, PageTitle } from "@/components/ui";
import { SuggestInput } from "@/components/SuggestInput";
import { PendingGuias } from "@/components/embarque/PendingGuias";
import { DATA_EVENT } from "@/components/UploadCenter";
import { fmtDate, unitsText } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { cn } from "@/lib/cn";
import { CargoFigure } from "@/components/figures/cargo/CargoFigure";

/**
 * YUR · Carga a chata (Iquitos). En Yurimaguas no hay contenedores: las motos van sueltas en la chata.
 * 1. Se elige la chata (EDUARDO…) y se le agregan guías → sus unidades pasan de IQT-Port a «Embarque».
 * 2. Cuando la chata completó su carga se marca y se registra el zarpe → «Tránsito fluvial» hacia Yurimaguas.
 */

type G = { guia: string; district: string; dealer: string; w2: number; w3: number; total: number; need: number; skipped: number };
type Loaded = { guia: string | null; dealer: string | null; district: string | null; route: string | null; w2: number; w3: number; total: number; loaded: string; need: number };
type Chata = { nave: string; w2: number; w3: number; total: number; need: number; first: string; last: string; guias: Loaded[] };
type Data = { canLoad: boolean; canSail: boolean; chatas: string[]; loading: Chata[] };

const EASE = [0.22, 1, 0.36, 1] as const;
/** Carga normal de una chata en esta ruta (historial): unas 270 unidades */
const TYPICAL = 270;

export default function YurCargaPage() {
  const [data, setData] = useState<Data | null>(null);
  const [reload, setReload] = useState(0);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [guias, setGuias] = useState<G[]>([]);
  const [nave, setNave] = useState("");
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sailDate, setSailDate] = useState(today());
  const [sailReason, setSailReason] = useState("");
  const [sailing, setSailing] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const [formSeen, setFormSeen] = useState(false);

  const load = useCallback(() => { fetch("/api/yur?view=carga").then((r) => r.json()).then(setData).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load, reload]);
  useEffect(() => {
    const again = () => setReload((x) => x + 1);
    window.addEventListener(DATA_EVENT, again);
    return () => window.removeEventListener(DATA_EVENT, again);
  }, []);
  useEffect(() => {
    const el = formRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setFormSeen(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  });

  const tot = guias.reduce((t, g) => ({ w2: t.w2 + g.w2, w3: t.w3 + g.w3, total: t.total + g.total, need: t.need + g.need }), { w2: 0, w3: 0, total: 0, need: 0 });
  const onBoard = data?.loading.find((c) => c.nave === nave.toUpperCase());
  const sailList = (data?.loading ?? []).filter((c) => checked.has(c.nave));
  const sailNeed = sailList.reduce((t, c) => t + c.need, 0);
  const sailMin = sailList.reduce((m, c) => (c.last > m ? c.last : m), "");

  async function addGuia(pick?: string) {
    const g = (pick ?? input).trim();
    if (!g) return;
    if (guias.some((x) => x.guia.toUpperCase() === g.toUpperCase())) return toast.warning("Esa guía ya está en la carga");
    setAdding(true);
    const r = await fetch(`/api/embarque?${new URLSearchParams({ site: "YUR", guia: g })}`);
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setAdding(false);
    if (!r.ok) return toast.danger(j.error);
    setGuias((x) => [...x, j]); setInput("");
    toast.success(`Guía ${j.guia} agregada`, { description: `${n(j.total)} unidades a la carga`, timeout: 2500 });
    if (j.skipped) toast.warning(`${j.skipped} unidades de esa guía ya no están en IQT-Port y no se agregan`);
  }

  async function post(body: object) {
    const r = await fetch("/api/yur", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    if (!r.ok) { toast.danger(j.error); return null; }
    return j;
  }

  async function loadChata() {
    if (!nave.trim()) return toast.danger("Elige la chata");
    if (!guias.length) return toast.danger("Agrega al menos una guía");
    setSaving(true);
    const j = await post({ action: "load", nave, date, guias: guias.map((g) => g.guia), lateReason: tot.need ? reason : undefined });
    setSaving(false);
    if (!j) return;
    toast.success(`Carga registrada en ${j.nave}`, { description: `${n(j.units)} unidades → Embarque`, timeout: 6000 });
    if (j.late) toast.warning(`${j.late} unidades quedaron sin motivo de demora`, { description: "Puedes justificarlas después desde YUR o Alertas", timeout: 7000 });
    setGuias([]); setReason(""); setReload((x) => x + 1);
  }

  async function unload(c: Chata, g: Loaded) {
    if (!g.guia || !window.confirm(`¿Sacar la guía ${g.guia} de ${c.nave}? Sus ${g.total} unidades vuelven a IQT-Port.`)) return;
    const j = await post({ action: "unload", nave: c.nave, guia: g.guia });
    if (j) { toast.success(`Guía ${g.guia} sacada de ${c.nave}`); setReload((x) => x + 1); }
  }

  async function sail() {
    if (!sailList.length) return toast.danger("Marca la chata que zarpa");
    setSailing(true);
    const j = await post({ action: "sail", naves: sailList.map((c) => c.nave), date: sailDate, lateReason: sailNeed ? sailReason : undefined });
    setSailing(false);
    if (!j) return;
    toast.success(`Zarpe registrado: ${sailList.map((c) => c.nave).join(", ")}`, { description: `${n(j.units)} unidades → Tránsito fluvial a Yurimaguas`, timeout: 7000 });
    setChecked(new Set()); setSailReason(""); setReload((x) => x + 1);
  }

  if (!data) return <div className="flex flex-col gap-4 p-1">{[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-3xl bg-sb-surface-container-low" />)}</div>;
  const loadingNames = data.loading.map((c) => c.nave);
  const chips = [...loadingNames, ...data.chatas.filter((c) => !loadingNames.includes(c))];

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="YUR · Carga a chata" sub="En Yurimaguas no hay contenedores: las motos van sueltas en la chata. 1. Elige la chata y agrega sus guías. 2. Cuando completó su carga, márcala y registra el zarpe." />

      <PendingGuias site="YUR" inBox={guias.map((g) => g.guia)} canEmbark={data.canLoad} onAdd={(g) => addGuia(g)} onChanged={() => setReload((x) => x + 1)} />

      {/* 1. Carga */}
      <Card className="scroll-mt-4 overflow-hidden">
        <div ref={formRef} id="cargar">
          <Head icon={Package} title="1. Carga a la chata"
            sub={guias.length ? `${plural(guias.length, ["guía", "guías"])} · ${n(tot.total)} motos${nave.trim() ? ` para ${nave.trim().toUpperCase()}` : ""}` : "Elige la chata y súmale las guías que suben"} />
        </div>
        <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-2">
              <p className="px-1 text-[11px] font-medium text-sb-on-surface-variant">Chata</p>
              <div className="flex flex-wrap gap-1.5">
                {chips.slice(0, 16).map((c) => {
                  const on = c === nave.toUpperCase(), busy = data.loading.find((x) => x.nave === c);
                  return (
                    <button key={c} type="button" onClick={() => setNave(c)} disabled={!data.canLoad} aria-pressed={on}
                      className={cn("sb-pill flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-50",
                        on ? "bg-sb-primary text-sb-on-primary" : "bg-sb-surface-container-low text-sb-on-surface-variant hover:bg-sb-surface-container hover:text-sb-on-surface")}>
                      <Ship className="h-3.5 w-3.5" />{c.replace("EDUARDO ", "E-")}
                      {busy && <span className={cn("rounded-full px-1.5 text-[10px] font-semibold tabular-nums", on ? "bg-white/20" : "bg-sb-primary-soft text-sb-primary")}>{n(busy.total)}</span>}
                    </button>
                  );
                })}
              </div>
              <input className={cn(field, "uppercase")} placeholder="Otra chata (escríbela)" value={nave} onChange={(e) => setNave(e.target.value)} disabled={!data.canLoad} autoCapitalize="characters" />
            </div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addGuia(); }}>
              <SuggestInput inputClassName={field} mono placeholder="Buscar guía…" value={input} onChange={setInput} ariaLabel="Guía de remisión" disabled={!data.canLoad}
                onPick={(v) => { setInput(v); addGuia(v); }} onEnter={() => addGuia()}
                source={(q) => `/api/suggest?${new URLSearchParams({ kind: "guia", site: "YUR", step: "d_carga", q })}`} />
              <Button type="submit" variant="primary" className="shrink-0 rounded-full" isDisabled={adding || !input.trim() || !data.canLoad} aria-label="Agregar guía">
                <Plus className="h-4 w-4" /><span className="hidden sm:inline">{adding ? "Buscando…" : "Agregar"}</span>
              </Button>
            </form>
            <PickList title={guias.length ? "Guías que suben a la chata" : "Carga vacía"} loading={false}
              empty={guias.length ? null : "Agrega las guías que suben a la chata, de la lista de arriba o buscándolas."}>
              <AnimatePresence initial={false}>
                {guias.map((g) => (
                  <motion.div key={g.guia} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 16, transition: { duration: 0.15 } }} transition={{ duration: 0.3, ease: EASE }}>
                    <GuiaRow guia={g.guia} district={g.district} dealer={g.dealer} w2={g.w2} w3={g.w3} total={g.total} late={g.need} onRemove={() => setGuias((x) => x.filter((y) => y.guia !== g.guia))} />
                  </motion.div>
                ))}
              </AnimatePresence>
              {guias.length > 1 && <TotalRow label="Total de la carga" count={guias.length} w2={tot.w2} w3={tot.w3} total={tot.total} />}
            </PickList>
          </div>
          <Register from="IQT-Port" to="Embarque" label="Carga" noun={["guía", "guías"]} title="Sube a la chata" hint="Agrega guías a la carga"
            action={nave.trim() ? `Cargar a ${nave.trim().toUpperCase()}` : "Cargar a la chata"}
            date={date} setDate={setDate} min="" need={tot.need} reason={reason} setReason={setReason} count={guias.length} units={tot.total}
            busy={saving} disabled={!guias.length || !nave.trim()} readOnly={!data.canLoad} readOnlyText="Solo lectura: la carga no es tu etapa." onSave={loadChata}>
            {nave.trim() && (
              <div className="rounded-xl bg-sb-surface px-3 py-2.5 text-xs">
                <p className="font-semibold">{nave.toUpperCase()}</p>
                <p className="text-[11px] text-sb-on-surface-variant">{onBoard ? `Ya lleva ${n(onBoard.total)} motos` : "Vacía"}{tot.total ? ` · con esta carga ${n((onBoard?.total ?? 0) + tot.total)}` : ""}</p>
                {/* La chata en 3D: se llena con lo que ya lleva más esta carga */}
                <CargoFigure kind="barge" units={(onBoard?.total ?? 0) + tot.total} className="-mx-1 mt-1" title={`${nave} con ${(onBoard?.total ?? 0) + tot.total} motos`} />
                <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-sb-surface-container">
                  <span className="bg-sb-primary/40 transition-[width] duration-500" style={{ width: `${Math.min(100, ((onBoard?.total ?? 0) / TYPICAL) * 100)}%` }} />
                  <span className="bg-sb-primary transition-[width] duration-500" style={{ width: `${Math.min(100, (tot.total / TYPICAL) * 100)}%` }} />
                </span>
                <p className="mt-1 text-[10px] text-sb-on-surface-variant">Una chata lleva normalmente unas {TYPICAL} motos.</p>
              </div>
            )}
          </Register>
        </div>
      </Card>

      {/* 2. Zarpe */}
      <Card className="overflow-hidden">
        <Head icon={Ship} title="2. Zarpe · chatas cargando"
          sub={data.loading.length ? `${plural(data.loading.length, ["chata", "chatas"])} en el puerto · ${n(data.loading.reduce((t, c) => t + Number(c.total), 0))} motos a bordo` : "Ninguna chata cargando"} />
        <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <PickList title="Marca la chata que completó su carga y zarpa" loading={false} all={["Marcar todas", "Quitar todas"]}
            canAll={data.loading.length > 1 && data.canSail} allOn={data.loading.length > 0 && data.loading.every((c) => checked.has(c.nave))}
            onAll={() => setChecked((st) => (data.loading.every((c) => st.has(c.nave)) ? new Set() : new Set(data.loading.map((c) => c.nave))))}
            empty={data.loading.length ? null : "No hay chatas cargando. Registra una carga arriba."}>
            {data.loading.map((c) => {
              const isOpen = open.has(c.nave);
              return (
                <div key={c.nave}>
                  <PickRow on={checked.has(c.nave)} disabled={!data.canSail} label={`Marcar zarpe de ${c.nave}`}
                    onToggle={() => setChecked((st) => { const y = new Set(st); if (y.has(c.nave)) y.delete(c.nave); else y.add(c.nave); return y; })}
                    title={c.nave} meta={`${plural(c.guias.length, ["guía", "guías"])} · carga ${fmtDate(c.first)}${c.last !== c.first ? ` – ${fmtDate(c.last)}` : ""}`}
                    late={c.need} w2={c.w2} w3={c.w3} total={c.total}
                    aside={
                      <button type="button" onClick={() => setOpen((st) => { const y = new Set(st); if (y.has(c.nave)) y.delete(c.nave); else y.add(c.nave); return y; })}
                        aria-expanded={isOpen} aria-label={`Ver guías de ${c.nave}`} className="sb-pill-icon grid h-8 w-8 place-items-center rounded-full bg-sb-surface text-sb-on-surface-variant shadow-sm ring-1 ring-sb-outline-variant/50 hover:text-sb-on-surface">
                        <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", isOpen && "rotate-180")} />
                      </button>
                    } />
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}
                        className="ml-11 mr-2 overflow-hidden border-l-2 border-sb-outline-variant/40">
                        {c.guias.map((g) => (
                          <li key={g.guia ?? "-"} className="flex items-center gap-3 py-2 pl-3 pr-1 text-xs">
                            <span className="min-w-0 flex-1">
                              <span className="block font-mono font-semibold">{g.guia ?? "(sin guía)"}</span>
                              <span className="block truncate text-[11px] text-sb-on-surface-variant">{g.district} · {g.dealer}</span>
                            </span>
                            <span className="shrink-0 text-right">
                              <b className="block tabular-nums">{n(g.total)}</b>
                              <span className="block text-[10px] text-sb-on-surface-variant tabular-nums">2W {n(g.w2)} · 3W {n(g.w3)}</span>
                            </span>
                            {data.canLoad && <button type="button" onClick={() => unload(c, g)} className="sb-pill-sm shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-sb-late hover:bg-sb-late-soft">Sacar</button>}
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </PickList>
          <Register from="Embarque" to="Tránsito fluvial" label="Zarpe" noun={["chata", "chatas"]} date={sailDate} setDate={setSailDate} min={sailMin}
            need={sailNeed} reason={sailReason} setReason={setSailReason} count={sailList.length} units={sailList.reduce((t, c) => t + Number(c.total), 0)}
            busy={sailing} disabled={!sailList.length} readOnly={!data.canSail} readOnlyText="Solo lectura: el zarpe no es tu etapa." onSave={sail} />
        </div>
      </Card>

      {/* Celular: la carga que se está armando, siempre a mano */}
      <AnimatePresence>
        {guias.length > 0 && !formSeen && (
          <motion.button type="button" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            onClick={() => document.getElementById("cargar")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="fixed inset-x-3 z-40 flex items-center gap-3 rounded-2xl bg-sb-on-surface px-4 py-3 text-left text-sb-surface shadow-2xl sm:hidden"
            style={{ bottom: "calc(6.25rem + env(safe-area-inset-bottom))" }}>
            <Package className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1 text-[13px] leading-tight"><b>Carga en armado{nave ? ` · ${nave.toUpperCase()}` : ""}</b>
              <span className="block truncate text-[11px] opacity-75">{guias.length} guía(s) · {n(tot.total)} unid. · {unitsText(tot.w2, tot.w3)}</span></span>
            <span className="shrink-0 rounded-full bg-sb-primary px-3 py-1.5 text-[12px] font-semibold text-sb-on-primary">Cargar</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
