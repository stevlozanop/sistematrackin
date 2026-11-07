"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, toast } from "@heroui/react";
import { ArrowDown, Box, Ship, Warehouse } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { DatePicker, pastQuick } from "@/components/modal/DatePicker";
import { DATA_EVENT } from "@/components/UploadCenter";
import { DELAY_REASONS, SITE_INFO, fmtDate, type Site } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { cn } from "@/lib/cn";

/**
 * Arribo e ingreso a almacén en destino (pasos 3 y 4), con el mismo diseño que Embarque y zarpe:
 * 3. Arribo: se marcan las naves que llegaron y se registra la fecha → «Arribo puerto».
 * 4. Ingreso a almacén: se elige la nave y se marcan sus contenedores → «En almacén».
 */

type Nave = { nave: string; containers: number; w2: number; w3: number; total: number; sailed: string; need: number };
type Cont = { nave: string; container: string; w2: number; w3: number; total: number; arrived: string; need: number; guias: number };
type Data = { site: Site; canArrive: boolean; canStore: boolean; naves: Nave[]; port: Cont[]; error?: string };
type Tab = "arribo" | "almacen";

const field = "h-10 w-full rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-on-surface";
const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");
const key = (c: { nave: string; container: string }) => `${c.nave}|${c.container}`;

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

