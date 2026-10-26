"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Modal, toast } from "@heroui/react";
import { Copy, KeyRound, Trash2, UserPlus } from "lucide-react";
import { Card, Pill } from "@/components/ui";
import { suggestEmail } from "@/lib/workflow";

type Staff = { id: number; name: string; email: string; created_at: string; last_seen: string | null; online: number; is_owner: number };

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => chars[n % chars.length]).join("") + "!";
}
const input = "h-9 w-full rounded-xl border border-sb-outline-variant bg-sb-surface-container-low px-3 text-sm outline-none focus:border-sb-primary";

/**
 * Empleados del consorcio (Honda): sus trabajadores, aparte de sus clientes.
 * Ven todo lo de Honda en solo lectura y sacan reportes. Solo la cuenta principal los crea y administra.
 */
export function ConsortiumStaff() {
  const [data, setData] = useState<{ isOwner: boolean; staff: Staff[] } | null>(null);
  const [form, setForm] = useState<{ name: string; email: string; edited: boolean; password: string } | null>(null);
  const [toDelete, setToDelete] = useState<Staff | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => fetch("/api/consortium-staff").then((r) => (r.ok ? r.json() : null)).then((d) => d && setData(d)), []);
  useEffect(() => { load(); }, [load]);
  const email = useMemo(() => (form ? (form.edited ? form.email : suggestEmail(form.name, "viewer")) : ""), [form]);

  async function create() {
    if (!form) return;
    setSaving(true);
    const r = await fetch("/api/consortium-staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name, email, password: form.password }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setSaving(false);
    if (!r.ok) return toast.danger(j.error);
    await navigator.clipboard?.writeText(`${email} / ${form.password}`).catch(() => {});
    toast.success(`Empleado creado: ${form.name}`, { description: `${email} · ${form.password} (copiado)`, timeout: 20000 });
    setForm(null);
    load();
  }
  async function reset(u: Staff) {
    const pw = genPassword();
    const r = await fetch("/api/consortium-staff", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id, password: pw }) });
    if (!r.ok) return toast.danger((await r.json().catch(() => ({}))).error ?? "No se pudo");
    await navigator.clipboard?.writeText(`${u.email} / ${pw}`).catch(() => {});
    toast.success(`Nueva contraseña para ${u.name}`, { description: `${pw} (copiada)`, timeout: 20000 });
  }
  async function remove(u: Staff) {
    const r = await fetch(`/api/consortium-staff?id=${u.id}`, { method: "DELETE" });
    if (!r.ok) return toast.danger((await r.json().catch(() => ({}))).error ?? "No se pudo");
    toast.success(`${u.name} ya no tiene acceso`);
    setToDelete(null);
    load();
  }

  if (!data) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando empleados…</div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-sb-on-surface-variant">Tus trabajadores: ven todo lo de tu consorcio en solo lectura, sacan reportes y atienden a tus clientes.</p>
        {data.isOwner && (
          <Button size="sm" variant="primary" className="rounded-full" onPress={() => setForm({ name: "", email: "", edited: false, password: genPassword() })}>
            <UserPlus className="h-3.5 w-3.5" /> Nuevo empleado
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        {data.staff.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-2 border-b border-sb-outline-variant/25 px-4 py-2.5 text-xs last:border-0">
            <span className={`h-2 w-2 shrink-0 rounded-full ${Number(u.online) ? "bg-sb-primary" : "bg-sb-surface-container-highest"}`} title={Number(u.online) ? "En línea" : "Desconectado"} />
            <span className="min-w-0 flex-1">
              <b className="font-medium">{u.name}</b> <span className="font-mono text-sb-on-surface-variant">· {u.email}</span>
              <span className="block text-[11px] text-sb-on-surface-variant">Último ingreso: {u.last_seen ?? "nunca"}</span>
            </span>
            {Number(u.is_owner) ? <Pill active>Cuenta principal</Pill> : <Pill>Empleado</Pill>}
            {data.isOwner && !Number(u.is_owner) && (
              <span className="flex gap-1">
                <Button isIconOnly size="sm" variant="tertiary" aria-label={`Copiar usuario de ${u.name}`} onPress={() => navigator.clipboard?.writeText(u.email).then(() => toast.success("Usuario copiado"))}><Copy className="h-4 w-4" /></Button>
                <Button isIconOnly size="sm" variant="tertiary" aria-label={`Nueva contraseña para ${u.name}`} onPress={() => reset(u)}><KeyRound className="h-4 w-4" /></Button>
                <Button isIconOnly size="sm" variant="danger-soft" aria-label={`Quitar acceso a ${u.name}`} onPress={() => setToDelete(u)}><Trash2 className="h-4 w-4" /></Button>
              </span>
            )}
          </div>
        ))}
        {data.staff.length === 1 && <p className="px-4 py-3 text-xs text-sb-on-surface-variant">Todavía no creaste empleados.</p>}
      </Card>

      <Modal>
        <Modal.Backdrop isOpen={!!form} onOpenChange={(o) => !o && setForm(null)}>
          <Modal.Container size="md">
            <Modal.Dialog>
              <Modal.CloseTrigger aria-label="Cerrar" />
              <Modal.Header><Modal.Heading>Nuevo empleado</Modal.Heading></Modal.Header>
              {form && (
                <Modal.Body className="flex flex-col gap-3 p-1">
                  <p className="text-xs text-sb-on-surface-variant">Verá todo lo de tu consorcio en solo lectura (dashboard, unidades, alertas, reportes). No puede crear cuentas.</p>
                  <label className="flex flex-col gap-1 text-xs"><span className="font-medium">Nombre completo</span>
                    <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
                  </label>
                  <label className="flex flex-col gap-1 text-xs"><span className="font-medium">Usuario para entrar</span>
                    <input className={input} value={email} onChange={(e) => setForm({ ...form, email: e.target.value, edited: true })} />
                    <span className="text-[11px] text-sb-on-surface-variant">Se arma solo con el nombre; puedes cambiarlo.</span>
                  </label>
                  <label className="flex flex-col gap-1 text-xs"><span className="font-medium">Contraseña</span>
                    <input className={`${input} font-mono`} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  </label>
                </Modal.Body>
              )}
              <Modal.Footer>
                <Button variant="secondary" className="rounded-full" onPress={() => setForm(null)}>Cancelar</Button>
                <Button variant="primary" className="rounded-full" isDisabled={saving || !form?.name.trim() || (form?.password.length ?? 0) < 8} onPress={create}>{saving ? "Creando…" : "Crear empleado"}</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal>
        <Modal.Backdrop isOpen={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.CloseTrigger aria-label="Cerrar" />
              <Modal.Header><Modal.Heading>Quitar acceso</Modal.Heading></Modal.Header>
              <Modal.Body className="p-1 text-sm">¿Quitar el acceso a <b>{toDelete?.name}</b> ({toDelete?.email})?</Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" className="rounded-full" onPress={() => setToDelete(null)}>Cancelar</Button>
                <Button variant="danger" className="rounded-full" onPress={() => toDelete && remove(toDelete)}>Quitar acceso</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
