"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Modal, toast } from "@heroui/react";
import { Copy, KeyRound, Search, Store, Trash2, UserPlus, Users, X } from "lucide-react";
import { Card, PageTitle, Pill } from "@/components/ui";
import { StatGrid } from "@/components/StatCard";
import { DealerAccounts } from "@/components/DealerAccounts";

type Account = {
  id: number; name: string; email: string; client: string | null; created_at: string; last_seen: string | null; online: number;
  created_by: string | null; created_by_company: string | null; stores: number;
};

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => chars[n % chars.length]).join("") + "!";
}

/**
 * «Clientes»: Honda da acceso a sus clientes (SORSA, SERVIHONDA…) para que vean el estado de sus pedidos.
 * Solo puede crear, restablecer y quitar cuentas de clientes de su consorcio; cada cliente ve solo lo suyo.
 */
export default function ClientsPage() {
  const [rows, setRows] = useState<Account[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [bulk, setBulk] = useState(false);
  const [toDelete, setToDelete] = useState<Account | null>(null);

  const load = useCallback(() => fetch("/api/client-accounts").then(async (r) => {
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    if (!r.ok) setError(j.error); else setRows(j);
  }), []);
  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((a) => !t || [a.client, a.name, a.email].some((v) => v?.toLowerCase().includes(t)));
  }, [rows, q]);

  async function reset(a: Account) {
    const pw = genPassword();
    const r = await fetch("/api/client-accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, password: pw }) });
    if (!r.ok) return toast.danger((await r.json().catch(() => ({}))).error ?? "No se pudo restablecer");
    await navigator.clipboard?.writeText(`${a.email} / ${pw}`).catch(() => {});
    toast.success(`Nueva contraseña para ${a.client ?? a.name}`, { description: `${a.email} · ${pw} (copiado)`, timeout: 20000 });
  }

  async function remove(a: Account) {
    const r = await fetch(`/api/client-accounts?id=${a.id}`, { method: "DELETE" });
    if (!r.ok) return toast.danger((await r.json().catch(() => ({}))).error ?? "No se pudo eliminar");
    toast.success(`${a.client ?? a.name} ya no tiene acceso`);
    setToDelete(null);
    load();
  }

  if (error) return <Card className="mt-4 px-5 py-8 text-center text-sm text-sb-on-surface-variant">{error}</Card>;
  if (!rows) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando clientes…</div>;
  const online = rows.filter((a) => Number(a.online)).length;
  const used = rows.filter((a) => a.last_seen).length;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Tus clientes" sub="Dale acceso a tus clientes (SORSA, SERVIHONDA…) para que vean el estado de sus pedidos. Cada uno ve solo lo suyo y no puede cambiar nada.">
        <Button size="sm" variant="primary" className="rounded-full" onPress={() => setBulk(true)}>
          <UserPlus className="h-3.5 w-3.5" /> Dar acceso a clientes
        </Button>
      </PageTitle>

      <StatGrid
        className="grid-cols-3"
        items={[
          { label: "Clientes con acceso", value: rows.length, icon: Users },
          { label: "Ya entraron alguna vez", value: used, icon: Store },
          { label: "En línea ahora", value: online, icon: Users },
        ]}
      />

      <label className="sbf-search md:w-96">
        <Search className="h-4 w-4 opacity-40" />
        <input placeholder="Buscar cliente o usuario…" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button onClick={() => setQ("")} className="opacity-40 hover:opacity-100" aria-label="Borrar búsqueda"><X className="h-4 w-4" /></button>}
      </label>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant/60">
                <th className="px-4 py-2.5 font-semibold">Cliente</th>
                <th className="px-3 py-2.5 font-semibold">Usuario para entrar</th>
                <th className="px-3 py-2.5 font-semibold">Creada por</th>
                <th className="px-3 py-2.5 font-semibold">Último ingreso</th>
                <th className="px-4 py-2.5 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="border-b border-sb-outline-variant/25 last:border-0 hover:bg-sb-surface-container-low">
                  <td className="px-4 py-2.5">
                    <b className="font-medium">{a.client ?? a.name}</b>
                    <span className="block text-[11px] text-sb-on-surface-variant">{Number(a.stores)} {Number(a.stores) === 1 ? "tienda" : "tiendas"}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono">{a.email}</td>
                  <td className="px-3 py-2.5 text-sb-on-surface-variant">{a.created_by_company ?? a.created_by ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    {Number(a.online) ? <Pill active>En línea</Pill> : a.last_seen ?? <span className="text-sb-on-surface-variant">Nunca</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button isIconOnly size="sm" variant="tertiary" aria-label={`Copiar usuario de ${a.client}`} onPress={() => navigator.clipboard?.writeText(a.email).then(() => toast.success("Usuario copiado"))}><Copy className="h-4 w-4" /></Button>
                      <Button isIconOnly size="sm" variant="tertiary" aria-label={`Nueva contraseña para ${a.client}`} onPress={() => reset(a)}><KeyRound className="h-4 w-4" /></Button>
                      <Button isIconOnly size="sm" variant="danger-soft" aria-label={`Quitar acceso a ${a.client}`} onPress={() => setToDelete(a)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-sb-on-surface-variant">{q ? "Sin resultados." : "Todavía no diste acceso a ningún cliente."}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <DealerAccounts open={bulk} onClose={() => setBulk(false)} onCreated={load} />

      <Modal>
        <Modal.Backdrop isOpen={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.CloseTrigger aria-label="Cerrar" />
              <Modal.Header><Modal.Heading>Quitar acceso</Modal.Heading></Modal.Header>
              <Modal.Body className="p-1 text-sm">
                ¿Quitar el acceso a <b>{toDelete?.client ?? toDelete?.name}</b> ({toDelete?.email})? Ya no podrá ver sus pedidos hasta que le des acceso otra vez.
              </Modal.Body>
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
