"use client";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notFound } from "next/navigation";
import { Button, Chip, Input, Label, ListBox, Modal, Select, Table, toast, useOverlayState } from "@heroui/react";
import type { Key, Selection, SortDescriptor } from "@heroui/react";
import { Check as CheckIcon, ChevronLeft, ChevronRight, Lock, MoreHorizontal, Search, Trash2, Upload, X } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { Check } from "@/components/Check";
import { ImportPanel, readExcel, type Preview } from "@/components/ImportPanel";
import { ProcessRoute } from "@/components/ProcessRoute";
import {
  DELAY_REASONS, MONTHS, SITE_INFO, STATUS_LABEL, STATUS_STEP, fmtDate, isSite,
  type DateField, type Service, type Site, type Status,
} from "@/lib/hsp";
import { allowedNext, isSuper, previousDate, today, type Role, type Stage } from "@/lib/workflow";

type Unit = {
  id: number; site: Site; chassis: string; motor: string | null; lote: string | null; material: string | null;
  category: string | null; invoice: string | null; guia: string | null; order_sap: string | null; delivery: string | null;
  center: string | null; dealer: string | null; dealer_group: string | null; department: string | null; district: string | null;
  route: string | null; nave: string | null; container: string | null; carrier: string | null; plan_almacen: string | null;
  driver: string | null; gm_com: string | null; observation: string | null; delay_reason: string | null;
  billing_date: string | null; zone: string | null; season: string; via_lima: number; lead_time: number | null; est_date: string | null;
  status: Status; service: Service | null; real_days: number | null;
} & Partial<Record<DateField, string | null>>;

type Meta = { dealers: string[]; zones: string[]; years: number[]; reasons: string[] };

const PAGE = 25;
const field = "rounded-xl border border-sb-outline-variant bg-sb-surface-container-low px-2 py-1 text-xs text-sb-on-surface outline-none transition-colors focus:border-sb-primary";

/**
 * Celda de fecha según quién la ve:
 * edit   = super admin: edita y guarda al salir del campo.
 * next   = le toca al encargado: elige la fecha y confirma con ✓ (luego queda bloqueada).
 * locked = ya registrada: solo lectura con candado.
 * wait   = todavía no le toca a esta etapa (o no es del usuario).
 */
