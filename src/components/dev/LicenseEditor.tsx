"use client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import { Button, Modal } from "@heroui/react";
import { AlertTriangle, CalendarDays, Check, Infinity as InfinityIcon, Minus, Plus, Sparkles, Users } from "lucide-react";
import { Calendar, addMonths, daysBetween, fmtISO, humanDate, parseISO, todayLima } from "@/components/modal/Calendar";
import { cn } from "@/lib/cn";

/** Lo que se guarda */
export type LicenseForm = { plan: string; expiresAt: string; maxUsers: string; note: string };

const PLANS = [
  { key: "Prueba", desc: "Para probar el sistema unas semanas" },
  { key: "Estándar", desc: "Operación normal de la empresa" },
  { key: "Profesional", desc: "Más cuentas y consorcios" },
  { key: "Empresarial", desc: "Grupo grande, sin límites" },
];
const WARN_DAYS = 15;
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = fmtISO;
const parse = parseISO;
const human = (v: string) => humanDate(v);

function Count({ value }: { value: number }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString("es-PE"));
  useEffect(() => { const c = animate(mv, value, { duration: 0.5, ease: [0.32, 0.72, 0, 1] }); return () => c.stop(); }, [mv, value]);
  return <motion.span>{text}</motion.span>;
}

/** Línea de tiempo: hoy → aviso → vencimiento */
function Timeline({ value }: { value: string }) {
  const today = todayLima();
  if (!value) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-sb-surface-container-low px-4 py-3 text-xs text-sb-on-surface-variant">
        <InfinityIcon className="h-4 w-4" /> Sin vencimiento: la licencia sigue activa hasta que la suspendas.
      </div>
    );
  }
  const end = parse(value);
  const total = Math.max(1, daysBetween(today, end));
  const warnPct = Math.min(100, (WARN_DAYS / total) * 100);
  return (
    <div className="rounded-2xl bg-sb-surface-container-low px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between text-xs">
        <span className="text-sb-on-surface-variant">Hoy</span>
        <span><b className="text-base"><Count value={total} /></b> días de licencia</span>
        <span className="text-sb-on-surface-variant">{end.getDate()}/{pad(end.getMonth() + 1)}/{end.getFullYear()}</span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-sb-surface-container-high">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-sb-primary" initial={false} animate={{ width: `${100 - warnPct}%` }} transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }} />
        <motion.div className="absolute inset-y-0 right-0 bg-amber-500/70" initial={false} animate={{ width: `${warnPct}%` }} transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }} />
      </div>
      <p className="mt-2 text-[11px] text-sb-on-surface-variant">
        {total <= WARN_DAYS ? <span className="font-medium text-amber-600 dark:text-amber-400"><AlertTriangle className="mr-1 inline h-3 w-3" />La empresa verá el aviso de vencimiento desde ya.</span>
          : <>Desde el {(() => { const w = new Date(end.getFullYear(), end.getMonth(), end.getDate() - WARN_DAYS); return `${w.getDate()}/${pad(w.getMonth() + 1)}`; })()} la empresa ve el aviso. El {end.getDate()}/{pad(end.getMonth() + 1)} nadie entra hasta renovarla.</>}
      </p>
    </div>
  );
}

