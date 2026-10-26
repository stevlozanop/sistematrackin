"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, Button, Chip, Description, Input, Label, Modal, Switch, Table, TextField, toast, useOverlayState } from "@heroui/react";
import type { Selection, SortDescriptor } from "@heroui/react";
import { Copy, Eye, KeyRound, Store, ListChecks, Plus, Radio, Search, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { Card, CodeTag, PageTitle } from "@/components/ui";
import { StatGrid } from "@/components/StatCard";
import { Check } from "@/components/Check";
import { AreaPicker, type Assignment } from "@/components/AreaPicker";
import { DealerAccounts } from "@/components/DealerAccounts";
import { ROLE_LABEL, USER_DOMAIN, companyCode, roleLabel, areaOf, stageLabel, suggestEmail, type Role, type Stage } from "@/lib/workflow";

type Admin = {
  id: number; name: string; email: string; role: Exclude<Role, "dev">; created_at: string; last_seen: string | null; online: number;
  stages: Stage[]; area: string | null; carrier: string | null; can_import: number; company: string | null; dealer: string | null; is_owner?: number; company_id?: number | null; company_kind?: string | null;
  client?: string | null; client_stores?: number;
};
type NewRole = "operator" | "admin" | "viewer" | "dealer";

/** Qué puede hacer cada tipo de cuenta (se muestra al crearla). */
const ROLE_HELP: Record<NewRole, string> = {
  operator: "Registra solo las fechas de su área, en orden. Entra directo a «Mi trabajo».",
  admin: "Ve todo (dashboard, en vivo), carga el Excel, corrige fechas y crea encargados y cuentas de clientes.",
  viewer: "Ve el dashboard, las alertas y las unidades en vivo, sin poder cambiar nada. Para Honda u otro cliente.",
  dealer: "Cliente de Honda (SORSA, CREDIVARGAS…): ve las unidades de todas sus tiendas, en qué etapa van y si llegan a tiempo. No ve otros clientes ni puede cambiar nada.",
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

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  const a = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(a, (n) => chars[n % chars.length]).join("");
}

const copy = (text: string, msg: string) => navigator.clipboard?.writeText(text).then(() => toast.success(msg)).catch(() => toast.danger("No se pudo copiar"));

export default function AdminsPage() {
  const [rows, setRows] = useState<Admin[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Selection>(new Set());
  const [sort, setSort] = useState<SortDescriptor>({ column: "created_at", direction: "descending" });
  const create = useOverlayState();
  const [bulkDealers, setBulkDealers] = useState(false);
  const [toDelete, setToDelete] = useState<Admin | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailEdited, setEmailEdited] = useState(false);
  const [auto, setAuto] = useState(true);
  const [password, setPassword] = useState(() => genPassword());
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<NewRole>("operator");
  const [dealers, setDealers] = useState<{ id: number; name: string; client: string | null }[]>([]);
  const [dealerId, setDealerId] = useState(""); // aquí guarda el cliente elegido
  // Clientes de Honda con sus tiendas, para elegir a quién es la cuenta
  const clientList = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of dealers) if (d.client) m.set(d.client, (m.get(d.client) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [dealers]);
  const emptyAsg: Assignment = { area: "", stages: [], carrier: "", canImport: true };
  const [asg, setAsg] = useState<Assignment>(emptyAsg);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [editStages, setEditStages] = useState<Admin | null>(null);
  const [draftAsg, setDraftAsg] = useState<Assignment>(emptyAsg);
  useEffect(() => {
    fetch("/api/admins?carriers=1").then((r) => r.ok && r.json()).then((c) => c && setCarriers(c));
    fetch("/api/dealers").then((r) => r.ok && r.json()).then((d) => d && setDealers(d));
  }, []);

  const load = useCallback(() => fetch("/api/admins").then((r) => r.json()).then(setRows), []);
  useEffect(() => { load(); }, [load]);

  // Se arma con el nombre y el área (o rol): ej. stelozano.almacenpcl@trackin.pe
  const suggested = useMemo(() => suggestEmail(name, role, asg.area), [name, role, asg.area]);
  const shownEmail = emailEdited ? email : suggested;

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const col = String(sort.column) as keyof Admin;
    return rows
      .filter((a) => !t || a.name.toLowerCase().includes(t) || a.email.toLowerCase().includes(t))
      .sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (sort.direction === "descending" ? -1 : 1));
  }, [rows, q, sort]);

  const online = rows.filter((a) => Number(a.online)).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (role === "operator" && !asg.area) return toast.danger("Elige el área del encargado");
    if (role === "dealer" && !dealerId) return toast.danger("Elige el cliente");
    setSaving(true);
    const r = await fetch("/api/admins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email: shownEmail, password, role, client: role === "dealer" ? dealerId : undefined, ...(role === "operator" ? asg : {}) }) });
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
    if (!r.ok) return toast.danger("No se pudo restablecer");
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

  const stats = [
    { label: "Encargados", value: rows.filter((a) => a.role === "operator").length, icon: Users },
    { label: "Supervisores", value: rows.filter((a) => a.role === "admin").length, icon: ShieldCheck },
    { label: "Dealers y solo lectura", value: rows.filter((a) => a.role === "dealer" || a.role === "viewer").length, icon: Eye },
    { label: "En línea ahora", value: online, icon: Radio },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Usuarios" sub="Encargados registran las fechas de su área. Supervisores ven y corrigen todo. Dealers y cuentas de solo lectura (Honda) solo consultan.">
        <Button size="sm" variant="secondary" className="rounded-full" onPress={() => setBulkDealers(true)}>
          <Store className="h-3.5 w-3.5" /> Cuentas de clientes
        </Button>
        <Button size="sm" variant="primary" className="rounded-full" onPress={() => { setRole("operator"); setAsg(emptyAsg); create.open(); }}>
          <Plus className="h-3.5 w-3.5" /> Nuevo usuario
        </Button>
      </PageTitle>
      <DealerAccounts open={bulkDealers} onClose={() => setBulkDealers(false)} onCreated={load} />

      <StatGrid className="grid-cols-2 lg:grid-cols-4" items={stats} />

      <label className="sbf-search md:w-96">
        <Search className="h-4 w-4 opacity-40" />
        <input placeholder="Buscar por nombre o correo…" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button type="button" onClick={() => setQ("")} className="opacity-40 hover:opacity-100"><X className="h-4 w-4" /></button>}
      </label>

      {/* Celular: tarjetas */}
      <div className="flex flex-col gap-2 md:hidden">
        {!list.length && <Card className="px-4 py-10 text-center text-sm text-sb-on-surface-variant/60">{q ? "Sin resultados." : "Aún no hay usuarios. Crea el primer encargado."}</Card>}
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
              {Number(a.is_owner) && a.company_id ? <CodeTag code={companyCode(a.company_id, a.company_kind)} /> : <Chip size="sm" variant={a.role === "admin" ? "secondary" : "soft"}>{roleLabel(a.role)}</Chip>}
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
            <Table.Content aria-label="Usuarios" className="min-w-[900px]" selectionMode="multiple" selectedKeys={selected} onSelectionChange={setSelected} sortDescriptor={sort} onSortChange={setSort}>
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
                    <Table.Cell>{Number(a.is_owner) && a.company_id ? <CodeTag code={companyCode(a.company_id, a.company_kind)} /> : <Chip size="sm" variant={a.role === "admin" ? "secondary" : "soft"}>{roleLabel(a.role)}</Chip>}</Table.Cell>
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
          {list.length} usuario{list.length === 1 ? "" : "s"}
        </div>
      </Card>

      {/* Crear */}
      <Modal>
        <Modal.Backdrop isOpen={create.isOpen} onOpenChange={create.setOpen}>
          <Modal.Container size="lg">
            <Modal.Dialog>
              <form onSubmit={submit} className="contents">
                <Modal.CloseTrigger aria-label="Cerrar" /><Modal.Header>
                  <Modal.Heading>{ROLE_TITLE[role]}</Modal.Heading>
                </Modal.Header>
                <Modal.Body className="flex flex-col gap-4 p-1">
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className={`sbf-chip ${role === "operator" ? "active" : ""}`} onClick={() => setRole("operator")}>Encargado de etapa</button>
                    <button type="button" className={`sbf-chip ${role === "dealer" ? "active" : ""}`} onClick={() => setRole("dealer")}>Cliente de Honda</button>
                    <button type="button" className={`sbf-chip ${role === "viewer" ? "active" : ""}`} onClick={() => setRole("viewer")}>Solo lectura (Honda)</button>
                    <button type="button" className={`sbf-chip ${role === "admin" ? "active" : ""}`} onClick={() => setRole("admin")}>Supervisor</button>
                  </div>
                  <p className="-mt-2 text-xs text-muted">{ROLE_HELP[role]}</p>
                  {role === "dealer" && (
                    <label className="flex flex-col gap-1.5 text-sm">
                      <Label>Cliente</Label>
                      <select required value={dealerId} onChange={(e) => setDealerId(e.target.value)} aria-label="Cliente"
                        className="h-9 rounded-xl border border-sb-outline-variant bg-sb-surface-container-low px-2 text-sm outline-none focus:border-sb-primary">
                        <option value="">Elige el cliente…</option>
                        {clientList.map(([c, n]) => <option key={c} value={c}>{c} · {n} {n === 1 ? "tienda" : "tiendas"}</option>)}
                      </select>
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
                    <TextField className="flex-1" type={auto ? "text" : "password"} value={password} onChange={setPassword} isReadOnly={auto} isRequired minLength={8}>
                      <Label>Contraseña</Label>
                      <Input className={auto ? "font-mono" : ""} />
                    </TextField>
                    {auto && <Button variant="secondary" className="rounded-full" onPress={() => setPassword(genPassword())}>Otra</Button>}
                  </div>
                  {role === "operator" && (
                    <div className="flex flex-col gap-1.5">
                      <Label>Área de trabajo</Label>
                      <AreaPicker value={asg} onChange={setAsg} carriers={carriers} />
                    </div>
                  )}
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="secondary" className="rounded-full" onPress={create.close}>Cancelar</Button>
                  <Button type="submit" variant="primary" className="rounded-full" isDisabled={saving}>{saving ? "Creando…" : "Crear cuenta"}</Button>
                </Modal.Footer>
              </form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Etapas de un encargado */}
      <Modal>
        <Modal.Backdrop isOpen={!!editStages} onOpenChange={(o) => !o && setEditStages(null)}>
          <Modal.Container size="lg">
            <Modal.Dialog>
              <Modal.CloseTrigger aria-label="Cerrar" /><Modal.Header><Modal.Heading>Área de {editStages?.name}</Modal.Heading></Modal.Header>
              <Modal.Body className="flex flex-col gap-3 p-1">
                <p className="text-xs text-muted">El cambio aplica al instante en su pantalla «Mi trabajo».</p>
                <AreaPicker key={editStages?.id ?? 0} value={draftAsg} onChange={setDraftAsg} carriers={carriers} />
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" className="rounded-full" onPress={() => setEditStages(null)}>Cancelar</Button>
                <Button variant="primary" className="rounded-full" onPress={saveStages}>Guardar</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Eliminar */}
      <Modal>
        <Modal.Backdrop isOpen={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.CloseTrigger aria-label="Cerrar" /><Modal.Header><Modal.Heading>Eliminar usuario</Modal.Heading></Modal.Header>
              <Modal.Body className="p-1 text-sm">
                ¿Seguro que quieres eliminar a <b>{toDelete?.name}</b> ({toDelete?.email})? Perderá el acceso de inmediato.
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" className="rounded-full" onPress={() => setToDelete(null)}>Cancelar</Button>
                <Button variant="danger" className="rounded-full" onPress={() => toDelete && remove(toDelete)}>Eliminar</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
