"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, Button, Chip, Description, Input, Label, Switch, Table, TextField, toast, useOverlayState } from "@heroui/react";
import { Sheet } from "@/components/modal/Sheet";
import { ChoiceCards } from "@/components/modal/ChoiceCards";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Selection, SortDescriptor } from "@heroui/react";
import { cn } from "@/lib/cn";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, Copy, Eye, EyeOff, KeyRound, Store, ListChecks, UserPlus, Plus, Radio, Search, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { Card, CodeTag, PageTitle } from "@/components/ui";
import { Check } from "@/components/Check";
import { AreaPicker, type Assignment } from "@/components/AreaPicker";
import { DealerAccounts } from "@/components/DealerAccounts";
import { ROLE_LABEL, USER_DOMAIN, companyCode, roleLabel, areaOf, stageLabel, suggestEmail, type Role, type Stage } from "@/lib/workflow";
import { SoftSelect } from "@/components/SoftSelect";
import { generatePassword } from "@/lib/password";
import { PasswordMeter } from "@/components/PasswordMeter";
import { passwordProblem } from "@/lib/password";

type Admin = {
  id: number; name: string; email: string; role: Exclude<Role, "dev">; created_at: string; last_seen: string | null; online: number;
  stages: Stage[]; area: string | null; carrier: string | null; can_import: number; company: string | null; dealer: string | null; is_owner?: number; company_id?: number | null; company_kind?: string | null; company_code?: string | null;
  client?: string | null; client_stores?: number;
};
type NewRole = "operator" | "admin" | "viewer" | "dealer";

/** Qué puede hacer cada tipo de cuenta (se muestra al crearla). */
const ROLE_HELP: Record<NewRole, string> = {
  operator: "Registra solo las fechas de su área, en orden. Entra directo a «Mi trabajo».",
  admin: "Ve todo (dashboard, en vivo), carga el Excel, corrige fechas y crea encargados y cuentas de clientes.",
  viewer: "Personal de un consorcio cliente: ve el dashboard, las alertas y las unidades en vivo, sin poder cambiar nada.",
  dealer: "Cliente de un consorcio (sus distribuidores o tiendas): ve las unidades de todas sus tiendas, en qué etapa van y si llegan a tiempo. No ve otros clientes ni puede cambiar nada.",
};
const ROLE_TITLE: Record<NewRole, string> = { operator: "Nuevo encargado", admin: "Nuevo supervisor", viewer: "Nueva cuenta de solo lectura", dealer: "Nueva cuenta de cliente" };

/** Lo que tiene a cargo o ve cada cuenta, en una línea. */
function Scope({ a }: { a: Admin }) {
  if (a.role === "admin" && Number(a.is_owner)) return <span className="text-xs text-muted">Cuenta principal de la empresa{a.company ? ` · ${a.company}` : ""}</span>;
  if (a.role === "admin") return <span className="text-xs text-muted">Ve todo, corrige y supervisa{a.company ? ` · ${a.company}` : ""}</span>;
  if (a.role === "viewer") return <span className="text-xs text-muted">Ve todo en solo lectura{a.company ? ` · ${a.company}` : ""}</span>;
  if (a.role === "dealer") return (
    <span className="text-xs">
      <b className="font-medium">{a.client ?? a.dealer ?? "Sin cliente"}</b>{" "}
      <span className="text-muted">· {a.client ? `${a.client_stores ?? 0} ${Number(a.client_stores) === 1 ? "tienda" : "tiendas"}` : "una tienda"} · solo lo suyo</span>
    </span>
  );
  return null;
}

const initials = (n: string) => n.split(" ").filter(Boolean).map((x) => x[0]).join("").toUpperCase().slice(0, 2);

const genPassword = () => generatePassword(12);

const copy = (text: string, msg: string) => navigator.clipboard?.writeText(text).then(() => toast.success(msg)).catch(() => toast.danger("No se pudo copiar"));

