"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, toast } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown, Package, Plus, Ship, X } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { DatePicker, pastQuick } from "@/components/modal/DatePicker";
import { SuggestInput } from "@/components/SuggestInput";
import { PendingGuias } from "@/components/embarque/PendingGuias";
import { DATA_EVENT } from "@/components/UploadCenter";
import { DELAY_REASONS, fmtDate, unitsText } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { cn } from "@/lib/cn";
import { CargoFigure } from "@/components/figures/cargo/CargoFigure";
import { SoftSelect } from "@/components/SoftSelect";

/**
 * YUR · Carga a chata (Iquitos). En Yurimaguas no hay contenedores: las motos van sueltas en la chata.
 * 1. Se elige la chata (EDUARDO…) y se le agregan guías → sus unidades pasan de IQT-Port a «Embarque».
 * 2. Cuando la chata completó su carga se marca y se registra el zarpe → «Tránsito fluvial» hacia Yurimaguas.
 */

type G = { guia: string; district: string; dealer: string; w2: number; w3: number; total: number; need: number; skipped: number };
type Loaded = { guia: string | null; dealer: string | null; district: string | null; route: string | null; w2: number; w3: number; total: number; loaded: string; need: number };
type Chata = { nave: string; w2: number; w3: number; total: number; need: number; first: string; last: string; guias: Loaded[] };
type Data = { canLoad: boolean; canSail: boolean; chatas: string[]; loading: Chata[] };

const field = "h-10 w-full rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-on-surface";
const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");
/** Carga normal de una chata en esta ruta (historial): unas 270 unidades */
const TYPICAL = 270;

