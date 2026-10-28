"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Modal, toast } from "@heroui/react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, MessageCircle, PackageCheck, Search, Truck, X } from "lucide-react";
import { Card, PageTitle, Pill } from "@/components/ui";
import { StatGrid } from "@/components/StatCard";
import { ServiceBadge } from "@/components/Service";
import { ProcessRoute } from "@/components/ProcessRoute";
import { cn } from "@/lib/cn";
import { SITE_INFO, STATUS_LABEL, STATUS_STEP, fmtDate, type DateField, type Service, type Site, type Status } from "@/lib/hsp";

type Unit = {
  id: number; site: Site; chassis: string; motor: string | null; material: string | null; category: string | null; guia: string | null; invoice: string | null;
  billing_date: string | null; status: Status; est_date: string | null; service: Service | null; days_left: number | null; alert: string | null;
  real_days: number | null; lead_time: number | null; via_lima: number; dealer: string | null;
} & Partial<Record<DateField, string | null>>;
type Store = { id: number; name: string; department: string | null; district: string | null; coast: number };
type Data = {
  client: string; stores: Store[]; store: number | null;
  stats: { all: number; open: number; delivered: number; on_time: number; late: number; soon: number; next_eta: string | null };
  total: number; page: number; size: number; units: Unit[];
};

const TABS = [
  { id: "open", label: "En camino" },
  { id: "late", label: "Retrasadas" },
  { id: "delivered", label: "Entregadas" },
  { id: "all", label: "Todas" },
] as const;

/** Texto claro para el dealer: cuándo llega o cuándo llegó. */
function eta(u: Unit) {
  if (u.d_entrega) return { text: `Entregada el ${fmtDate(u.d_entrega)}`, tone: "" };
  if (u.days_left === null || u.days_left === undefined) return { text: "Sin fecha estimada", tone: "" };
  if (u.days_left < 0) return { text: `Retrasada ${-u.days_left} ${u.days_left === -1 ? "día" : "días"} · debía llegar el ${fmtDate(u.est_date)}`, tone: "text-sb-late" };
  if (u.days_left === 0) return { text: "Debe llegar hoy", tone: "font-medium" };
  return { text: `Llega aprox. el ${fmtDate(u.est_date)} (en ${u.days_left} ${u.days_left === 1 ? "día" : "días"})`, tone: "" };
}

/** Mensaje para el comprador final: qué moto es, en qué etapa va y cuándo llega (sin datos internos). */
function statusText(u: Unit) {
  const e = eta(u).text;
  return [
    `Estado de tu moto Honda`,
    `Modelo: ${u.material ?? "—"}`,
    `Chasis: ${u.chassis}${u.motor ? ` · Motor: ${u.motor}` : ""}`,
    u.guia ? `Guía de remisión: ${u.guia}` : "",
    `Etapa: ${STATUS_LABEL[u.status]}`,
    e,
    u.dealer ? `Tienda: ${u.dealer}` : "",
  ].filter(Boolean).join("\n");
}

/** Barra de avance: un segmento por etapa, relleno hasta la etapa actual. */
function Progress({ u }: { u: Unit }) {
  const steps = ["1", "1.1", "2", "3", "4", "5", ...(u.site === "PCL" && (Number(u.via_lima) || u.d_alm_lima) ? ["5.1", "5.2"] : []), "6"];
  const cur = steps.indexOf(STATUS_STEP[u.status]);
  return (
    <div className="flex gap-1" aria-label={`Etapa ${cur + 1} de ${steps.length}`}>
      {steps.map((s, i) => (
        <span key={s} className={cn("h-1.5 flex-1 rounded-full", i <= cur ? (u.d_entrega ? "bg-sb-ontime" : "bg-sb-primary") : "bg-sb-surface-container-highest")} />
      ))}
    </div>
  );
}

