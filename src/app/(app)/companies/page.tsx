"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Modal, toast } from "@heroui/react";
import { Building2, Copy, Eye, Globe, MapPin, Pencil, Phone, Plus, ShieldCheck, Trash2, Truck, UserPlus } from "lucide-react";
import { Card, CodeTag, PageTitle, Pill } from "@/components/ui";
import { ROLE_LABEL, companyCode, suggestEmail, type Role } from "@/lib/workflow";
import { LogoBadge, LogoPicker } from "@/components/CompanyLogo";
import { DEFAULT_COLOR, PRESETS, onColor } from "@/lib/theme";
import { useRouter } from "next/navigation";


type Stats = { units: number; delivered: number; onTime: number; open: number } | null;
type User = { id: number; name: string; email: string; role: Role; online: number };
type Company = {
  id: number; name: string; kind: "transport" | "client"; parent_id: number | null; parent: string | null; logo_v: string | null; color: string | null; owner_id: number | null; ruc: string | null; members: string | null; address: string | null;
  phone: string | null; email: string | null; website: string | null; notes: string | null; created_at: string; stats: Stats; users: User[];
};
type Form = Record<"name" | "kind" | "parent_id" | "color" | "ruc" | "members" | "address" | "phone" | "email" | "website" | "notes", string>;