export default function AdminsPage() {
  const [rows, setRows] = useState<Admin[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Selection>(new Set());
  const [sort, setSort] = useState<SortDescriptor>({ column: "created_at", direction: "descending" });
  const create = useOverlayState();
  const [bulkDealers, setBulkDealers] = useState(false);
  const [toDelete, setToDelete] = useState<Admin | null>(null);
  // Dos listas separadas: el personal de la empresa (Leyva) y sus clientes: cada consorcio (Honda, u otra empresa) con su personal y sus propios clientes
  const router = useRouter();
  const [tab, setTab] = useState<"staff" | "clients">("staff");
  const [consortia, setConsortia] = useState<{ id: number; name: string; code: string | null; parent: string | null }[]>([]);
  const [consortiumId, setConsortiumId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailEdited, setEmailEdited] = useState(false);
  const [auto, setAuto] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [password, setPassword] = useState(() => genPassword());
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<NewRole>("operator");
  const [dealers, setDealers] = useState<{ id: number; name: string; client: string | null; company_id: number | null }[]>([]);
  const [dealerId, setDealerId] = useState(""); // aquí guarda el cliente elegido
  // Clientes del consorcio elegido con sus tiendas (más los que aún no tienen consorcio), para elegir a quién es la cuenta
  const clientList = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of dealers) if (d.client && (!consortiumId || !d.company_id || d.company_id === consortiumId)) m.set(d.client, (m.get(d.client) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [dealers, consortiumId]);
  const emptyAsg: Assignment = { area: "", stages: [], carrier: "", canImport: true };
  const [asg, setAsg] = useState<Assignment>(emptyAsg);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [editStages, setEditStages] = useState<Admin | null>(null);
  const [draftAsg, setDraftAsg] = useState<Assignment>(emptyAsg);
  useEffect(() => {
    fetch("/api/admins?carriers=1").then((r) => r.ok && r.json()).then((c) => c && setCarriers(c));
    fetch("/api/dealers").then((r) => r.ok && r.json()).then((d) => d && setDealers(d));
    fetch("/api/companies").then((r) => r.ok && r.json()).then((j) => {
      const list = (j?.companies ?? []).filter((c: { kind: string }) => c.kind === "client");
      setConsortia(list); setConsortiumId(list[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  const load = useCallback(() => fetch("/api/admins").then((r) => r.json()).then(setRows), []);
  useEffect(() => { load(); }, [load]);

  // Se arma con el nombre y el área (o rol): ej. stelozano.almacenpcl@trackin.pe
  const suggested = useMemo(() => suggestEmail(name, role, asg.area), [name, role, asg.area]);
  const shownEmail = emailEdited ? email : suggested;

  const isStaff = (a: Admin) => a.role === "admin" || a.role === "operator";
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const col = String(sort.column) as keyof Admin;
    return rows
      .filter((a) => (tab === "staff" ? isStaff(a) : !isStaff(a)))
      .filter((a) => !t || a.name.toLowerCase().includes(t) || a.email.toLowerCase().includes(t) || String(a.client ?? "").toLowerCase().includes(t))
      .sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (sort.direction === "descending" ? -1 : 1));
  }, [rows, q, sort, tab]);
  const myCompany = consortia[0]?.parent ?? "la empresa";
  const consortium = consortia.find((c) => c.id === consortiumId) ?? consortia[0] ?? null;
  // Clientes agrupados por consorcio: su personal (solo lectura) y sus clientes de motos
  const groups = useMemo(() => {
    const m = new Map<number, { id: number; name: string; code: string | null; staff: Admin[]; clients: Admin[] }>();
    for (const a of list) {
      const own = a.company_kind === "client" && a.company_id ? a.company_id : 0;
      const g = m.get(own) ?? { id: own, name: own ? a.company ?? "Consorcio" : "Sin consorcio", code: own ? a.company_code ?? null : null, staff: [], clients: [] };
      (a.role === "dealer" ? g.clients : g.staff).push(a);
      m.set(own, g);
    }
    for (const c of consortia) if (!m.has(c.id) && !q.trim()) m.set(c.id, { id: c.id, name: c.name, code: c.code, staff: [], clients: [] });
    return [...m.values()].sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || a.name.localeCompare(b.name));
  }, [list, consortia, q]);

  const online = rows.filter((a) => Number(a.online)).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (role === "operator" && !asg.area) return toast.danger("Elige el área del encargado");
    if (role === "dealer" && !dealerId) return toast.danger("Elige el cliente");
    const weak = passwordProblem(password, { email: shownEmail, name });
    if (weak) return toast.danger(weak);
    setSaving(true);
    const r = await fetch("/api/admins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email: shownEmail, password, role, client: role === "dealer" ? dealerId : undefined, companyId: role === "viewer" || role === "dealer" ? consortium?.id : undefined, ...(role === "operator" ? asg : {}) }) });
    setSaving(false);
    if (!r.ok) return toast.danger((await r.json()).error);
    await navigator.clipboard?.writeText(`${shownEmail} / ${password}`).catch(() => {});
    toast.success(`${ROLE_LABEL[role]}: cuenta creada`, { description: `${shownEmail} · contraseña: ${password} (copiado)`, timeout: 15000 });
    setName(""); setEmail(""); setEmailEdited(false); setAuto(true); setPassword(genPassword()); setAsg(emptyAsg); setDealerId("");
    create.close();
    load();
  }

  async function reset(a: Admin) {
    const pw = genPassword();
    const r = await fetch("/api/admins", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, password: pw }) });
    if (!r.ok) return toast.danger("No se pudo cambiar la contraseña", { description: (await r.json().catch(() => null))?.error });
    await navigator.clipboard?.writeText(pw).catch(() => {});
    toast.success(`Nueva contraseña para ${a.name}`, { description: `${pw} (copiada)`, timeout: 15000 });
  }

  async function remove(a: Admin) {
    await fetch(`/api/admins?id=${a.id}`, { method: "DELETE" });
    toast.success("Usuario eliminado");
    setToDelete(null);
    setSelected(new Set());
    load();
  }

  async function saveStages() {
    if (!editStages) return;
    const r = await fetch("/api/admins", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editStages.id, ...draftAsg }) });
    if (!r.ok) return toast.danger((await r.json().catch(() => ({}))).error ?? "No se pudo guardar");
    toast.success(`Área de ${editStages.name} actualizada`);
    setEditStages(null);
    load();
  }

  const staffRows = rows.filter(isStaff), clientRows = rows.filter((a) => !isStaff(a));
  const stats = tab === "staff" ? [
    { label: "Supervisores", value: staffRows.filter((a) => a.role === "admin").length, icon: ShieldCheck },
    { label: "Encargados de etapa", value: staffRows.filter((a) => a.role === "operator").length, icon: Users },
    { label: "Personal en línea", value: staffRows.filter((a) => Number(a.online)).length, icon: Radio },
  ] : [
    { label: "Consorcios clientes", value: consortia.length, icon: Building2 },
    { label: "Personal del consorcio", value: clientRows.filter((a) => a.role === "viewer").length, icon: Eye },
    { label: "Clientes de motos", value: clientRows.filter((a) => a.role === "dealer").length, icon: Store },
    { label: "Clientes en línea", value: clientRows.filter((a) => Number(a.online)).length, icon: Radio },
  ];
  void online;
  const openCreate = (r: NewRole) => { setRole(r); setAsg(emptyAsg); setDealerId(""); create.open(); };

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Usuarios" sub={tab === "staff"
        ? `Personal de ${myCompany}: supervisores que ven y corrigen todo, y encargados que registran las fechas de su área.`
        : `Clientes de ${myCompany}: cada consorcio con su propio personal (solo lectura) y las cuentas de sus clientes. Cada cliente pertenece a un solo consorcio.`}>
        {tab === "clients" ? (
          <>
            <Button size="sm" variant="secondary" className="rounded-full" onPress={() => router.push("/companies")}><Building2 className="h-3.5 w-3.5" /> Nuevo consorcio</Button>
            <Button size="sm" variant="primary" className="rounded-full" isDisabled={!consortia.length} onPress={() => openCreate("dealer")}><Plus className="h-3.5 w-3.5" /> Nueva cuenta de cliente</Button>
          </>
        ) : (
          <Button size="sm" variant="primary" className="rounded-full" onPress={() => openCreate("operator")}><Plus className="h-3.5 w-3.5" /> Nuevo personal</Button>
        )}
      </PageTitle>
      <DealerAccounts open={bulkDealers} onClose={() => setBulkDealers(false)} onCreated={load} consortium={consortium ? { id: consortium.id, name: consortium.name } : null} />

      {/* Personal de la empresa | Clientes: dos listas separadas */}
      <div className="flex w-full min-w-0 max-w-xl rounded-full bg-sb-surface-container p-1" role="tablist" aria-label="Tipo de usuarios">
        {([["staff", `Personal de ${myCompany}`, staffRows.length, Users], ["clients", "Clientes", clientRows.length, Building2]] as const).map(([k, l, n, I]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setSelected(new Set()); setQ(""); }}
            className={cn("sb-pill relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 py-2 text-[13px] font-medium transition-colors sm:gap-2 sm:px-3", tab === k ? "text-sb-on-surface" : "text-sb-on-surface-variant hover:text-sb-on-surface")}>
            {tab === k && <motion.span layoutId="users-tab" className="absolute inset-0 rounded-full bg-sb-surface shadow-[var(--sb-shadow-card)]" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
            <I className="relative h-4 w-4 shrink-0" />
            <span className="relative truncate"><span className="sm:hidden">{k === "staff" ? "Personal" : l}</span><span className="hidden sm:inline">{l}</span></span>
            <span className="relative shrink-0 rounded-full bg-sb-surface-container-high px-1.5 text-[11px] tabular-nums">{n}</span>
          </button>
        ))}
      </div>

      {/* Cifras: en celular una franja compacta (3 o 2×2), sin huecos vacíos */}
      <Card className={cn("grid overflow-hidden", stats.length === 3 ? "grid-cols-3" : "grid-cols-2 lg:grid-cols-4")}>
        {stats.map((m, i) => (
          <div key={m.label} className={cn("min-w-0 px-3 py-3 sm:px-5 sm:py-4", i > 0 && "border-l border-sb-outline-variant/40", stats.length === 4 && i === 2 && "border-l-0 lg:border-l", stats.length === 4 && i >= 2 && "border-t border-sb-outline-variant/40 lg:border-t-0")}>
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-sb-on-surface-variant">
              <m.icon className="hidden h-3.5 w-3.5 shrink-0 sm:block" /><span className="line-clamp-2 leading-tight">{m.label}</span>
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{m.value}</p>
          </div>
        ))}
      </Card>

      <label className="sbf-search md:w-96">
        <Search className="h-4 w-4 opacity-40" />
        <input placeholder={tab === "staff" ? "Buscar personal por nombre o correo…" : "Buscar cliente, consorcio o correo…"} value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button type="button" onClick={() => setQ("")} className="opacity-40 hover:opacity-100"><X className="h-4 w-4" /></button>}
      </label>

      {tab === "clients" && (
        <div className="flex flex-col gap-4">
          {!groups.length && (
            <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-sb-surface-container text-sb-on-surface-variant"><Building2 className="h-5 w-5" /></span>
              <b className="text-[14px]">{q ? "Sin resultados" : "Todavía no hay consorcios clientes"}</b>
              {!q && <p className="max-w-md text-[12.5px] text-sb-on-surface-variant">Primero crea el consorcio (Honda u otra empresa) en «Empresas». Después aquí le das cuentas a su personal y a sus clientes.</p>}
            </Card>
          )}
          {groups.map((g) => (
            <Card key={g.id} className="overflow-hidden">
              {/* Consorcio: quién es y de quién es cliente */}
              <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sb-primary-soft text-sb-primary"><Building2 className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[16px] font-semibold tracking-tight">{g.name}{g.code && <CodeTag code={g.code} size="xs" />}</p>
                  <p className="flex flex-wrap items-center gap-1 text-[12px] text-sb-on-surface-variant">
                    {g.id ? <>Consorcio cliente de <b className="font-medium text-sb-on-surface">{myCompany}</b> <ChevronRight className="h-3 w-3" /> {g.staff.length} de su personal · {g.clients.length} {g.clients.length === 1 ? "cliente suyo" : "clientes suyos"}</> : "Cuentas sin consorcio asignado"}
                  </p>
                </div>
                {g.id > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="tertiary" className="rounded-full" onPress={() => { setConsortiumId(g.id); openCreate("viewer"); }}><Eye className="h-3.5 w-3.5" /> Su personal</Button>
                    <Button size="sm" variant="tertiary" className="rounded-full" onPress={() => { setConsortiumId(g.id); setBulkDealers(true); }}><Store className="h-3.5 w-3.5" /> Varios clientes</Button>
                    <Button size="sm" variant="secondary" className="rounded-full" onPress={() => { setConsortiumId(g.id); openCreate("dealer"); }}><Plus className="h-3.5 w-3.5" /> Cliente de {short(g.name)}</Button>
                  </div>
                )}
              </div>
              <ClientBlock title={`Personal de ${g.name}`} hint={`El equipo de ${short(g.name)} mismo: ve en solo lectura (dashboard, alertas, unidades). No son sus clientes.`} rows={g.staff}
                empty="Sin cuentas de su personal." render={(a) => <ClientRow key={a.id} a={a} kind="staff" consortium={g.name} onCopy={() => copy(a.email, "Correo copiado")} onReset={() => reset(a)} onDelete={() => setToDelete(a)} />} />
              <ClientBlock title={`Clientes de ${g.name}`} hint={`Los clientes de ${short(g.name)} (sus distribuidores o tiendas): cada cuenta ve solo las unidades de sus tiendas, nada de otros clientes ni de otros consorcios.`} rows={g.clients}
                empty="Todavía no hay cuentas de sus clientes." render={(a) => <ClientRow key={a.id} a={a} kind="client" consortium={g.name} onCopy={() => copy(a.email, "Correo copiado")} onReset={() => reset(a)} onDelete={() => setToDelete(a)} />} />
            </Card>
          ))}
        </div>
      )}

      {tab === "staff" && <>
      {/* Celular: tarjetas */}
      <div className="flex flex-col gap-2 md:hidden">
        {!list.length && <Card className="px-4 py-10 text-center text-sm text-sb-on-surface-variant/60">{q ? "Sin resultados." : "Aún no hay personal. Crea el primer encargado."}</Card>}
        {list.map((a) => (
          <Card key={a.id} className="flex flex-col gap-2 p-3">
            <div className="flex items-start gap-3">
              <Avatar size="sm"><Avatar.Fallback>{initials(a.name)}</Avatar.Fallback></Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {a.name}
                  {!!Number(a.online) && <span className="h-2 w-2 rounded-full bg-sb-primary" title="En línea" />}
                </div>
                <div className="truncate text-[11px] text-muted">{a.email}</div>
              </div>
              {Number(a.is_owner) && a.company_id ? <CodeTag code={companyCode(a.company_id, a.company_kind, a.company_code)} /> : <Chip size="sm" variant={a.role === "admin" ? "secondary" : "soft"}>{roleLabel(a.role)}</Chip>}
            </div>
            <div className="text-xs">
              {a.role !== "operator" ? <Scope a={a} /> : (
                <>
                  <b>{a.area && a.area !== "CUSTOM" ? areaOf(a.area)?.label : "Personalizado"}</b>{a.carrier ? ` · ${a.carrier}` : ""}
                  <div className="text-[11px] text-muted">{a.stages.map((st) => `${st.site} · ${stageLabel(st.site, st.field)}`).join(", ") || "Sin etapas"}</div>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {a.role === "operator" && (
                <Button size="sm" variant="secondary" className="rounded-full" onPress={() => { setEditStages(a); setDraftAsg({ area: a.area ?? "CUSTOM", stages: a.stages, carrier: a.carrier ?? "", canImport: !!Number(a.can_import) }); }}><ListChecks className="h-3.5 w-3.5" /> Área</Button>
              )}
              <Button size="sm" variant="secondary" className="rounded-full" onPress={() => copy(a.email, "Correo copiado")}><Copy className="h-3.5 w-3.5" /> Usuario</Button>
              <Button size="sm" variant="secondary" className="rounded-full" onPress={() => reset(a)}><KeyRound className="h-3.5 w-3.5" /> Contraseña</Button>
              <Button size="sm" variant="danger-soft" className="rounded-full" onPress={() => setToDelete(a)}><Trash2 className="h-3.5 w-3.5" /> Eliminar</Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="sb-anim-table-in hidden overflow-hidden md:block">
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Personal" className="min-w-[900px]" selectionMode="multiple" selectedKeys={selected} onSelectionChange={setSelected} sortDescriptor={sort} onSortChange={setSort}>
              <Table.Header>
                <Table.Column className="pe-0"><Check slot="selection" aria-label="Seleccionar todo" /></Table.Column>
                <Table.Column allowsSorting isRowHeader id="name" className="after:hidden">
                  {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>Usuario</Table.SortableColumnHeader>}
                </Table.Column>
                <Table.Column allowsSorting id="role">
                  {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>Rol</Table.SortableColumnHeader>}
                </Table.Column>
                <Table.Column id="stages">Área · etapas a su cargo</Table.Column>
                <Table.Column allowsSorting id="created_at">
                  {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>Creado</Table.SortableColumnHeader>}
                </Table.Column>
                <Table.Column className="text-end">Acciones</Table.Column>
              </Table.Header>
              <Table.Body renderEmptyState={() => <div className="py-10 text-center text-sb-on-surface-variant/60">{q ? "Sin resultados." : "Aún no hay usuarios. Crea el primer encargado."}</div>}>
                {list.map((a) => (
                  <Table.Row key={a.id} id={a.id}>
                    <Table.Cell className="pe-0"><Check slot="selection" aria-label={`Seleccionar ${a.name}`} /></Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-3">
                        <Avatar size="sm"><Avatar.Fallback>{initials(a.name)}</Avatar.Fallback></Avatar>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">{a.name}</span>
                          <span className="text-xs text-muted">{a.email}</span>
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell>{Number(a.is_owner) && a.company_id ? <CodeTag code={companyCode(a.company_id, a.company_kind, a.company_code)} /> : <Chip size="sm" variant={a.role === "admin" ? "secondary" : "soft"}>{roleLabel(a.role)}</Chip>}</Table.Cell>
                    <Table.Cell>
                      {a.role !== "operator" ? <Scope a={a} /> : (
                        <div className="flex max-w-[24rem] flex-wrap items-center gap-1">
                          {a.area && a.area !== "CUSTOM" && <span className="mr-1 text-xs font-medium">{areaOf(a.area)?.label}{a.carrier ? ` · ${a.carrier}` : ""}</span>}
                          {!a.stages.length && <span className="text-xs text-muted">Sin etapas</span>}
                          {a.stages.map((st) => <Chip key={`${st.site}${st.field}`} size="sm" variant="soft">{st.site} · {stageLabel(st.site, st.field)}</Chip>)}
                        </div>
                      )}
                    </Table.Cell>
                    <Table.Cell className="text-xs text-muted">{a.created_at}</Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center justify-end gap-1">
                        {a.role === "operator" && (
                          <Button isIconOnly size="sm" variant="tertiary" aria-label={`Cambiar área de ${a.name}`} onPress={() => { setEditStages(a); setDraftAsg({ area: a.area ?? "CUSTOM", stages: a.stages, carrier: a.carrier ?? "", canImport: !!Number(a.can_import) }); }}><ListChecks className="h-4 w-4" /></Button>
                        )}
                        <Button isIconOnly size="sm" variant="tertiary" aria-label={`Copiar correo de ${a.name}`} onPress={() => copy(a.email, "Correo copiado")}><Copy className="h-4 w-4" /></Button>
                        <Button isIconOnly size="sm" variant="tertiary" aria-label={`Restablecer contraseña de ${a.name}`} onPress={() => reset(a)}><KeyRound className="h-4 w-4" /></Button>
                        <Button isIconOnly size="sm" variant="danger-soft" aria-label={`Eliminar ${a.name}`} onPress={() => setToDelete(a)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
        <div className="border-t border-sb-outline-variant/40 px-4 py-2.5 text-[11px] text-sb-on-surface-variant">
          {list.length} {list.length === 1 ? "persona" : "personas"} del personal
        </div>
      </Card>
      </>}

      {/* Crear */}
      <Sheet open={create.isOpen} onClose={create.close} size="lg" icon={role === "dealer" ? Store : role === "viewer" ? Eye : UserPlus} title={role === "dealer" ? `Nueva cuenta para un cliente de ${consortium ? short(consortium.name) : "el consorcio"}` : role === "viewer" ? `Nueva cuenta del personal de ${consortium ? short(consortium.name) : "el consorcio"}` : ROLE_TITLE[role]} onSubmit={submit} busy={saving}
        sub={role === "dealer" || role === "viewer" ? "Elige para quién es la cuenta. El usuario y la contraseña se arman solos." : "Elige el tipo de cuenta, su nombre y su área. El usuario y la contraseña se arman solos."}
        summary={name.trim() ? <>Se creará <b className="text-sb-on-surface">{name.trim()}</b> · {ROLE_LABEL[role]} · usuario <b className="font-mono text-sb-on-surface">{shownEmail || "…"}</b></> : "Escribe el nombre para ver cómo quedará la cuenta."}
        footer={<>
          <Button variant="secondary" className="rounded-full" onPress={create.close}>Cancelar</Button>
          <Button type="submit" variant="primary" className="rounded-full" isDisabled={saving}>{saving ? "Creando…" : "Crear cuenta"}</Button>
        </>}>
                  {role === "operator" || role === "admin" ? (
                    <ChoiceCards id="new-role" columns={2} value={role} onChange={(v) => setRole(v as NewRole)} options={[
                      { key: "operator", label: "Encargado de etapa", desc: ROLE_HELP.operator, icon: ListChecks },
                      { key: "admin", label: "Supervisor", desc: ROLE_HELP.admin, icon: ShieldCheck },
                    ]} />
                  ) : (
                    <>
                      {consortia.length > 1 && (
                        <label className="flex flex-col gap-1.5 text-sm">
                          <Label>Consorcio</Label>
                          <SoftSelect value={String(consortium?.id ?? "")} onChange={(e) => setConsortiumId(Number(e.target.value))} aria-label="Consorcio" className="h-9 w-full rounded-xl text-sm">
                            {consortia.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </SoftSelect>
                        </label>
                      )}
                      <ChoiceCards id="new-client-role" columns={2} value={role} onChange={(v) => setRole(v as NewRole)} options={[
                        { key: "dealer", label: `Cliente de ${consortium ? short(consortium.name) : "el consorcio"}`, desc: `Para un cliente de ${consortium ? short(consortium.name) : "el consorcio"} (uno de sus distribuidores o tiendas). Ve solo las unidades de sus tiendas.`, icon: Store },
                        { key: "viewer", label: `Personal de ${consortium ? short(consortium.name) : "el consorcio"}`, desc: `Para alguien del equipo de ${consortium ? short(consortium.name) : "el consorcio"} mismo. Ve en solo lectura; no es uno de sus clientes.`, icon: Eye },
                      ]} />
                      {/* De quién es la cuenta: la jerarquía completa */}
                      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-sb-surface-container-low px-3.5 py-2.5 text-[12px]">
                        <span className="text-sb-on-surface-variant">La cuenta quedará en:</span>
                        <b>{myCompany}</b><ChevronRight className="h-3.5 w-3.5 text-sb-on-surface-variant" />
                        <b>{consortium?.name ?? "Consorcio"}</b><ChevronRight className="h-3.5 w-3.5 text-sb-on-surface-variant" />
                        <b className="text-sb-primary">{role === "dealer" ? (dealerId || "su cliente") : "su personal"}</b>
                      </div>
                    </>
                  )}
                  {role === "dealer" && (
                    <label className="flex flex-col gap-1.5 text-sm">
                      <Label>¿Qué cliente de {consortium ? short(consortium.name) : "el consorcio"} es?</Label>
                      <SoftSelect required value={dealerId} onChange={(e) => setDealerId(e.target.value)} aria-label="Cliente"
                        className="h-9 rounded-xl border border-sb-outline-variant bg-sb-surface-container-low px-2 text-sm outline-none focus:border-sb-primary">
                        <option value="">Elige el cliente…</option>
                        {clientList.map(([c, n]) => <option key={c} value={c}>{c} · {n} {n === 1 ? "tienda" : "tiendas"}</option>)}
                      </SoftSelect>
                    </label>
                  )}
                  <p className="text-xs text-muted">El correo y la contraseña se autocompletan; puedes editarlos.</p>
                  <TextField value={name} onChange={setName} isRequired>
                    <Label>Nombre completo</Label>
                    <Input placeholder="Ej. Juan Pérez" />
                  </TextField>
                  <TextField type="email" value={shownEmail} onChange={(v) => { setEmailEdited(true); setEmail(v); }} isRequired>
                    <Label>Usuario para entrar</Label>
                    <Input placeholder={`stelozano.almacenpcl@${USER_DOMAIN}`} />
                    <Description>
                      {emailEdited
                        ? "Escrito a mano."
                        : "Se arma solo: 3 letras del nombre + apellido + su área. Puedes cambiarlo."}
                    </Description>
                  </TextField>
                  <Switch size="sm" isSelected={auto} onChange={(v) => { setAuto(v); setPassword(v ? genPassword() : ""); }}>
                    <Switch.Content className="cursor-pointer gap-2">
                      <Switch.Control><Switch.Thumb /></Switch.Control>
                      Generar contraseña automáticamente
                    </Switch.Content>
                  </Switch>
                  <div className="flex items-end gap-2">
                    <TextField className="flex-1" type={auto || showPw ? "text" : "password"} value={password} onChange={setPassword} isReadOnly={auto} isRequired minLength={8}>
                      <Label>Contraseña</Label>
                      <span className="relative block">
                        <Input className={cn("w-full pr-11", (auto || showPw) && "font-mono")} />
                        {!auto && (
                          <button type="button" tabIndex={-1} onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Ocultar contraseña" : "Ver contraseña"}
                            className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full opacity-50 hover:opacity-100">
                            {showPw ? <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <Eye className="h-[18px] w-[18px]" strokeWidth={1.75} />}
                          </button>
                        )}
                      </span>
                    </TextField>
                    {auto && <Button variant="secondary" className="rounded-full" onPress={() => setPassword(genPassword())}>Otra</Button>}
                  </div>
                  {!auto && <PasswordMeter value={password} email={shownEmail} name={name} />}
                  {role === "operator" && (
                    <div className="flex flex-col gap-1.5">
                      <Label>Área de trabajo</Label>
                      <AreaPicker value={asg} onChange={setAsg} carriers={carriers} />
                    </div>
                  )}
      </Sheet>

      {/* Etapas de un encargado */}
      <Sheet open={!!editStages} onClose={() => setEditStages(null)} size="lg" icon={ListChecks} title={`Área de ${editStages?.name ?? ""}`}
        sub="El cambio aplica al instante en su pantalla «Mi trabajo»."
        summary={draftAsg.area ? <>Quedará en <b className="text-sb-on-surface">{areaOf(draftAsg.area)?.label ?? "Personalizado"}</b>{draftAsg.stages.length ? ` · ${draftAsg.stages.length} etapas` : ""}</> : null}
        footer={<>
          <Button variant="secondary" className="rounded-full" onPress={() => setEditStages(null)}>Cancelar</Button>
          <Button variant="primary" className="rounded-full" onPress={saveStages}>Guardar</Button>
        </>}>
        <AreaPicker key={editStages?.id ?? 0} value={draftAsg} onChange={setDraftAsg} carriers={carriers} />
      </Sheet>

      {/* Eliminar */}
      <ConfirmDialog open={!!toDelete} title={`¿Eliminar a ${toDelete?.name ?? ""}?`} confirmLabel="Sí, eliminar"
        onCancel={() => setToDelete(null)} onConfirm={() => toDelete && remove(toDelete)}>
        <b className="text-sb-on-surface">{toDelete?.email}</b> perderá el acceso de inmediato, aunque tenga la sesión abierta.
      </ConfirmDialog>
    </div>
  );
}

/** Nombre corto del consorcio para frases («Honda Selva del Perú (HSP)» → «Honda») */
const short = (n: string) => n.split(/[\s(]/)[0] || n;

/** Bloque dentro de un consorcio: su personal o sus clientes, con una línea que explica quiénes son */
function ClientBlock({ title, hint, rows, empty, render }: { title: string; hint: string; rows: Admin[]; empty: string; render: (a: Admin) => React.ReactNode }) {
  return (
    <div className="border-t border-sb-outline-variant/50">
      <div className="flex items-baseline gap-2 px-5 pb-1 pt-3.5">
        <h4 className="text-[13px] font-semibold">{title}</h4>
        <span className="rounded-full bg-sb-surface-container px-1.5 text-[11px] tabular-nums text-sb-on-surface-variant">{rows.length}</span>
      </div>
      <p className="px-5 pb-2 text-[11.5px] text-sb-on-surface-variant">{hint}</p>
      <div className="flex flex-col pb-2">{rows.length ? rows.map(render) : <p className="px-5 pb-3 text-[12px] text-sb-on-surface-variant opacity-70">{empty}</p>}</div>
    </div>
  );
}

/** Fila de una cuenta de cliente: quién es, de quién es cliente, qué ve y sus acciones */
function ClientRow({ a, kind, consortium, onCopy, onReset, onDelete }: { a: Admin; kind: "staff" | "client"; consortium: string; onCopy: () => void; onReset: () => void; onDelete: () => void }) {
  return (
    <div className="group flex flex-wrap items-center gap-3 px-5 py-2.5 transition-colors hover:bg-sb-surface-container-low">
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[11px] font-bold", kind === "client" ? "bg-sb-primary-soft text-sb-primary" : "bg-sb-surface-container text-sb-on-surface-variant")}>{initials(a.name)}</span>
      <span className="min-w-0 flex-1 basis-56">
        <span className="flex items-center gap-2 text-[13px] font-medium">{a.name}{!!Number(a.online) && <span className="h-2 w-2 rounded-full bg-sb-primary" title="En línea" />}</span>
        <span className="block truncate text-[11.5px] text-sb-on-surface-variant">{a.email}</span>
      </span>
      <span className="min-w-0 flex-1 basis-56 text-[12px]">
        {kind === "client" ? (
          <>
            <b className="font-medium">{a.client ?? a.dealer ?? "Sin cliente"}</b>
            <span className="block text-[11px] text-sb-on-surface-variant">Cliente de {consortium} · {a.client ? `${a.client_stores ?? 0} ${Number(a.client_stores) === 1 ? "tienda" : "tiendas"}` : "una tienda"} · ve solo lo suyo</span>
          </>
        ) : (
          <>
            <b className="font-medium">{Number(a.is_owner) ? "Cuenta principal" : "Solo lectura"}</b>
            <span className="block text-[11px] text-sb-on-surface-variant">Personal de {consortium} · ve todo sin cambiar nada</span>
          </>
        )}
      </span>
      <span className="hidden w-32 shrink-0 text-[11px] tabular-nums text-sb-on-surface-variant lg:block">{a.created_at}</span>
      <span className="flex shrink-0 items-center gap-1">
        <Button isIconOnly size="sm" variant="tertiary" aria-label={`Copiar correo de ${a.name}`} onPress={onCopy}><Copy className="h-4 w-4" /></Button>
        <Button isIconOnly size="sm" variant="tertiary" aria-label={`Restablecer contraseña de ${a.name}`} onPress={onReset}><KeyRound className="h-4 w-4" /></Button>
        <Button isIconOnly size="sm" variant="danger-soft" aria-label={`Eliminar ${a.name}`} onPress={onDelete}><Trash2 className="h-4 w-4" /></Button>
      </span>
    </div>
  );
}