export default function PortalPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  // Desde «Mi resumen» se puede llegar con ?tab= y ?q= (ej. buscar la moto que pregunta un comprador)
  const sp = useSearchParams();
  const startTab = TABS.find((x) => x.id === sp.get("tab"))?.id ?? "open";
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>(startTab);
  const [qInput, setQInput] = useState(sp.get("q") ?? "");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [page, setPage] = useState(1);
  const [store, setStore] = useState(0); // 0 = todas sus tiendas
  const [open, setOpen] = useState<Unit | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const url = useMemo(() => `/api/portal?${new URLSearchParams({ tab, q, page: String(page), store: String(store) })}`, [tab, q, page, store]);
  useEffect(() => {
    let alive = true;
    const load = () => fetch(url).then(async (r) => {
      const j = await r.json().catch(() => ({ error: "Error del servidor" }));
      if (!alive) return;
      if (!r.ok) setError(j.error); else { setData(j); setError(""); }
    });
    load();
    const t = setInterval(load, 30_000); // se actualiza solo: así ve cada avance que registran
    return () => { alive = false; clearInterval(t); };
  }, [url]);

  if (error) return <Card className="mt-4 px-5 py-8 text-center text-sm text-sb-on-surface-variant">{error}</Card>;
  if (!data) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando tus unidades…</div>;

  const { client, stores, stats } = data;
  const depts = [...new Set(stores.map((x) => x.department).filter(Boolean))].join(", ");
  const pages = Math.max(1, Math.ceil(data.total / data.size));
  const onTimePct = stats.delivered ? Math.round((100 * stats.on_time) / stats.delivered) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title={client}
        sub={`${stores.length} ${stores.length === 1 ? "tienda" : "tiendas"}${depts ? ` · ${depts}` : ""} · se actualiza solo cada 30 segundos`}
      />

      {stores.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Tiendas">
          <button className={`sbf-chip whitespace-nowrap ${store === 0 ? "active" : ""}`} onClick={() => { setStore(0); setPage(1); }}>Todas mis tiendas</button>
          {stores.map((x) => (
            <button key={x.id} className={`sbf-chip whitespace-nowrap ${store === x.id ? "active" : ""}`} onClick={() => { setStore(x.id); setPage(1); }}>{x.name}</button>
          ))}
        </div>
      )}

      <StatGrid
        className="grid-cols-2 lg:grid-cols-4"
        items={[
          { label: "En camino", value: stats.open.toLocaleString(), icon: Truck, onClick: () => { setTab("open"); setPage(1); }, active: tab === "open" },
          { label: "Retrasadas", value: stats.late.toLocaleString(), icon: AlertTriangle, onClick: () => { setTab("late"); setPage(1); }, active: tab === "late" },
          { label: "Entregadas", value: stats.delivered.toLocaleString(), icon: PackageCheck, onClick: () => { setTab("delivered"); setPage(1); }, active: tab === "delivered" },
          { label: "Entregadas a tiempo", value: onTimePct === null ? "—" : `${onTimePct} %`, icon: CheckCircle2 },
        ]}
      />

      {stats.next_eta && (
        <Card className="flex items-center gap-3 px-4 py-3 text-sm">
          <CalendarClock className="h-4 w-4 shrink-0 text-sb-on-surface-variant" />
          <span>Tu próxima llegada estimada es el <b>{fmtDate(stats.next_eta)}</b>.{stats.soon ? <> {stats.soon} {stats.soon === 1 ? "unidad debe" : "unidades deben"} llegar en los próximos días.</> : null}</span>
        </Card>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex gap-1.5 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} className={`sbf-chip ${tab === t.id ? "active" : ""}`} onClick={() => { setTab(t.id); setPage(1); }}>{t.label}</button>
          ))}
        </div>
        <a href="/api/report" className="sbf-chip flex w-fit items-center gap-1.5 whitespace-nowrap lg:ml-auto" title="Excel con el estado de todas tus unidades">
          <Download className="h-3.5 w-3.5" /> Descargar mis unidades
        </a>
        <label className="sbf-search w-full lg:w-80">
          <Search className="h-4 w-4 opacity-40" />
          <input placeholder="Buscar chasis, motor, modelo, guía…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          {qInput && <button onClick={() => setQInput("")} className="opacity-40 hover:opacity-100" aria-label="Borrar búsqueda"><X className="h-4 w-4" /></button>}
        </label>
      </div>

      {data.units.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {data.units.map((u) => {
            const e = eta(u);
            return (
              <button key={u.id} type="button" onClick={() => setOpen(u)} className="text-left">
                <Card className="flex h-full flex-col gap-3 p-4 transition-colors hover:border-sb-outline-variant">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-semibold">{u.chassis}</p>
                      <p className="truncate text-[11px] text-sb-on-surface-variant">{u.material ?? "—"}{u.category ? ` · ${u.category}` : ""} · {SITE_INFO[u.site].short}</p>
                      {u.guia && <p className="truncate font-mono text-[11px] text-sb-on-surface-variant">Guía {u.guia}</p>}
                      {stores.length > 1 && <p className="truncate text-[11px] font-medium text-sb-on-surface-variant">{u.dealer}</p>}
                    </div>
                    {(u.d_entrega || u.alert === "VENCIDA") && <ServiceBadge s={u.service} size="xs" />}
                  </div>
                  <Progress u={u} />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                    <Pill active={!!u.d_entrega}>{STATUS_LABEL[u.status]}</Pill>
                    <span className={e.tone}>{e.text}</span>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      ) : (
        <Card className="px-5 py-10 text-center text-sm text-sb-on-surface-variant">
          {q ? "No hay unidades con esa búsqueda." : tab === "late" ? "No tienes unidades retrasadas." : tab === "open" ? "No tienes unidades en camino." : "Todavía no hay unidades."}
        </Card>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs">
          <Button isIconOnly size="sm" variant="secondary" className="rounded-full" aria-label="Página anterior" isDisabled={page <= 1} onPress={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span>Página {page} de {pages} · {data.total.toLocaleString()} unidades</span>
          <Button isIconOnly size="sm" variant="secondary" className="rounded-full" aria-label="Página siguiente" isDisabled={page >= pages} onPress={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}

      {/* Detalle de una unidad: recorrido con sus fechas */}
      <Modal>
        <Modal.Backdrop isOpen={!!open} onOpenChange={(o) => !o && setOpen(null)}>
          <Modal.Container size="lg">
            <Modal.Dialog>
              <Modal.CloseTrigger aria-label="Cerrar" />
              {open && (
                <>
                  <Modal.Header className="flex flex-col gap-1">
                    <Modal.Heading className="font-mono">{open.chassis}</Modal.Heading>
                    <p className="text-xs text-sb-on-surface-variant">{open.material ?? "—"} · motor {open.motor ?? "—"} · {SITE_INFO[open.site].title}{open.dealer ? ` · ${open.dealer}` : ""}</p>
                  </Modal.Header>
                  <Modal.Body className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto p-1">
                    <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      {[
                        ["Facturada", fmtDate(open.billing_date) || "—"],
                        ["Fecha estimada", fmtDate(open.est_date) || "—"],
                        ["Plazo", open.lead_time ? `${open.lead_time} días` : "—"],
                        ["Guía de remisión", open.guia ?? "—"],
                      ].map(([k, v]) => (
                        <div key={k}><p className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant/60">{k}</p><p className="font-medium">{v}</p></div>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <ServiceBadge s={open.service} />
                      <span className={eta(open).tone}>{eta(open).text}</span>
                    </div>
                    <ProcessRoute
                      site={open.site}
                      current={STATUS_STEP[open.status]}
                      dates={open}
                      viaLima={open.site === "PCL" ? !!Number(open.via_lima) || !!open.d_alm_lima || !!open.d_sal_lima : undefined}
                    />
                  </Modal.Body>
                  <Modal.Footer className="flex flex-wrap justify-between gap-2">
                    {/* Para responderle al comprador: mensaje listo para pegar o mandar por WhatsApp */}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" className="rounded-full" onPress={() => {
                        navigator.clipboard?.writeText(statusText(open)).then(() => toast.success("Estado copiado", { description: "Pégalo en el chat con tu comprador." })).catch(() => toast.danger("No se pudo copiar"));
                      }}><Copy className="h-4 w-4" /> Copiar estado</Button>
                      <a className="inline-flex h-10 items-center gap-1.5 rounded-full bg-sb-surface-container-high px-4 text-sm font-medium hover:bg-sb-surface-container-highest"
                        href={`https://wa.me/?text=${encodeURIComponent(statusText(open))}`} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
                      </a>
                    </div>
                    <Button variant="primary" className="rounded-full" onPress={() => setOpen(null)}>Listo</Button>
                  </Modal.Footer>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