function Change({ from, to }: { from: string; to: string }) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant">Cambia de estado</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-sb-outline-variant px-3 py-1 font-semibold">{from}</span>
        <ArrowRight className="h-3.5 w-3.5 text-sb-on-surface-variant" />
        <span className="rounded-full bg-sb-primary px-3 py-1 font-semibold text-sb-on-primary">{to}</span>
      </span>
    </div>
  );
}

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

  if (!data) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  const loadingNames = data.loading.map((c) => c.nave);
  const chips = [...loadingNames, ...data.chatas.filter((c) => !loadingNames.includes(c))];

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="YUR · Carga a chata" sub="En Yurimaguas no hay contenedores: las motos van sueltas en la chata. 1. Elige la chata y agrega sus guías. 2. Cuando completó su carga, márcala y registra el zarpe." />

      <PendingGuias site="YUR" inBox={guias.map((g) => g.guia)} canEmbark={data.canLoad} onAdd={(g) => addGuia(g)} onChanged={() => setReload((x) => x + 1)} />

      {/* 1. Carga */}
      <Card className="scroll-mt-4 overflow-hidden">
        <div ref={formRef} id="cargar" className="border-b border-sb-outline-variant/40 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4" /> 1. Carga a la chata</h3>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_18rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-1.5 text-[11px] text-sb-on-surface-variant">Chata
              <div className="flex flex-wrap gap-1.5">
                {chips.slice(0, 16).map((c) => {
                  const on = c === nave.toUpperCase(), busy = data.loading.find((x) => x.nave === c);
                  return (
                    <button key={c} type="button" onClick={() => setNave(c)} disabled={!data.canLoad} className={cn("sbf-chip", on && "active")}>
                      <Ship className="h-3 w-3" />{c.replace("EDUARDO ", "E-")}{busy && <span className="rounded-full bg-sb-surface-container-high px-1.5 text-[10px] text-sb-on-surface">{n(busy.total)}</span>}
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
            <div className="flex flex-col rounded-xl border border-sb-outline-variant/40">
              {!guias.length && <p className="px-3 py-6 text-center text-xs text-sb-on-surface-variant">Agrega las guías que suben a la chata (de la lista de arriba o buscándolas).</p>}
              <AnimatePresence initial={false}>
                {guias.map((g) => (
                  <motion.div key={g.guia} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                    className="flex items-center gap-2 border-b border-sb-outline-variant/20 px-3 py-2.5 text-xs last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono font-semibold">{g.guia}</p>
                      <p className="truncate text-[11px] text-sb-on-surface-variant">{g.dealer} · {g.district}</p>
                    </div>
                    <span className="shrink-0 text-right tabular-nums"><b>{g.total}</b><span className="block text-[10px] text-sb-on-surface-variant">{unitsText(g.w2, g.w3)}</span></span>
                    <button type="button" onClick={() => setGuias((x) => x.filter((y) => y.guia !== g.guia))} aria-label={`Quitar ${g.guia}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sb-on-surface-variant hover:bg-sb-surface-container hover:text-sb-late"><X className="h-4 w-4" /></button>
                  </motion.div>
                ))}
              </AnimatePresence>
              {guias.length > 0 && <p className="flex justify-between border-t border-sb-outline-variant/40 px-3 py-2 text-xs font-bold"><span>{guias.length} guía(s)</span><span>{n(tot.total)} unid. · {unitsText(tot.w2, tot.w3)}</span></p>}
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-sb-outline-variant/40 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <Change from="IQT-Port" to="Embarque" />
            {nave && (
              <div className="rounded-[18px] bg-sb-surface-container-low px-3 py-2 text-xs">
                <p className="font-semibold">{nave.toUpperCase()}</p>
                <p className="text-sb-on-surface-variant">{onBoard ? `Ya lleva ${n(onBoard.total)} unid.` : "Vacía"}{tot.total ? ` · con esta carga: ${n((onBoard?.total ?? 0) + tot.total)}` : ""}</p>
                {/* La chata en 3D: se llena con lo que ya lleva más esta carga */}
                <CargoFigure kind="barge" units={(onBoard?.total ?? 0) + tot.total} className="-mx-1 mt-1" title={`${nave} con ${(onBoard?.total ?? 0) + tot.total} motos`} />
                <p className="mt-1 text-[10px] text-sb-on-surface-variant">Una chata lleva normalmente unas {TYPICAL} unidades.</p>
              </div>
            )}
            <div className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Fecha de carga
              <DatePicker label="Fecha de carga" value={date} onChange={setDate} disabled={!data.canLoad} quick={pastQuick(null, today())} />
            </div>
            {tot.need > 0 && (
              <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Motivo de demora ({tot.need} fuera de tiempo · puedes dejarlo para después)
                <SoftSelect className={field} value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Elegir…</option>{DELAY_REASONS.map((r) => <option key={r}>{r}</option>)}</SoftSelect>
              </label>
            )}
            <Button variant="primary" className="w-full rounded-full lg:w-auto" onPress={loadChata} isDisabled={saving || !guias.length || !nave.trim() || !data.canLoad}>
              {saving ? "Registrando…" : nave ? `Cargar a ${nave.toUpperCase()}` : "Cargar a la chata"}
            </Button>
            {!data.canLoad && <p className="text-[11px] text-sb-on-surface-variant">Solo lectura: la carga no es tu etapa.</p>}
          </div>
        </div>
      </Card>

      {/* 2. Zarpe */}
      <Card className="overflow-hidden">
        <div className="border-b border-sb-outline-variant/40 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Ship className="h-4 w-4" /> 2. Zarpe · chatas cargando</h3>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_18rem]">
          <div className="flex flex-col rounded-xl border border-sb-outline-variant/40">
            {!data.loading.length && <p className="px-3 py-6 text-center text-xs text-sb-on-surface-variant">No hay chatas cargando. Registra una carga arriba.</p>}
            {data.loading.map((c) => {
              const on = checked.has(c.nave), isOpen = open.has(c.nave);
              return (
                <div key={c.nave} className={cn("border-b border-sb-outline-variant/20 last:border-0", on && "bg-sb-primary-soft")}>
                  <div className="flex items-center gap-3 px-3 py-3 text-xs">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input type="checkbox" className="h-6 w-6 shrink-0 accent-[var(--sb-primary)]" checked={on} disabled={!data.canSail} aria-label={`Marcar zarpe de ${c.nave}`}
                        onChange={() => setChecked((st) => { const y = new Set(st); if (y.has(c.nave)) y.delete(c.nave); else y.add(c.nave); return y; })} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold">{c.nave}{on && <span className="rounded-full bg-sb-primary px-2 py-0.5 text-[10px] text-sb-on-primary">Zarpa</span>}</span>
                        <span className="block text-[11px] text-sb-on-surface-variant">{c.guias.length} guía(s) · {n(c.total)} unid. · {unitsText(c.w2, c.w3)}</span>
                        <span className="block text-[10px] text-sb-on-surface-variant">carga {fmtDate(c.first)}{c.last !== c.first ? ` – ${fmtDate(c.last)}` : ""}{c.need ? ` · ${c.need} tarde` : ""}</span>
                      </span>
                    </label>
                    <button type="button" onClick={() => setOpen((st) => { const y = new Set(st); if (y.has(c.nave)) y.delete(c.nave); else y.add(c.nave); return y; })}
                      aria-expanded={isOpen} aria-label={`Ver guías de ${c.nave}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sb-surface-container hover:bg-sb-surface-container-high">
                      <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                    </button>
                  </div>
                  {isOpen && (
                    <ul className="border-t border-sb-outline-variant/20 bg-sb-surface-container-low/50">
                      {c.guias.map((g) => (
                        <li key={g.guia ?? "-"} className="flex items-center gap-2 border-b border-sb-outline-variant/15 px-3 py-2 text-xs last:border-0">
                          <span className="min-w-0 flex-1">
                            <span className="block font-mono font-semibold">{g.guia ?? "(sin guía)"}</span>
                            <span className="block truncate text-[11px] text-sb-on-surface-variant">{g.dealer} · {g.district}</span>
                          </span>
                          <span className="shrink-0 text-right tabular-nums"><b>{g.total}</b><span className="block text-[10px] text-sb-on-surface-variant">{unitsText(g.w2, g.w3)}</span></span>
                          {data.canLoad && <button type="button" onClick={() => unload(c, g)} className="shrink-0 rounded-full px-2 py-1 text-[11px] text-sb-late hover:bg-sb-late-soft">Sacar</button>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-3 border-t border-sb-outline-variant/40 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <Change from="Embarque" to="Tránsito fluvial" />
            <div className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Fecha de zarpe
              <DatePicker label="Fecha de zarpe" value={sailDate} min={sailMin || null} onChange={setSailDate} disabled={!data.canSail} quick={pastQuick(sailMin || null, today())} />
            </div>
            {sailNeed > 0 && (
              <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Motivo de demora ({sailNeed} fuera de tiempo · puedes dejarlo para después)
                <SoftSelect className={field} value={sailReason} onChange={(e) => setSailReason(e.target.value)}><option value="">Elegir…</option>{DELAY_REASONS.map((r) => <option key={r}>{r}</option>)}</SoftSelect>
              </label>
            )}
            <Button variant="primary" className="w-full rounded-full lg:w-auto" onPress={sail} isDisabled={sailing || !sailList.length || !data.canSail}>
              {sailing ? "Registrando…" : sailList.length ? `Registrar zarpe (${sailList.length})` : "Registrar zarpe"}
            </Button>
            <p className="text-[11px] text-sb-on-surface-variant">{sailList.length ? `${n(sailList.reduce((t, c) => t + c.total, 0))} unidades salen por río a Yurimaguas (unos 5 días).` : "Marca la chata que zarpa para registrar su zarpe."}</p>
          </div>
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