/** Panel de la derecha: estado → siguiente, fecha, motivo de demora y botón */
function Register({ from, to, label, date, setDate, min, need, reason, setReason, count, units, busy, disabled, readOnly, onSave }: {
  from: string; to: string; label: string; date: string; setDate: (v: string) => void; min: string; need: number;
  reason: string; setReason: (v: string) => void; count: number; units: number; busy: boolean; disabled: boolean; readOnly: boolean; onSave: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-sb-outline-variant/40 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
      <StateChange from={from} to={to} />
      <div className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Fecha
        <DatePicker label={`Fecha de ${label.toLowerCase()}`} value={date} min={min || null} onChange={setDate} disabled={readOnly} quick={pastQuick(min || null, today())} />
      </div>
      {need > 0 && (
        <label className="flex flex-col gap-1 text-[11px] text-sb-late">Motivo de demora ({need} fuera de tiempo · puedes dejarlo para después)
          <select className={field} value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Elegir…</option>{DELAY_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
        </label>
      )}
      <Button variant="primary" className="rounded-full" onPress={onSave} isDisabled={busy || disabled || readOnly}>
        {busy ? "Registrando…" : count ? `Registrar ${label.toLowerCase()} (${count})` : `Registrar ${label.toLowerCase()}`}
      </Button>
      {count > 0 && <p className="text-[11px] text-sb-on-surface-variant">{n(units)} unidades pasan a {to}.</p>}
      {readOnly && <p className="text-[11px] text-sb-on-surface-variant">Solo lectura: no es tu etapa.</p>}
    </div>
  );
}

const Check = ({ on, disabled, label, onChange, big }: { on: boolean; disabled: boolean; label: string; onChange: () => void; big?: boolean }) => (
  <input type="checkbox" className={cn("shrink-0 accent-[var(--sb-primary)]", big ? "h-5 w-5" : "h-4 w-4")} aria-label={label} checked={on} disabled={disabled} onChange={onChange} />
);

export default function ArriboPage() {
  const [me, setMe] = useState<{ role: string; stages: { site: Site; field: string }[] } | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const again = () => setReload((x) => x + 1);
    window.addEventListener(DATA_EVENT, again);
    return () => window.removeEventListener(DATA_EVENT, again);
  }, []);
  // 3. Arribo
  const [naveSel, setNaveSel] = useState<Set<string>>(new Set());
  const [arrDate, setArrDate] = useState(today());
  const [arrReason, setArrReason] = useState("");
  // 4. Ingreso a almacén
  const [pickNave, setPickNave] = useState<string | null>(null);
  const [contSel, setContSel] = useState<Set<string>>(new Set());
  const [stoDate, setStoDate] = useState(today());
  const [stoReason, setStoReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/me").then((r) => r.json()).then(setMe); }, []);
  const sites = useMemo<Site[]>(() => {
    if (!me) return [];
    if (me.role !== "operator") return ["PCL", "YUR"];
    return (["PCL", "YUR"] as Site[]).filter((s) => me.stages.some((st) => st.site === s && (st.field === "d_arribo" || st.field === "d_almacen")));
  }, [me]);
  const current = site ?? sites[0] ?? null;
  const mine = (f: string) => me?.role !== "operator" || me.stages.some((st) => st.site === current && st.field === f);
  const tabs = ([["arribo", "3. Arribo", "d_arribo"], ["almacen", "4. Ingreso a almacén", "d_almacen"]] as const).filter(([, , f]) => mine(f));
  const active: Tab = tab && tabs.some(([k]) => k === tab) ? tab : (tabs[0]?.[0] ?? "arribo");

  useEffect(() => {
    if (!current) return;
    let alive = true;
    fetch(`/api/arribo?site=${current}`).then((r) => r.json()).then((d: Data) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [current, reload]);

  const naves = data?.naves ?? [];
  const port = data?.port ?? [];
  const portNaves = [...new Map(port.map((c) => [c.nave, c.nave])).keys()];
  const curNave = pickNave && portNaves.includes(pickNave) ? pickNave : portNaves[0] ?? null;
  const conts = port.filter((c) => c.nave === curNave);

  const chosenNaves = naves.filter((x) => naveSel.has(x.nave));
  const arrNeed = chosenNaves.reduce((t, x) => t + x.need, 0);
  const arrMin = chosenNaves.reduce((m, x) => (x.sailed > m ? x.sailed : m), "");
  const chosenConts = port.filter((c) => contSel.has(key(c)));
  const stoNeed = chosenConts.reduce((t, x) => t + x.need, 0);
  const stoMin = chosenConts.reduce((m, x) => (x.arrived > m ? x.arrived : m), "");

  const flip = (set: (f: (s: Set<string>) => Set<string>) => void, k: string) => set((s) => { const y = new Set(s); if (y.has(k)) y.delete(k); else y.add(k); return y; });

  async function post(body: object) {
    setBusy(true);
    const r = await fetch("/api/arribo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site: current, ...body }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setBusy(false);
    return { ok: r.ok, j };
  }
  async function arrive() {
    if (!chosenNaves.length) return toast.danger("Marca la nave que llegó");
    if (arrMin && arrDate < arrMin) return toast.danger(`El arribo no puede ser antes del zarpe (${fmtDate(arrMin)})`);
    const { ok, j } = await post({ action: "arrive", naves: chosenNaves.map((x) => x.nave), date: arrDate, lateReason: arrNeed ? arrReason : undefined });
    if (!ok) return toast.danger(j.error);
    toast.success(`Arribo registrado: ${chosenNaves.map((x) => x.nave).join(", ")}`, { description: `${n(j.units)} unidades → Arribo puerto`, timeout: 7000 });
    if (arrNeed && !arrReason) toast.warning(`${arrNeed} unidades quedaron sin motivo de demora`, { description: "Puedes justificarlas después desde PCL/YUR o Alertas", timeout: 8000 });
    setNaveSel(new Set()); setArrReason(""); setReload((x) => x + 1);
  }
  async function store() {
    if (!chosenConts.length) return toast.danger("Marca los contenedores que ingresan al almacén");
    if (stoMin && stoDate < stoMin) return toast.danger(`El ingreso no puede ser antes del arribo (${fmtDate(stoMin)})`);
    const { ok, j } = await post({ action: "store", items: chosenConts.map((c) => ({ nave: c.nave, container: c.container })), date: stoDate, lateReason: stoNeed ? stoReason : undefined });
    if (!ok) return toast.danger(j.error);
    toast.success(`Ingreso a almacén: ${chosenConts.length} contenedor(es)`, { description: `${n(j.units)} unidades → En almacén`, timeout: 7000 });
    if (stoNeed && !stoReason) toast.warning(`${stoNeed} unidades quedaron sin motivo de demora`, { description: "Puedes justificarlas después desde PCL/YUR o Alertas", timeout: 8000 });
    setContSel(new Set()); setStoReason(""); setReload((x) => x + 1);
  }

  if (!me) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  if (!sites.length || !current) return <div className="p-6 text-sm text-sb-on-surface-variant">El arribo y el ingreso a almacén no son etapas asignadas a ti. Pídelas a tu supervisor.</div>;
  const dest = SITE_INFO[current].short;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Arribo e ingreso" sub={`3. Marca las naves que llegaron a ${dest} y registra el arribo. 4. Elige la nave y marca los contenedores que ingresan al almacén.`}>
        {sites.length > 1 && (
          <div className="flex rounded-full bg-sb-surface-container p-1">
            {sites.map((s) => (
              <button key={s} type="button" onClick={() => { setSite(s); setNaveSel(new Set()); setContSel(new Set()); setPickNave(null); }}
                className={cn("rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200", current === s ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
                {SITE_INFO[s].title}
              </button>
            ))}
          </div>
        )}
      </PageTitle>

      {tabs.length > 1 && (
        <div className="flex w-max max-w-full gap-1 overflow-x-auto rounded-full bg-sb-surface-container p-1">
          {tabs.map(([k, l]) => {
            const count = k === "arribo" ? naves.length : port.length;
            return (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={cn("flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-colors", active === k ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
                {l}<span className={cn("rounded-full px-1.5 text-[10px]", active === k ? "bg-white/20" : "bg-sb-surface")}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {active === "arribo" ? (
        <Card className="overflow-hidden">
          <div className="border-b border-sb-outline-variant/40 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Ship className="h-4 w-4" /> 3. Arribo · naves en camino a {dest}</h3>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-[1fr_17rem]">
            <div className="overflow-x-auto rounded-xl border border-sb-outline-variant/40">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead>
                  <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant">
                    <th className="px-3 py-2 font-semibold">Nave</th><th className="px-2 py-2 text-right font-semibold">2W</th><th className="px-2 py-2 text-right font-semibold">3W</th>
                    <th className="px-2 py-2 text-right font-semibold">Total</th><th className="px-3 py-2 text-center font-semibold">Llegó</th>
                  </tr>
                </thead>
                <tbody>
                  {naves.map((x) => {
                    const on = naveSel.has(x.nave);
                    return (
                      <tr key={x.nave} onClick={() => data?.canArrive && flip(setNaveSel, x.nave)}
                        className={cn("cursor-pointer border-b border-sb-outline-variant/20 transition-colors last:border-0", on ? "bg-sb-primary-soft" : "hover:bg-sb-surface-container-low")}>
                        <td className="px-3 py-2.5 font-semibold">{x.nave}
                          <span className="block text-[10px] font-normal text-sb-on-surface-variant">zarpó {fmtDate(x.sailed)} · {x.containers} cont.{x.need ? <b className="text-sb-late"> · {x.need} tarde</b> : null}</span></td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{n(x.w2)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{n(x.w3)}</td>
                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{n(x.total)}</td>
                        <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <Check on={on} disabled={!data?.canArrive} label={`Marcar arribo de ${x.nave}`} onChange={() => flip(setNaveSel, x.nave)} big />
                        </td>
                      </tr>
                    );
                  })}
                  {data && !naves.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-sb-on-surface-variant">No hay naves en camino a {dest}.</td></tr>}
                  {!data && <tr><td colSpan={5} className="px-3 py-8 text-center text-sb-on-surface-variant">Cargando…</td></tr>}
                </tbody>
              </table>
            </div>
            <Register from="Tránsito fluvial" to="Arribo puerto" label="Arribo" date={arrDate} setDate={setArrDate} min={arrMin} need={arrNeed}
              reason={arrReason} setReason={setArrReason} count={chosenNaves.length} units={chosenNaves.reduce((t, x) => t + x.total, 0)}
              busy={busy} disabled={!chosenNaves.length} readOnly={!data?.canArrive} onSave={arrive} />
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-sb-outline-variant/40 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Warehouse className="h-4 w-4" /> 4. Ingreso a almacén · contenedores en el puerto de {dest}</h3>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-[11rem_1fr_17rem]">
            {/* Naves que llegaron */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              <p className="hidden text-[10px] uppercase tracking-wider text-sb-on-surface-variant lg:block">Nave</p>
              {portNaves.map((v) => {
                const cs = port.filter((c) => c.nave === v);
                const marked = cs.filter((c) => contSel.has(key(c))).length;
                return (
                  <button key={v} type="button" onClick={() => setPickNave(v)}
                    className={cn("flex shrink-0 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors",
                      curNave === v ? "border-sb-primary bg-sb-primary-soft font-semibold" : "border-sb-outline-variant/50 hover:bg-sb-surface-container-low")}>
                    <span><span className="block">{v}</span><span className="block text-[10px] font-normal text-sb-on-surface-variant">{cs.length} cont.{marked ? ` · ${marked} marcados` : ""}</span></span>
                    <Ship className="h-3.5 w-3.5 opacity-50" />
                  </button>
                );
              })}
              {data && !portNaves.length && <p className="text-xs text-sb-on-surface-variant">Ninguna nave en el puerto.</p>}
            </div>

            {/* Contenedores de la nave elegida */}
            <div className="overflow-x-auto rounded-xl border border-sb-outline-variant/40">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead>
                  <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant">
                    <th className="px-3 py-2 font-semibold">Contenedor</th><th className="px-2 py-2 text-right font-semibold">2W</th><th className="px-2 py-2 text-right font-semibold">3W</th>
                    <th className="px-2 py-2 text-right font-semibold">Total</th>
                    <th className="px-3 py-2 text-center font-semibold">
                      {conts.length > 1 && data?.canStore ? (
                        <button type="button" className="font-semibold uppercase hover:text-sb-on-surface"
                          onClick={() => setContSel((s) => { const y = new Set(s); const all = conts.every((c) => y.has(key(c))); for (const c of conts) { if (all) y.delete(key(c)); else y.add(key(c)); } return y; })}>
                          Ingresa · todos
                        </button>
                      ) : "Ingresa"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {conts.map((c) => {
                    const k = key(c), on = contSel.has(k);
                    return (
                      <tr key={k} onClick={() => data?.canStore && flip(setContSel, k)}
                        className={cn("cursor-pointer border-b border-sb-outline-variant/20 transition-colors last:border-0", on ? "bg-sb-primary-soft" : "hover:bg-sb-surface-container-low")}>
                        <td className="px-3 py-2.5"><span className="flex items-center gap-1.5 font-mono font-semibold"><Box className="h-3.5 w-3.5 opacity-60" />{c.container}</span>
                          <span className="block text-[10px] text-sb-on-surface-variant">llegó {fmtDate(c.arrived)} · {c.guias} guía(s){c.need ? <b className="text-sb-late"> · {c.need} tarde</b> : null}</span></td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{c.w2 ? n(c.w2) : ""}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{c.w3 ? n(c.w3) : ""}</td>
                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{n(c.total)}</td>
                        <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <Check on={on} disabled={!data?.canStore} label={`Marcar ingreso de ${c.container}`} onChange={() => flip(setContSel, k)} big />
                        </td>
                      </tr>
                    );
                  })}
                  {data && !conts.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-sb-on-surface-variant">No hay contenedores esperando el ingreso a almacén.</td></tr>}
                  {!data && <tr><td colSpan={5} className="px-3 py-8 text-center text-sb-on-surface-variant">Cargando…</td></tr>}
                </tbody>
              </table>
            </div>

            <Register from="Arribo puerto" to="En almacén" label="Ingreso" date={stoDate} setDate={setStoDate} min={stoMin} need={stoNeed}
              reason={stoReason} setReason={setStoReason} count={chosenConts.length} units={chosenConts.reduce((t, x) => t + x.total, 0)}
              busy={busy} disabled={!chosenConts.length} readOnly={!data?.canStore} onSave={store} />
          </div>
        </Card>
      )}
    </div>
  );
}
