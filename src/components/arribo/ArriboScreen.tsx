"use client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@heroui/react";
import { Ship, Warehouse } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { Head, PickList, PickRow, Register, n, plural } from "@/components/stage/StageKit";
import { DATA_EVENT } from "@/components/UploadCenter";
import { SITE_INFO, fmtDate, type Site } from "@/lib/hsp";
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

const key = (c: { nave: string; container: string }) => `${c.nave}|${c.container}`;

export function ArriboScreen({ only }: { only: Site }) {
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
    // Cada ruta en su pantalla: «Arribo e ingreso» (PCL) y «Llegada a Yurimaguas» (YUR)
    if (me.role !== "operator") return [only];
    return ([only] as Site[]).filter((s) => me.stages.some((st) => st.site === s && (st.field === "d_arribo" || st.field === "d_almacen")));
  }, [me, only]);
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
    if (!chosenConts.length) return toast.danger(only === "YUR" ? "Marca la carga que ingresa a ENAPU" : "Marca los contenedores que ingresan al almacén");
    if (stoMin && stoDate < stoMin) return toast.danger(`El ingreso no puede ser antes del arribo (${fmtDate(stoMin)})`);
    const { ok, j } = await post({ action: "store", items: chosenConts.map((c) => ({ nave: c.nave, container: c.container })), date: stoDate, lateReason: stoNeed ? stoReason : undefined });
    if (!ok) return toast.danger(j.error);
    toast.success(only === "YUR" ? "Ingreso a ENAPU registrado" : `Ingreso a almacén: ${chosenConts.length} contenedor(es)`, { description: `${n(j.units)} unidades → En almacén`, timeout: 7000 });
    if (stoNeed && !stoReason) toast.warning(`${stoNeed} unidades quedaron sin motivo de demora`, { description: "Puedes justificarlas después desde PCL/YUR o Alertas", timeout: 8000 });
    setContSel(new Set()); setStoReason(""); setReload((x) => x + 1);
  }

  if (!me) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  if (!sites.length || !current) return <div className="p-6 text-sm text-sb-on-surface-variant">El arribo y el ingreso a almacén no son etapas asignadas a ti. Pídelas a tu supervisor.</div>;
  const dest = SITE_INFO[current].short;
  const yur = only === "YUR";

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title={only === "YUR" ? "YUR · Llegada a Yurimaguas" : "PCL · Arribo e ingreso"}
        sub={only === "YUR"
          ? "3. Marca las chatas que llegaron al puerto de Yurimaguas y registra el arribo. 4. Elige la chata y registra su ingreso a ENAPU (va toda la carga: no hay contenedores)."
          : `3. Marca las naves que llegaron a ${dest} y registra el arribo. 4. Elige la nave y marca los contenedores que ingresan al almacén.`}>
        {sites.length > 1 && (
          <div className="flex rounded-full bg-sb-surface-container p-1">
            {sites.map((s) => (
              <button key={s} type="button" onClick={() => { setSite(s); setNaveSel(new Set()); setContSel(new Set()); setPickNave(null); }}
                className={cn("sb-pill rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200", current === s ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
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
                className={cn("sb-pill [--px:1rem] flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-colors", active === k ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
                {l}<span className={cn("rounded-full px-1.5 text-[10px]", active === k ? "bg-white/20" : "bg-sb-surface")}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {active === "arribo" ? (
        <Card className="overflow-hidden">
          <Head icon={Ship} title={`3. Arribo · naves en camino a ${dest}`}
            sub={data ? (naves.length ? `${plural(naves.length, ["nave", "naves"])} · ${n(naves.reduce((t, x) => t + Number(x.total), 0))} unidades en el río` : "Nada en el río ahora") : "Cargando…"} />
          <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <PickList title="Marca las naves que llegaron" loading={!data} canAll={naves.length > 1 && !!data?.canArrive}
              allOn={naves.length > 0 && naves.every((x) => naveSel.has(x.nave))}
              onAll={() => setNaveSel((s) => (naves.every((x) => s.has(x.nave)) ? new Set() : new Set(naves.map((x) => x.nave))))}
              empty={naves.length ? null : `No hay naves en camino a ${dest}.`}>
              {naves.map((x) => (
                <PickRow key={x.nave} on={naveSel.has(x.nave)} disabled={!data?.canArrive} onToggle={() => flip(setNaveSel, x.nave)}
                  title={x.nave} meta={`zarpó ${fmtDate(x.sailed)} · ${plural(x.containers, ["contenedor", "contenedores"])}`} late={x.need}
                  w2={x.w2} w3={x.w3} total={x.total} label={`Marcar arribo de ${x.nave}`} />
              ))}
            </PickList>
            <Register from="Tránsito fluvial" to="Arribo puerto" label="Arribo" noun={["nave", "naves"]} date={arrDate} setDate={setArrDate} min={arrMin} need={arrNeed}
              reason={arrReason} setReason={setArrReason} count={chosenNaves.length} units={chosenNaves.reduce((t, x) => t + Number(x.total), 0)}
              busy={busy} disabled={!chosenNaves.length} readOnly={!data?.canArrive} onSave={arrive} />
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Head icon={Warehouse} title={only === "YUR" ? "4. Ingreso a ENAPU · carga en el puerto de Yurimaguas" : `4. Ingreso a almacén · contenedores en el puerto de ${dest}`}
            sub={data ? (port.length ? `${plural(portNaves.length, yur ? ["chata", "chatas"] : ["nave", "naves"])} en el puerto · ${yur ? "" : `${plural(port.length, ["contenedor", "contenedores"])} · `}${n(port.reduce((t, c) => t + Number(c.total), 0))} unidades esperando` : "Nada esperando en el puerto") : "Cargando…"} />
          <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[12.5rem_minmax(0,1fr)_18rem]">
            {/* Naves en el puerto */}
            <div className="flex min-w-0 flex-col">
              <p className="hidden px-1 pb-2 text-[11px] font-medium text-sb-on-surface-variant lg:block">{yur ? "Chata" : "Nave"}</p>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible">
                {!data && [0, 1].map((i) => <div key={i} className="h-[58px] w-40 shrink-0 animate-pulse rounded-xl bg-sb-surface-container-low lg:w-auto" />)}
                {portNaves.map((v) => {
                  const cs = port.filter((c) => c.nave === v);
                  const marked = cs.filter((c) => contSel.has(key(c))).length;
                  const sel = curNave === v;
                  return (
                    <button key={v} type="button" onClick={() => setPickNave(v)} aria-pressed={sel}
                      className={cn("flex w-40 shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-200 lg:w-auto",
                        sel ? "bg-sb-primary-soft" : "hover:bg-sb-surface-container-low")}>
                      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors", sel ? "bg-sb-primary text-sb-on-primary" : "bg-sb-surface-container text-sb-on-surface-variant")}>
                        <Ship className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-xs font-semibold", sel && "text-sb-primary")}>{v}</span>
                        <span className="block truncate text-[10px] text-sb-on-surface-variant">
                          {marked ? `${marked} de ${cs.length} marcado${cs.length > 1 ? "s" : ""}` : `${yur ? "" : `${plural(cs.length, ["cont.", "cont."])} · `}${n(cs.reduce((t, c) => t + Number(c.total), 0))} unidades`}
                        </span>
                      </span>
                      {marked > 0 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sb-primary" />}
                    </button>
                  );
                })}
                {data && !portNaves.length && <p className="px-1 text-xs text-sb-on-surface-variant">Ninguna {yur ? "chata" : "nave"} en el puerto.</p>}
              </div>
            </div>

            {/* Contenedores de la nave elegida */}
            <PickList title={curNave ? <>{yur ? "Carga de" : "Contenedores de"} <b className="font-semibold text-sb-on-surface">{curNave}</b> · marca lo que ingresa</> : "Contenedores"}
              loading={!data} canAll={conts.length > 1 && !!data?.canStore} allOn={conts.length > 0 && conts.every((c) => contSel.has(key(c)))}
              onAll={() => setContSel((s) => { const y = new Set(s); const all = conts.every((c) => y.has(key(c))); for (const c of conts) { if (all) y.delete(key(c)); else y.add(key(c)); } return y; })}
              empty={conts.length ? null : yur ? "No hay carga esperando el ingreso a ENAPU." : "No hay contenedores esperando el ingreso a almacén."}>
              {conts.map((c) => {
                const whole = c.container === "(sin contenedor)";
                return (
                  <PickRow key={key(c)} on={contSel.has(key(c))} disabled={!data?.canStore} onToggle={() => flip(setContSel, key(c))}
                    title={whole ? "Toda la carga de la chata" : c.container} mono={!whole}
                    meta={`llegó ${fmtDate(c.arrived)} · ${plural(c.guias, ["guía", "guías"])}`} late={c.need}
                    w2={c.w2} w3={c.w3} total={c.total} label={`Marcar ingreso de ${whole ? `la carga de ${c.nave}` : c.container}`} />
                );
              })}
            </PickList>

            <Register from="Arribo puerto" to="En almacén" label="Ingreso" noun={yur ? ["carga", "cargas"] : ["contenedor", "contenedores"]} date={stoDate} setDate={setStoDate} min={stoMin} need={stoNeed}
              reason={stoReason} setReason={setStoReason} count={chosenConts.length} units={chosenConts.reduce((t, x) => t + Number(x.total), 0)}
              busy={busy} disabled={!chosenConts.length} readOnly={!data?.canStore} onSave={store} />
          </div>
        </Card>
      )}
    </div>
  );
}