type CellMode = "edit" | "next" | "locked" | "wait";
function DateCell({ value, onSave, label, mode, min }: {
  value?: string | null; onSave: (v: string) => void; label: string; mode: CellMode; min?: string | null;
}) {
  const [draft, setDraft] = useState("");
  if (mode === "locked") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs" title="Registrada · bloqueada">
        <Lock className="h-3 w-3 opacity-40" /> {fmtDate(value)}
      </span>
    );
  }
  if (mode === "wait") return <span className="text-xs text-muted" title="Aún no le toca a esta etapa">{value ? fmtDate(value) : "—"}</span>;
  if (mode === "next") {
    return (
      <div className="flex items-center gap-1">
        <input
          type="date"
          aria-label={label}
          value={draft}
          min={min ?? undefined}
          max={today()}
          onChange={(e) => setDraft(e.target.value)}
          className={`w-[8.5rem] ${field} border-sb-on-surface/60`}
        />
        <button
          type="button"
          aria-label={`Guardar ${label}`}
          title="Guardar (queda bloqueada)"
          disabled={!draft}
          onClick={() => onSave(draft)}
          className="grid h-6 w-6 place-items-center rounded-full bg-sb-on-surface text-sb-surface transition-opacity disabled:opacity-25"
        >
          <CheckIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
  return (
    <input
      type="date"
      aria-label={label}
      defaultValue={value ?? ""}
      key={value ?? ""}
      onBlur={(e) => e.target.value !== (value ?? "") && onSave(e.target.value)}
      className={`w-[8.5rem] ${field}`}
    />
  );
}

function ReasonCell({ value, onSave, reasons }: { value: string | null; onSave: (v: string) => void; reasons: string[] }) {
  return (
    <select aria-label="Motivo de demora" value={value ?? ""} onChange={(e) => onSave(e.target.value)} className={`w-[11rem] ${field}`}>
      <option value="">— Sin motivo —</option>
      {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
  );
}

function ServiceChip({ s }: { s: Service | null }) {
  if (!s) return <span className="text-[10px] text-muted">Sin plazo</span>;
  return (
    <Chip size="sm" className="whitespace-nowrap" variant={s === "A TIEMPO" ? "primary" : "soft"} color={s === "A TIEMPO" ? "accent" : "default"}>
      {s === "A TIEMPO" ? "A tiempo" : "Fuera de tiempo"}
    </Chip>
  );
}

/** Select simple de HeroUI para filtros. */
function Filter({ label, value, onChange, options, className }: {
  label: string; value: string; onChange: (v: string) => void; options: { id: string; label: string }[]; className?: string;
}) {
  return (
    <Select aria-label={label} className={className} placeholder={label} variant="secondary" value={value || null} onChange={(v) => onChange((v as string | null) ?? "")}>
      <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
      <Select.Popover>
        <ListBox>
          {[{ id: "", label }, ...options].map((o) => (
            <ListBox.Item key={o.id || "__all"} id={o.id} textValue={o.label}>{o.label}<ListBox.ItemIndicator /></ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

const FILTER_KEYS = ["q", "status", "service", "dealer", "zone", "reason", "year", "month", "mine", "pending"] as const;

export default function SitePage({ params, searchParams }: {
  params: Promise<{ site: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = use(params).site.toUpperCase();
  const sp = use(searchParams); // filtros que llegan desde el dashboard (?year=2026&month=9&service=...)
  if (!isSite(raw)) notFound();
  const site: Site = raw;
  const info = SITE_INFO[site];

  const [rows, setRows] = useState<Unit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<Meta>({ dealers: [], zones: [], years: [], reasons: [] });
  const [f, setF] = useState(() =>
    Object.fromEntries(FILTER_KEYS.map((k) => [k, typeof sp[k] === "string" ? (sp[k] as string) : ""])) as Record<(typeof FILTER_KEYS)[number], string>,
  );
  const [qInput, setQInput] = useState(f.q);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortDescriptor>({ column: "billing_date", direction: "descending" });
  const [selected, setSelected] = useState<Selection>(new Set());
  const [reload, setReload] = useState(0);

  const bulk = useOverlayState();
  const [bulkField, setBulkField] = useState<Key | null>(info.dates[0].key);
  const [bulkValue, setBulkValue] = useState("");
  const wipe = useOverlayState();
  const [wiping, setWiping] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const editing = rows.find((u) => u.id === editId) ?? null;

  // Usuario actual: el super admin edita todo; el encargado solo la siguiente etapa que le toca
  const [me, setMe] = useState<{ role: Role; stages: Stage[] } | null>(null);
  const sup = isSuper(me?.role);
  const myFields = useMemo(() => new Set(me?.stages.filter((st) => st.site === site).map((st) => st.field) ?? []), [me, site]);
  const modeOf = (u: Unit, k: DateField): CellMode => {
    if (!me) return u[k] ? "locked" : "wait";
    if (sup) return "edit";
    if (u[k]) return "locked";
    return myFields.has(k) && allowedNext(site, u).includes(k) ? "next" : "wait";
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);

  const reasons = useMemo(() => [...new Set([...DELAY_REASONS, ...meta.reasons])], [meta.reasons]);

  // Búsqueda con pequeña espera para no consultar en cada tecla
  useEffect(() => {
    const t = setTimeout(() => { setF((p) => ({ ...p, q: qInput })); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const query = useMemo(() => {
    const p = new URLSearchParams({ site, page: String(page), size: String(PAGE), sort: String(sort.column), dir: sort.direction === "ascending" ? "asc" : "desc" });
    for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
    return p.toString();
  }, [site, page, sort, f]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/units?${query}`).then(async (r) => {
      const j = await r.json().catch(() => null);
      if (!alive) return;
      if (r.ok && j) { setRows(j.rows); setTotal(j.total); } else toast.danger(j?.error ?? "No se pudieron cargar las unidades");
      setLoading(false);
    });
    return () => { alive = false; };
  }, [query, reload]);

  const loadMeta = useCallback(() => {
    fetch(`/api/units?site=${site}&meta=1`).then((r) => r.ok && r.json()).then((j) => j && setMeta(j));
  }, [site]);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  useEffect(() => {
    fetch("/api/me").then((r) => r.ok && r.json()).then((m) => {
      if (!m) return;
      setMe(m);
      // El encargado entra directo a su bandeja (si no llegó con filtros desde otra pantalla)
      const hasStage = (m.stages as Stage[]).some((st) => st.site === site);
      if (!isSuper(m.role) && hasStage && !FILTER_KEYS.some((k) => sp[k])) setF((p) => ({ ...p, mine: "1" }));
    });
  }, [site, sp]);

  // Tiempo real: refresca la tabla cada 10 s (salvo mientras escribes o hay una ventana abierta)
  useEffect(() => {
    const t = setInterval(() => {
      const a = document.activeElement?.tagName;
      if (a === "INPUT" || a === "SELECT" || a === "TEXTAREA" || document.querySelector("[role=dialog]")) return;
      setReload((n) => n + 1);
    }, 10_000);
    return () => clearInterval(t);
  }, []);

  const setFilter = (k: keyof typeof f, v: string) => { setF((p) => ({ ...p, [k]: v })); setPage(1); setSelected(new Set()); };
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const selIds = selected === "all" ? rows.map((u) => u.id) : [...selected].map(Number);

  async function patch(ids: number[], changes: Record<string, string | null>) {
    const r = await fetch("/api/units", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, changes }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) { toast.danger(j?.error ?? "No se pudo guardar"); return false; }
    const fresh = new Map((j.rows as Unit[]).map((u) => [u.id, u]));
    setRows((prev) => prev.map((u) => fresh.get(u.id) ?? u));
    const dates = Object.keys(changes).some((k) => k.startsWith("d_"));
    if (j.skipped) toast.warning(`${j.count} guardadas · ${j.skipped} omitidas`, { description: j.skipReason });
    else if (dates && !sup) toast.success(ids.length > 1 ? `${j.count} fechas registradas` : "Fecha registrada", { description: "Queda bloqueada; ahora sigue la siguiente etapa." });
    return true;
  }

  async function upload(file: File) {
    setUploading(true);
    const p = await readExcel(file);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (p) setPreview(p);
  }

  async function savePreview() {
    if (!preview || preview.saved) return;
    setSaving(true);
    const r = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: preview.token }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setSaving(false);
    if (!r.ok) return toast.danger(j.error);
    setPreview((p) => p && { ...p, saved: true });
    toast.success("Carga masiva guardada", { description: `${j.created.toLocaleString()} nuevas, ${j.updated.toLocaleString()} actualizadas` });
    setReload((n) => n + 1);
    loadMeta();
  }

  async function deleteAll() {
    setWiping(true);
    const r = await fetch(`/api/units?site=${site}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setWiping(false);
    if (!r.ok) return toast.danger(j.error);
    wipe.close();
    setSelected(new Set());
    toast.success(`Unidades ${site} eliminadas`, { description: `${j.deleted.toLocaleString()} unidades borradas` });
    setReload((n) => n + 1);
    loadMeta();
  }

  const statusChips = [{ key: "", label: "Todos" }, ...info.statuses.map((s) => ({ key: s, label: STATUS_LABEL[s] }))];
  const bulkIsReason = bulkField === "delay_reason";

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title={info.title} sub={`${total.toLocaleString()} unidades${Object.values(f).some(Boolean) ? " con los filtros actuales" : ""}`}>
        <Button size="sm" variant="secondary" className="rounded-full" isDisabled={!selIds.length} onPress={() => {
          setBulkField(sup ? info.dates[0].key : info.dates.find((d) => myFields.has(d.key))?.key ?? "delay_reason");
          setBulkValue("");
          bulk.open();
        }}>
          Cambio masivo ({selIds.length})
        </Button>
        {sup && (
          <>
            <Button size="sm" variant="secondary" className="rounded-full" isDisabled={!total && !Object.values(f).some(Boolean)} onPress={wipe.open}>
              <Trash2 className="h-3.5 w-3.5" /> Eliminar todo
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button size="sm" variant="primary" className="rounded-full" isDisabled={uploading} onPress={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> {uploading ? "Leyendo Excel…" : "Cargar Excel"}
            </Button>
          </>
        )}
      </PageTitle>

      {uploading && (
        <Card className="px-4 py-3 text-xs text-sb-on-surface-variant">Leyendo el Excel… un archivo grande (como el HSP-OFICIAL) puede tardar unos 20 segundos.</Card>
      )}
      {preview && <ImportPanel preview={preview} saving={saving} onSave={savePreview} onClose={() => setPreview(null)} />}

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <label className="sbf-search lg:w-80">
          <Search className="h-4 w-4 opacity-40" />
          <input placeholder="Buscar chasis, motor, lote, factura, guía, pedido…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          {qInput && <button onClick={() => setQInput("")} className="opacity-40 hover:opacity-100"><X className="h-4 w-4" /></button>}
        </label>
        <Filter label="Todos los dealers" className="lg:w-64" value={f.dealer} onChange={(v) => setFilter("dealer", v)} options={meta.dealers.map((d) => ({ id: d, label: d }))} />
        <Filter label={`${info.zoneLabel}: todos`} className="lg:w-52" value={f.zone} onChange={(v) => setFilter("zone", v)} options={meta.zones.map((d) => ({ id: d, label: d }))} />
        <Filter label="Año: todos" className="lg:w-36" value={f.year} onChange={(v) => setFilter("year", v)} options={meta.years.map((y) => ({ id: String(y), label: String(y) }))} />
        <Filter label="Mes: todos" className="lg:w-40" value={f.month} onChange={(v) => setFilter("month", v)} options={MONTHS.map((m, i) => ({ id: String(i + 1), label: m }))} />
        <Filter label="Motivo: todos" className="lg:w-56" value={f.reason} onChange={(v) => setFilter("reason", v)} options={[{ id: "__none", label: "Sin motivo" }, ...reasons.map((r) => ({ id: r, label: r }))]} />
        <Filter label="Nivel de servicio: todos" className="lg:w-56" value={f.service} onChange={(v) => setFilter("service", v)} options={[{ id: "A TIEMPO", label: "A tiempo" }, { id: "FUERA DE TIEMPO", label: "Fuera de tiempo" }, { id: "__none", label: "Sin plazo" }]} />
        {sup && (
          <Filter label="Esperando etapa: todas" className="lg:w-60" value={f.pending} onChange={(v) => setFilter("pending", v)} options={info.dates.map((d) => ({ id: d.key, label: `Esperando ${d.label}` }))} />
        )}
        {Object.entries(f).some(([k, v]) => v && k !== "q" && k !== "status" && k !== "mine") && (
          <button className="sbf-chip" onClick={() => { setF((p) => ({ ...p, dealer: "", zone: "", year: "", month: "", reason: "", service: "", pending: "" })); setPage(1); }}>Quitar filtros ✕</button>
        )}
      </div>
      {!sup && me && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-sb-on-surface-variant">
          {myFields.size ? (
            <>
              <button className={`sbf-chip ${f.mine ? "active" : ""}`} onClick={() => setFilter("mine", f.mine ? "" : "1")}>Mis pendientes</button>
              <span>Tus etapas: {info.dates.filter((d) => myFields.has(d.key)).map((d) => d.label).join(", ")}. Solo puedes registrar la siguiente etapa de cada unidad; al guardar queda bloqueada.</span>
            </>
          ) : (
            <span>No tienes etapas asignadas en {info.title}. Solo puedes consultar.</span>
          )}
        </div>
      )}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {statusChips.map((c) => (
          <button key={c.key} className={`sbf-chip ${f.status === c.key ? "active" : ""}`} onClick={() => setFilter("status", c.key)}>{c.label}</button>
        ))}
      </div>

      <Card className="sb-anim-table-in overflow-hidden">
        <Table>
          <Table.ScrollContainer>
            <Table.Content
              aria-label={`Unidades ${site}`}
              className="min-w-[1900px]"
              selectionMode="multiple"
              selectedKeys={selected}
              onSelectionChange={setSelected}
              sortDescriptor={sort}
              onSortChange={(s) => { setSort(s); setPage(1); }}
            >
              <Table.Header>
                <Table.Column className="pe-0"><Check slot="selection" aria-label="Seleccionar todo" /></Table.Column>
                <Table.Column allowsSorting isRowHeader id="chassis" className="after:hidden">
                  {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>Chasis / Motor</Table.SortableColumnHeader>}
                </Table.Column>
                <Table.Column allowsSorting id="material">
                  {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>Modelo</Table.SortableColumnHeader>}
                </Table.Column>
                <Table.Column allowsSorting id="dealer">
                  {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>Dealer / {info.zoneLabel}</Table.SortableColumnHeader>}
                </Table.Column>
                <Table.Column allowsSorting id="billing_date">
                  {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>F. facturación</Table.SortableColumnHeader>}
                </Table.Column>
                {info.dates.map((d) => (
                  <Table.Column key={d.key} id={d.key} allowsSorting>
                    {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>{d.label}</Table.SortableColumnHeader>}
                  </Table.Column>
                )) as never}
                <Table.Column allowsSorting id="status">
                  {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>Estado</Table.SortableColumnHeader>}
                </Table.Column>
                <Table.Column allowsSorting id="est_date">
                  {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>F. estimada</Table.SortableColumnHeader>}
                </Table.Column>
                <Table.Column allowsSorting id="service">
                  {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>Nivel de servicio</Table.SortableColumnHeader>}
                </Table.Column>
                <Table.Column allowsSorting id="delay_reason">
                  {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>Motivo de demora</Table.SortableColumnHeader>}
                </Table.Column>
                <Table.Column className="text-end">Acciones</Table.Column>
              </Table.Header>
              <Table.Body renderEmptyState={() => (
                <div className="py-10 text-center text-sb-on-surface-variant/60">
                  {loading ? "Cargando…" : Object.values(f).some(Boolean) ? "Ninguna unidad coincide con los filtros." : "Sin unidades. Carga el Excel HSP-OFICIAL o el PCL-FACT para empezar."}
                </div>
              )}>
                {rows.map((u) => (
                  <Table.Row key={u.id} id={u.id}>
                    <Table.Cell className="pe-0"><Check slot="selection" aria-label={`Seleccionar ${u.chassis}`} /></Table.Cell>
                    <Table.Cell>
                      <div className="font-mono text-xs font-medium">{u.chassis}</div>
                      <div className="font-mono text-[10px] text-muted">{u.motor}</div>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="whitespace-nowrap text-xs">{u.material}</div>
                      <div className="text-[10px] text-muted">{u.category}{u.lote ? ` · Lote ${u.lote}` : ""}</div>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="max-w-[14rem] truncate text-xs" title={u.dealer ?? ""}>{u.dealer}</div>
                      <div className="text-[10px] text-muted">{u.zone ?? "Sin zona"}{site === "PCL" && u.center ? ` · CL ${u.center}` : ""}</div>
                    </Table.Cell>
                    <Table.Cell className="text-xs">{fmtDate(u.billing_date) || "—"}</Table.Cell>
                    {info.dates.map((d) => (
                      <Table.Cell key={d.key}>
                        <DateCell key={`${u.id}-${d.key}`} label={d.label} value={u[d.key]} mode={modeOf(u, d.key)} min={previousDate(site, u, d.key)} onSave={(v) => patch([u.id], { [d.key]: v || null })} />
                      </Table.Cell>
                    )) as never}
                    <Table.Cell>
                      <Chip size="sm" className="whitespace-nowrap" variant={u.status === "ENTREGADO" ? "primary" : "soft"} color={u.status === "ENTREGADO" ? "accent" : "default"}>{STATUS_LABEL[u.status]}</Chip>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="text-xs">{fmtDate(u.est_date) || "—"}</div>
                      <div className="text-[10px] text-muted">
                        {u.lead_time != null ? `${u.lead_time} días${site === "YUR" ? ` · ${u.season.toLowerCase()}` : ""}` : "Sin plazo configurado"}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <ServiceChip s={u.service} />
                      {u.real_days != null && <div className="mt-1 text-[10px] text-muted">Real: {u.real_days} días</div>}
                    </Table.Cell>
                    <Table.Cell><ReasonCell value={u.delay_reason} reasons={reasons} onSave={(v) => patch([u.id], { delay_reason: v || null })} /></Table.Cell>
                    <Table.Cell>
                      <div className="flex justify-end">
                        <Button isIconOnly size="sm" variant="tertiary" aria-label={`Más opciones de ${u.chassis}`} onPress={() => setEditId(u.id)}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
        <div className="flex items-center justify-between border-t border-sb-outline-variant/40 px-4 py-2.5 text-[11px] text-sb-on-surface-variant">
          <span>{selIds.length ? `${selIds.length} seleccionadas` : `${total.toLocaleString()} resultados`}</span>
          <div className="flex items-center gap-1">
            <button className="rounded-full p-1.5 hover:bg-sb-surface-container disabled:opacity-30" aria-label="Página anterior" disabled={page <= 1} onClick={() => { setPage(page - 1); setSelected(new Set()); }}><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-20 text-center font-medium text-sb-on-surface">{page.toLocaleString()} / {pages.toLocaleString()}</span>
            <button className="rounded-full p-1.5 hover:bg-sb-surface-container disabled:opacity-30" aria-label="Página siguiente" disabled={page >= pages} onClick={() => { setPage(page + 1); setSelected(new Set()); }}><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </Card>

      {/* Cambio masivo: una fecha o el motivo de demora para las unidades seleccionadas */}
      <Modal>
        <Modal.Backdrop isOpen={bulk.isOpen} onOpenChange={bulk.setOpen}>
          <Modal.Container>
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.CloseTrigger aria-label="Cerrar" /><Modal.Header><Modal.Heading>Cambio masivo · {selIds.length} unidades</Modal.Heading></Modal.Header>
                  <Modal.Body className="flex flex-col gap-4 p-1">
                    <Select className="w-full" value={bulkField} onChange={(v) => { setBulkField(v as Key | null); setBulkValue(""); }}>
                      <Label>Campo</Label>
                      <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          {[...info.dates.filter((d) => sup || myFields.has(d.key)).map((d) => ({ id: d.key as string, label: d.label })), { id: "delay_reason", label: "Motivo de demora" }].map((o) => (
                            <ListBox.Item key={o.id} id={o.id} textValue={o.label}>{o.label}<ListBox.ItemIndicator /></ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                    {bulkIsReason ? (
                      <div className="flex flex-col gap-1.5">
                        <Label>Motivo (vacío = quitar)</Label>
                        <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className={`h-10 w-full ${field}`}>
                          <option value="">— Sin motivo —</option>
                          {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <Label>{sup ? "Fecha (vacío = borrar)" : "Fecha (se aplica solo a las unidades que esperan esta etapa)"}</Label>
                        <Input type="date" max={sup ? undefined : today()} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
                      </div>
                    )}
                  </Modal.Body>
                  <Modal.Footer>
                    <Button variant="secondary" className="rounded-full" onPress={close}>Cancelar</Button>
                    <Button variant="primary" className="rounded-full" onPress={async () => {
                      if (await patch(selIds, { [String(bulkField)]: bulkValue || null })) { setSelected(new Set()); close(); }
                    }}>Aplicar</Button>
                  </Modal.Footer>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Eliminar todo el módulo */}
      <Modal>
        <Modal.Backdrop isOpen={wipe.isOpen} onOpenChange={(o) => !wiping && wipe.setOpen(o)}>
          <Modal.Container>
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.CloseTrigger aria-label="Cerrar" /><Modal.Header><Modal.Heading>¿Eliminar todas las unidades {site}?</Modal.Heading></Modal.Header>
                  <Modal.Body className="p-1 text-sm text-sb-on-surface-variant">
                    Se borrarán <b className="text-sb-on-surface">todas las unidades del módulo {info.title}</b> con sus fechas y motivos de demora
                    (no solo las filtradas). El otro módulo y los dealers se mantienen. Esta acción no se puede deshacer.
                  </Modal.Body>
                  <Modal.Footer>
                    <Button variant="secondary" className="rounded-full" isDisabled={wiping} onPress={close}>Cancelar</Button>
                    <Button variant="danger" className="rounded-full" isDisabled={wiping} onPress={deleteAll}>
                      <Trash2 className="h-3.5 w-3.5" /> {wiping ? "Eliminando…" : "Sí, eliminar todo"}
                    </Button>
                  </Modal.Footer>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Detalle / edición de una unidad */}
      <Modal>
        <Modal.Backdrop isOpen={!!editing} onOpenChange={(o) => !o && setEditId(null)}>
          <Modal.Container size="lg">
            <Modal.Dialog>
              {({ close }) => editing && (
                <>
                  <Modal.CloseTrigger aria-label="Cerrar" /><Modal.Header><Modal.Heading>Unidad {editing.chassis}</Modal.Heading></Modal.Header>
                  <Modal.Body className="flex flex-col gap-4 p-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip size="sm" variant="soft">{STATUS_LABEL[editing.status]}</Chip>
                      <ServiceChip s={editing.service} />
                      <span className="text-xs text-muted">
                        Estimada {fmtDate(editing.est_date) || "—"}{editing.lead_time != null ? ` (${editing.lead_time} días)` : ""}
                      </span>
                    </div>
                    <ProcessRoute site={site} current={STATUS_STEP[editing.status]} dates={editing} viaLima={site === "PCL" ? !!Number(editing.via_lima) || !!editing.d_alm_lima || !!editing.d_sal_lima : undefined} />
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                      {[
                        ["Motor", editing.motor], ["Modelo", editing.material], ["Tipo", editing.category], ["Lote", editing.lote],
                        ["Dealer", editing.dealer], ...(site === "YUR" ? [["Grupo dealer", editing.dealer_group]] : []),
                        ["Departamento", editing.department], ["Distrito", editing.district], ...(site === "YUR" ? [["Ruta", editing.route]] : []),
                        ["Pedido SAP", editing.order_sap], ["Factura", editing.invoice], ["Guía", editing.guia], ["Entrega", editing.delivery],
                        ["CL", editing.center], ["F. facturación", fmtDate(editing.billing_date)], ...(site === "YUR" ? [["GM/COM", editing.gm_com]] : []),
                      ].map(([k, v]) => (
                        <div key={k as string}><dt className="text-[10px] uppercase tracking-wider text-muted">{k}</dt><dd className="truncate">{v || "—"}</dd></div>
                      ))}
                    </dl>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {info.dates.map((d) => (
                        <label key={d.key} className="flex items-center justify-between gap-3 text-sm">
                          <span>{d.label}</span>
                          <DateCell key={`${editing.id}-${d.key}`} label={d.label} value={editing[d.key]} mode={modeOf(editing, d.key)} min={previousDate(site, editing, d.key)} onSave={(v) => patch([editing.id], { [d.key]: v || null })} />
                        </label>
                      ))}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 text-xs">
                        Motivo de demora
                        <ReasonCell value={editing.delay_reason} reasons={reasons} onSave={(v) => patch([editing.id], { delay_reason: v || null })} />
                      </label>
                      {(site === "PCL"
                        ? [["nave", "Nave"], ["container", "Contenedor"], ["carrier", "Tramo final (transportista)"], ["plan_almacen", "Plan almacén"]]
                        : [["nave", "Nave"], ["container", "CTN"], ["driver", "Chofer"]]
                      ).map(([k, label]) => (
                        <label key={k} className="flex flex-col gap-1 text-xs">
                          {label}
                          <input
                            key={`${editing.id}-${editing[k as keyof Unit] ?? ""}`}
                            defaultValue={(editing[k as keyof Unit] as string | null) ?? ""}
                            readOnly={!sup}
                            onBlur={(e) => e.target.value !== ((editing[k as keyof Unit] as string | null) ?? "") && patch([editing.id], { [k]: e.target.value || null })}
                            className={`h-8 ${field}`}
                          />
                        </label>
                      ))}
                      <label className="flex flex-col gap-1 text-xs sm:col-span-2">
                        Observación
                        <textarea
                          key={`${editing.id}-${editing.observation ?? ""}`}
                          defaultValue={editing.observation ?? ""}
                          rows={2}
                          onBlur={(e) => e.target.value !== (editing.observation ?? "") && patch([editing.id], { observation: e.target.value || null })}
                          className={field}
                        />
                      </label>
                    </div>
                  </Modal.Body>
                  <Modal.Footer><Button variant="primary" className="rounded-full" onPress={close}>Listo</Button></Modal.Footer>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