/** Cupo de cuentas: barra con las cuentas de hoy frente al máximo elegido */
function Seats({ used, value, onChange }: { used: number; value: string; onChange: (v: string) => void }) {
  const unlimited = value === "";
  const max = unlimited ? 0 : Number(value);
  const top = Math.max(used * 2, max + 10, 20);
  const set = (n: number) => onChange(String(Math.max(1, Math.round(n))));
  const short = !unlimited && max < used;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex rounded-full bg-sb-surface-container-high p-1 text-xs font-medium">
        {[{ k: true, l: "Sin límite" }, { k: false, l: "Con máximo" }].map((o) => (
          <button key={o.l} type="button" onClick={() => onChange(o.k ? "" : String(Math.max(used, 1)))} className="relative flex-1 rounded-full py-1.5">
            {unlimited === o.k && <motion.span layoutId="lic-seat-mode" className="absolute inset-0 rounded-full bg-sb-surface shadow" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span className="relative z-10">{o.l}</span>
          </button>
        ))}
      </div>
      <AnimatePresence initial={false} mode="wait">
        {unlimited ? (
          <motion.p key="u" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex items-center gap-2 rounded-2xl bg-sb-surface-container-low px-4 py-3 text-xs text-sb-on-surface-variant">
            <Users className="h-4 w-4" /> Puede crear todas las cuentas que necesite. Hoy tiene <b className="text-sb-on-surface">{used}</b>.
          </motion.p>
        ) : (
          <motion.div key="m" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Menos cuentas" onClick={() => set(max - 1)} className="grid h-9 w-9 place-items-center rounded-full border border-sb-outline-variant transition-colors hover:bg-sb-surface-container-high"><Minus className="h-4 w-4" /></button>
              <div className="flex-1 text-center">
                <b className="text-3xl font-bold tracking-tight"><Count value={max} /></b>
                <p className="text-[11px] text-sb-on-surface-variant">cuentas como máximo</p>
              </div>
              <button type="button" aria-label="Más cuentas" onClick={() => set(max + 1)} className="grid h-9 w-9 place-items-center rounded-full border border-sb-outline-variant transition-colors hover:bg-sb-surface-container-high"><Plus className="h-4 w-4" /></button>
            </div>
            <input type="range" min={1} max={top} value={max} onChange={(e) => set(Number(e.target.value))} aria-label="Máximo de cuentas" className="w-full accent-[var(--sb-primary)]" />
            {/* Ocupación: cuentas de hoy sobre el máximo */}
            <div>
              <div className="relative h-3 overflow-hidden rounded-full bg-sb-surface-container-high">
                <motion.div className={cn("absolute inset-y-0 left-0 rounded-full", short ? "bg-sb-late" : used / max >= 0.85 ? "bg-amber-500" : "bg-sb-primary")}
                  initial={false} animate={{ width: `${Math.min(100, (used / Math.max(1, max)) * 100)}%` }} transition={{ duration: 0.4 }} />
              </div>
              <p className={cn("mt-1.5 text-[11px]", short ? "font-medium text-sb-late" : "text-sb-on-surface-variant")}>
                {short ? <><AlertTriangle className="mr-1 inline h-3 w-3" />Ya tiene {used} cuentas: no podrá crear nuevas hasta tener menos de {max}.</>
                  : <>{used} en uso · quedan <b className="text-sb-on-surface">{max - used}</b> libres</>}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[{ l: `Justo (${used})`, n: used }, { l: "+10", n: used + 10 }, { l: "+25", n: used + 25 }, { l: "+50", n: used + 50 }].map((c) => (
                <button key={c.l} type="button" onClick={() => set(c.n)} className={cn("rounded-full border px-3 py-1 text-[11px] font-medium transition-colors", max === c.n ? "border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant hover:bg-sb-surface-container-high")}>{c.l}</button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Modal para editar la licencia: plan, vencimiento en calendario, cupo de cuentas y nota, con resumen en vivo */
export function LicenseEditor({ open, company, used, initial, busy, onCancel, onSave }: {
  open: boolean; company: string; used: number; initial: LicenseForm; busy: boolean; onCancel: () => void; onSave: (f: LicenseForm) => void;
}) {
  const [f, setF] = useState<LicenseForm>(initial);
  const today = todayLima();
  const quick = useMemo(() => [
    { l: "+1 mes", v: fmt(addMonths(today, 1)) }, { l: "+3 meses", v: fmt(addMonths(today, 3)) },
    { l: "+6 meses", v: fmt(addMonths(today, 6)) }, { l: "+1 año", v: fmt(addMonths(today, 12)) },
  ], [today]);
  const days = f.expiresAt ? daysBetween(today, parse(f.expiresAt)) : null;

  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={(o) => !o && !busy && onCancel()}>
        <Modal.Container size="lg">
          <Modal.Dialog className="w-full sm:max-w-[920px]">
            <Modal.CloseTrigger aria-label="Cerrar" />
            <Modal.Header className="flex flex-row items-center gap-3 pr-10">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-sb-primary text-sb-on-primary"><CalendarDays className="h-4 w-4" /></span>
              <div>
                <Modal.Heading>Licencia de {company}</Modal.Heading>
                <p className="text-[11px] text-sb-on-surface-variant">Plan, vencimiento y cupo de cuentas. Los cambios aplican al instante.</p>
              </div>
            </Modal.Header>
            <Modal.Body className="grid gap-5 p-1 md:grid-cols-[1fr_1.05fr]">
              <div className="flex flex-col gap-5">
                <section>
                  <h4 className="mb-2 text-xs font-semibold">Plan</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {PLANS.map((p) => {
                      const on = f.plan === p.key;
                      return (
                        <motion.button key={p.key} type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                          onClick={() => setF((x) => ({ ...x, plan: p.key }))}
                          className={cn("relative rounded-2xl border p-3 text-left transition-colors", on ? "border-sb-primary" : "border-sb-outline-variant/60 hover:border-sb-outline")}>
                          {on && <motion.span layoutId="lic-plan" className="absolute inset-0 rounded-2xl bg-sb-primary-soft" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
                          <span className="relative z-10 flex items-center justify-between text-sm font-semibold">{p.key}{on && <Check className="h-4 w-4 text-sb-primary" />}</span>
                          <span className="relative z-10 mt-0.5 block text-[11px] leading-snug text-sb-on-surface-variant">{p.desc}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </section>
                <section>
                  <h4 className="mb-2 text-xs font-semibold">Cupo de cuentas</h4>
                  <Seats used={used} value={f.maxUsers} onChange={(v) => setF((x) => ({ ...x, maxUsers: v }))} />
                  <p className="mt-2 text-[10px] text-sb-on-surface-variant">Cuenta a la empresa, sus consorcios y sus clientes.</p>
                </section>
                <section>
                  <h4 className="mb-2 text-xs font-semibold">Nota</h4>
                  <textarea value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} rows={2} placeholder="Ej. contrato firmado el 01/11, pago anual"
                    className="w-full resize-none rounded-xl border border-sb-outline-variant bg-sb-surface px-3 py-2 text-sm outline-none focus:border-sb-primary" />
                </section>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold">Vencimiento</h4>
                  {days !== null && <span className="text-[11px] text-sb-on-surface-variant">en <b className="text-sb-on-surface"><Count value={days} /></b> días</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {quick.map((q) => (
                    <button key={q.l} type="button" onClick={() => setF((x) => ({ ...x, expiresAt: q.v }))}
                      className={cn("rounded-full border px-3 py-1 text-[11px] font-medium transition-colors", f.expiresAt === q.v ? "border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant hover:bg-sb-surface-container-high")}>{q.l}</button>
                  ))}
                  <button type="button" onClick={() => setF((x) => ({ ...x, expiresAt: "" }))}
                    className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors", !f.expiresAt ? "border-sb-primary bg-sb-primary text-sb-on-primary" : "border-sb-outline-variant hover:bg-sb-surface-container-high")}>
                    <InfinityIcon className="h-3 w-3" /> Sin vencimiento
                  </button>
                </div>
                <Calendar id="lic" key={f.expiresAt ? f.expiresAt.slice(0, 7) : "none"} value={f.expiresAt} onChange={(v) => setF((x) => ({ ...x, expiresAt: v }))}
                  min={fmt(today)} period={fmt(today)} warnDays={WARN_DAYS} />
                <div className="-mt-1 flex flex-wrap gap-3 text-[10px] text-sb-on-surface-variant">
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sb-primary-soft" /> Vigente</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500/25" /> Aviso de {WARN_DAYS} días</span>
                  <span className="flex items-center gap-1"><span className="font-bold underline decoration-2 underline-offset-2">Subrayado</span> = hoy</span>
                </div>
                <Timeline value={f.expiresAt} />
              </div>
            </Modal.Body>
            <Modal.Footer className="flex flex-wrap items-center gap-3">
              <p className="mr-auto flex items-center gap-1.5 text-[11px] text-sb-on-surface-variant">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Plan <b className="text-sb-on-surface">{f.plan || "Estándar"}</b> · {f.expiresAt ? <>vence el <b className="text-sb-on-surface">{human(f.expiresAt)}</b></> : "sin vencimiento"} · {f.maxUsers ? <>hasta <b className="text-sb-on-surface">{f.maxUsers}</b> cuentas</> : "cuentas sin límite"}</span>
              </p>
              <Button variant="secondary" className="rounded-full" isDisabled={busy} onPress={onCancel}>Cancelar</Button>
              <Button className="rounded-full" isDisabled={busy} onPress={() => onSave(f)}>{busy ? "Guardando…" : "Guardar licencia"}</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