const EMPTY: Form = { name: "", kind: "transport", parent_id: "", color: "", ruc: "", members: "", address: "", phone: "", email: "", website: "", notes: "" };
const KIND = {
  transport: { label: "Transportista · dueña del sistema", desc: "Sus cuentas son supervisores: ven todo, corrigen fechas y crean encargados y cuentas de dealers.", role: "admin" as const },
  client: { label: "Cliente · solo lectura", desc: "Sus cuentas ven el dashboard, las alertas y las unidades en vivo, sin poder cambiar nada.", role: "viewer" as const },
};
const input = "h-9 w-full rounded-xl border border-sb-outline-variant bg-sb-surface-container-low px-3 text-sm text-sb-on-surface outline-none transition-colors focus:border-sb-primary";

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  return Array.from(crypto.getRandomValues(new Uint32Array(14)), (n) => chars[n % chars.length]).join("");
}
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-xs ${wide ? "sm:col-span-2" : ""}`}>
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-sb-on-surface-variant/70">{hint}</span>}
    </label>
  );
}

export default function CompaniesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Company[] | null>(null);
  const [carriers, setCarriers] = useState<{ v: string; n: number }[]>([]);
  // Empresa: crear (id 0) o editar
  const [edit, setEdit] = useState<{ id: number; form: Form } | null>(null);
  const [saving, setSaving] = useState(false);
  // Cuenta nueva para una empresa
  const [acc, setAcc] = useState<{ company: Company; name: string; email: string; password: string; edited: boolean } | null>(null);
  const [toDelete, setToDelete] = useState<Company | null>(null);
  // SWM Labs (dev) ve todas las empresas; el supervisor de la transportista, su empresa y sus consorcios
  const [mine, setMine] = useState<number | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const dev = role === "dev";

  const load = useCallback(() => fetch("/api/companies").then((r) => r.json()).then((d) => { setRows(d.companies); setCarriers(d.carriers); setMine(d.mine); }), []);
  useEffect(() => { load(); fetch("/api/me").then((r) => r.json()).then((m) => setRole(m.role)); }, [load]);
  const transports = (rows ?? []).filter((c) => c.kind === "transport");
  const canDelete = (c: Company) => dev || (c.parent_id !== null && c.parent_id === mine);
  // Cuentas: en la transportista son supervisores (solo las crea SWM Labs); en un consorcio, de solo lectura
  const canAddAccount = (c: Company) => dev || c.kind === "client";

  const setF = (k: keyof Form, v: string) => edit && setEdit({ ...edit, form: { ...edit.form, [k]: v } });
  const members = useMemo(() => new Set((edit?.form.members ?? "").split(",").map((m) => m.trim().toUpperCase()).filter(Boolean)), [edit?.form.members]);
  const toggleMember = (m: string) => {
    const next = new Set(members);
    if (next.has(m)) next.delete(m); else next.add(m);
    setF("members", [...next].join(", "));
  };

  async function save() {
    if (!edit) return;
    setSaving(true);
    const r = await fetch("/api/companies", {
      method: edit.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: edit.id || undefined, ...edit.form }),
    });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setSaving(false);
    if (!r.ok) return toast.danger(j.error);
    toast.success(edit.id ? "Empresa actualizada" : "Empresa registrada", { description: edit.id ? undefined : "Ahora crea la cuenta de su administrador." });
    const created = !edit.id ? j.id : null;
    setEdit(null);
    await load();
    if (created) {
      const c = (await fetch("/api/companies").then((x) => x.json())).companies.find((x: Company) => x.id === created);
      if (c) openAccount(c);
    }
  }

  const openAccount = (company: Company) => setAcc({ company, name: "", email: "", password: genPassword(), edited: false });
  const accRole = acc ? KIND[acc.company.kind].role : "admin";
  const accEmail = acc ? (acc.edited ? acc.email : suggestEmail(acc.name, accRole)) : "";

  async function createAccount() {
    if (!acc) return;
    setSaving(true);
    const r = await fetch("/api/admins", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: acc.name, email: accEmail, password: acc.password, role: accRole, companyId: acc.company.id }),
    });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setSaving(false);
    if (!r.ok) return toast.danger(j.error);
    await navigator.clipboard?.writeText(`${accEmail} / ${acc.password}`).catch(() => {});
    toast.success(`Cuenta creada para ${acc.company.name}`, { description: `${accEmail} · contraseña: ${acc.password} (copiado)`, timeout: 20000 });
    setAcc(null);
    load();
  }

  /** SWM Labs elige la cuenta principal de la empresa. */
  async function setOwner(c: Company, userId: number) {
    const r = await fetch("/api/companies", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, owner_id: userId }) });
    if (!r.ok) return toast.danger((await r.json().catch(() => ({}))).error ?? "No se pudo cambiar");
    toast.success("Cuenta principal actualizada");
    load();
  }

  async function remove(c: Company) {
    await fetch(`/api/companies?id=${c.id}`, { method: "DELETE" });
    toast.success("Empresa eliminada", { description: "Sus cuentas siguen activas, sin empresa." });
    setToDelete(null);
    load();
  }

  if (!rows) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando empresas…</div>;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title={dev ? "Empresas" : "Consorcios"}
        sub={dev
          ? "SWM Labs · todas las empresas del sistema: la transportista (Consorcio Leyva) y los consorcios que ella creó."
          : "Tu empresa y los consorcios con quienes compartes el sistema (Honda y otros). Sus cuentas solo pueden consultar."}
      >
        <Button size="sm" variant="primary" className="rounded-full" onPress={() => setEdit({ id: 0, form: { ...EMPTY, kind: dev ? "transport" : "client" } })}>
          <Plus className="h-3.5 w-3.5" /> {dev ? "Nueva empresa" : "Nuevo consorcio"}
        </Button>
      </PageTitle>

      {!rows.length && (
        <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Building2 className="h-8 w-8 text-sb-on-surface-variant/40" />
          <p className="text-sm font-medium">Todavía no hay empresas</p>
          <p className="max-w-md text-[12px] text-sb-on-surface-variant">Registra la transportista (por ejemplo, Consorcio Leyva) y crea la cuenta de su administrador. Luego registra a Honda como cliente de solo lectura.</p>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {rows.map((c) => (
          <Card key={c.id} className="flex flex-col gap-4 p-5">
            <div className="flex items-start gap-3">
              {c.logo_v ? <LogoBadge id={c.id} name={c.name} v={c.logo_v} className="h-11 w-11 rounded-xl border border-sb-outline-variant/40" /> : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sb-primary text-sb-on-primary">
                  {c.kind === "transport" ? <Truck className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-tight">
                  <span className="truncate">{c.name}</span>
                  <CodeTag code={companyCode(c.id)} />
                </h3>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Pill active>{c.id === mine ? "Tu empresa" : KIND[c.kind].label}</Pill>
                  {c.color && <span className="h-5 w-5 rounded-full border border-white shadow" style={{ background: c.color }} title={`Color de su sistema: ${c.color}`} />}
                  {c.parent && <Pill>Creado por {c.parent}</Pill>}
                  {c.ruc && <Pill>RUC {c.ruc}</Pill>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button aria-label={`Editar ${c.name}`} className="rounded-full p-2 opacity-60 hover:bg-sb-surface-container hover:opacity-100"
                  onClick={() => setEdit({ id: c.id, form: Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (c[k as keyof Company] as string | null) ?? ""])) as Form })}>
                  <Pencil className="h-4 w-4" />
                </button>
                {canDelete(c) && (
                  <button aria-label={`Eliminar ${c.name}`} className="rounded-full p-2 opacity-40 hover:bg-sb-surface-container hover:opacity-100" onClick={() => setToDelete(c)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1 text-[12px] text-sb-on-surface-variant">
              {c.address && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{c.address}</span>}
              {(c.phone || c.email) && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{[c.phone, c.email].filter(Boolean).join(" · ")}</span>}
              {c.website && <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />{c.website}</span>}
              {c.notes && <span className="mt-1 text-sb-on-surface/70">{c.notes}</span>}
            </div>

            {c.kind === "transport" && (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-sb-on-surface-variant/60">Transportistas del grupo</span>
                <div className="flex flex-wrap gap-1.5">
                  {c.members ? c.members.split(",").map((m) => <Pill key={m}>{m.trim()}</Pill>) : <span className="text-[12px] text-sb-on-surface-variant">Sin transportistas asociados (edita la empresa para elegirlos).</span>}
                </div>
                {c.stats && c.stats.units > 0 && (
                  <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-sb-outline-variant/30 sm:grid-cols-4">
                    {[
                      ["Unidades llevadas", c.stats.units.toLocaleString()],
                      ["Entregadas", c.stats.delivered.toLocaleString()],
                      ["En camino", c.stats.open.toLocaleString()],
                      ["A tiempo", `${pct(c.stats.onTime, c.stats.units)} %`],
                    ].map(([k, v]) => (
                      <div key={k} className="bg-sb-surface-container-low px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant/60">{k}</p>
                        <p className="text-base font-bold">{v}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-sb-on-surface-variant/60">Cuentas ({c.users.length})</span>
                {canAddAccount(c) && (
                  <Button size="sm" variant="secondary" className="rounded-full" onPress={() => openAccount(c)}>
                    <UserPlus className="h-3.5 w-3.5" /> {c.kind === "transport" ? "Agregar administrador" : "Agregar cuenta"}
                  </Button>
                )}
              </div>
              {c.users.length ? (
                <div className="flex flex-col">
                  {c.users.map((u) => (
                    <div key={u.id} className="flex items-center gap-2 border-b border-sb-outline-variant/25 py-2 text-xs last:border-0">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${Number(u.online) ? "bg-emerald-500" : "bg-sb-surface-container-highest"}`} title={Number(u.online) ? "En línea" : "Desconectado"} />
                      <span className="min-w-0 flex-1 truncate"><b className="font-medium">{u.name}</b> <span className="text-sb-on-surface-variant">· {u.email}</span></span>
                      {u.id === c.owner_id ? (
                        <CodeTag code={companyCode(c.id)} />
                      ) : (
                        <>
                          {dev && c.kind === "transport" && u.role === "admin" && (
                            <button className="rounded-full px-2 py-0.5 text-[10px] text-sb-on-surface-variant hover:bg-sb-surface-container hover:text-sb-on-surface"
                              title="Que esta sea la cuenta de la empresa (se muestra como «Empresa»)" onClick={() => setOwner(c, u.id)}>
                              Hacer principal
                            </button>
                          )}
                          <Pill>{ROLE_LABEL[u.role]}</Pill>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-sb-on-surface-variant">Sin cuentas todavía.</p>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Crear / editar empresa */}
      <Modal>
        <Modal.Backdrop isOpen={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
          <Modal.Container size="lg">
            <Modal.Dialog>
              <Modal.CloseTrigger aria-label="Cerrar" />
              <Modal.Header><Modal.Heading>{edit?.id ? "Editar datos" : dev ? "Nueva empresa" : "Nuevo consorcio"}</Modal.Heading></Modal.Header>
              {edit && (
                <Modal.Body className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto p-1">
                  {edit.id ? (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium">Foto de perfil</span>
                      <LogoPicker id={edit.id} name={edit.form.name || "Empresa"} v={rows.find((x) => x.id === edit.id)?.logo_v}
                        onChange={() => { load(); router.refresh(); }} />
                      <span className="text-[11px] text-sb-on-surface-variant/70">Se ve en el menú de todas sus cuentas. Cuadrada se ve mejor; se reduce sola a 256 px.</span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-sb-on-surface-variant/70">Podrás subir su foto de perfil después de registrarla (botón ✎ de la tarjeta).</p>
                  )}
                  {dev ? <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium">Tipo</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(KIND) as (keyof typeof KIND)[]).map((k) => (
                        <button key={k} type="button" className={`sbf-chip ${edit.form.kind === k ? "active" : ""}`} onClick={() => setF("kind", k)}>{KIND[k].label}</button>
                      ))}
                    </div>
                    <p className="text-[11px] text-sb-on-surface-variant/70">{KIND[edit.form.kind as keyof typeof KIND].desc}</p>
                    {edit.form.kind === "client" && transports.length > 0 && (
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="font-medium">Consorcio de</span>
                        <select className={input} value={edit.form.parent_id} onChange={(e) => setF("parent_id", e.target.value)} aria-label="Transportista dueña">
                          <option value="">— Ninguna —</option>
                          {transports.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </label>
                    )}
                  </div> : (
                    <p className="text-[12px] text-sb-on-surface-variant">{edit.id === mine ? "Datos de contacto de tu empresa." : KIND.client.desc}</p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Color de su sistema" wide hint="Sus cuentas ven el sistema con este color (botones, menú y opciones activas). Ej.: Leyva verde, Honda rojo.">
                      <div className="flex flex-wrap items-center gap-2">
                        {PRESETS.map((p) => (
                          <button key={p.color} type="button" title={p.name} aria-label={p.name} onClick={() => setF("color", p.color)}
                            className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${edit.form.color === p.color ? "border-sb-on-surface ring-2 ring-sb-on-surface/20" : "border-white shadow"}`}
                            style={{ background: p.color }} />
                        ))}
                        <label className="flex items-center gap-1.5 text-[11px] text-sb-on-surface-variant">
                          <input type="color" value={edit.form.color || DEFAULT_COLOR} onChange={(e) => setF("color", e.target.value)} aria-label="Otro color" className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent" />
                          Otro
                        </label>
                        <span className="ml-auto rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: edit.form.color || DEFAULT_COLOR, color: onColor(edit.form.color || DEFAULT_COLOR) }}>Así se ven sus botones</span>
                      </div>
                    </Field>
                    <Field label="Nombre" wide><input className={input} value={edit.form.name} onChange={(e) => setF("name", e.target.value)} placeholder="Consorcio Leyva" autoFocus /></Field>
                    <Field label="RUC" hint="11 dígitos (opcional)"><input className={input} inputMode="numeric" maxLength={11} value={edit.form.ruc} onChange={(e) => setF("ruc", e.target.value.replace(/\D/g, ""))} /></Field>
                    <Field label="Teléfono"><input className={input} value={edit.form.phone} onChange={(e) => setF("phone", e.target.value)} /></Field>
                    <Field label="Dirección" wide><input className={input} value={edit.form.address} onChange={(e) => setF("address", e.target.value)} /></Field>
                    <Field label="Correo de contacto"><input className={input} type="email" value={edit.form.email} onChange={(e) => setF("email", e.target.value)} /></Field>
                    <Field label="Sitio web"><input className={input} value={edit.form.website} onChange={(e) => setF("website", e.target.value)} /></Field>
                    {dev && edit.form.kind === "transport" && (
                      <Field label="Transportistas del grupo" wide hint="Toca los nombres tal como aparecen en la columna «Tramo final» del Excel. Sirve para ver cuántas unidades llevó la empresa y su % a tiempo.">
                        <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-sb-outline-variant/50 p-2">
                          {carriers.map((c) => (
                            <button key={c.v} type="button" className={`sbf-chip ${members.has(c.v) ? "active" : ""}`} onClick={() => toggleMember(c.v)}>
                              {c.v} <span className="opacity-60">({c.n.toLocaleString()})</span>
                            </button>
                          ))}
                        </div>
                      </Field>
                    )}
                    <Field label="Notas" wide><textarea className={`${input} h-auto py-2`} rows={2} value={edit.form.notes} onChange={(e) => setF("notes", e.target.value)} /></Field>
                  </div>
                </Modal.Body>
              )}
              <Modal.Footer>
                <Button variant="secondary" className="rounded-full" onPress={() => setEdit(null)}>Cancelar</Button>
                <Button variant="primary" className="rounded-full" isDisabled={saving || !edit?.form.name.trim()} onPress={save}>
                  {saving ? "Guardando…" : edit?.id ? "Guardar cambios" : dev ? "Registrar empresa" : "Crear consorcio"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Cuenta nueva de una empresa */}
      <Modal>
        <Modal.Backdrop isOpen={!!acc} onOpenChange={(o) => !o && setAcc(null)}>
          <Modal.Container size="md">
            <Modal.Dialog>
              <Modal.CloseTrigger aria-label="Cerrar" />
              <Modal.Header><Modal.Heading>Cuenta para {acc?.company.name}</Modal.Heading></Modal.Header>
              {acc && (
                <Modal.Body className="flex flex-col gap-3 p-1">
                  <div className="flex items-start gap-2 rounded-xl bg-sb-surface-container-low px-3 py-2 text-[12px] text-sb-on-surface-variant">
                    {accRole === "admin" ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <Eye className="mt-0.5 h-4 w-4 shrink-0" />}
                    <span><b className="text-sb-on-surface">{ROLE_LABEL[accRole]}.</b> {KIND[acc.company.kind].desc}</span>
                  </div>
                  <Field label="Nombre completo"><input className={input} value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} autoFocus autoComplete="off" /></Field>
                  <Field label="Usuario para entrar" hint="Se arma solo con el nombre; puedes cambiarlo.">
                    <input className={input} value={accEmail} onChange={(e) => setAcc({ ...acc, email: e.target.value, edited: true })} autoComplete="off" />
                  </Field>
                  <Field label="Contraseña" hint="Se copia junto con el usuario al crear la cuenta.">
                    <div className="flex gap-2">
                      <input className={`${input} font-mono`} value={acc.password} onChange={(e) => setAcc({ ...acc, password: e.target.value })} autoComplete="off" />
                      <Button isIconOnly variant="secondary" className="rounded-full" aria-label="Copiar contraseña" onPress={() => navigator.clipboard?.writeText(acc.password)}><Copy className="h-4 w-4" /></Button>
                    </div>
                  </Field>
                </Modal.Body>
              )}
              <Modal.Footer>
                <Button variant="secondary" className="rounded-full" onPress={() => setAcc(null)}>Cancelar</Button>
                <Button variant="primary" className="rounded-full" isDisabled={saving || !acc?.name.trim() || (acc?.password.length ?? 0) < 8} onPress={createAccount}>
                  {saving ? "Creando…" : "Crear cuenta"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Eliminar empresa */}
      <Modal>
        <Modal.Backdrop isOpen={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.CloseTrigger aria-label="Cerrar" />
              <Modal.Header><Modal.Heading>Eliminar empresa</Modal.Heading></Modal.Header>
              <Modal.Body className="p-1 text-sm">
                ¿Eliminar <b>{toDelete?.name}</b>? Sus {toDelete?.users.length ?? 0} cuentas siguen activas, pero sin empresa. Para quitarles el acceso, elimínalas en Usuarios.
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
