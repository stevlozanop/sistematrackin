"use client";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Button, Modal, toast } from "@heroui/react";
import { CheckCircle2, Download, Search, Store, X } from "lucide-react";
import { Checkbox, Pill } from "@/components/ui";

type Dealer = { id: number; name: string; department: string | null; district: string | null; units: number; open: number; accounts: string | null };
type Created = { dealer: string; department: string | null; name: string; email: string; password: string };

/** Excel con los accesos de cada dealer, para enviárselos. Las contraseñas no se pueden volver a ver después. */
function download(rows: Created[]) {
  const url = typeof window !== "undefined" ? window.location.origin : "";
  const ws = XLSX.utils.aoa_to_sheet([
    ["Dealer", "Departamento", "Usuario", "Contraseña", "Entrar en"],
    ...rows.map((r) => [r.dealer, r.department ?? "", r.email, r.password, `${url}/login`]),
  ]);
  ws["!cols"] = [{ wch: 44 }, { wch: 16 }, { wch: 38 }, { wch: 16 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Accesos dealers");
  XLSX.writeFile(wb, `accesos-dealers-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function DealerAccounts({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [dealers, setDealers] = useState<Dealer[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Created[] | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/dealer-accounts").then((r) => r.json()).then((d: Dealer[]) => {
      setDealers(d);
      // Por defecto: todos los que tienen unidades y todavía no tienen cuenta
      setPicked(new Set(d.filter((x) => !x.accounts && x.units > 0).map((x) => x.id)));
    });
  }, [open]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (dealers ?? []).filter((d) => !t || d.name.toLowerCase().includes(t) || (d.department ?? "").toLowerCase().includes(t));
  }, [dealers, q]);
  const without = (dealers ?? []).filter((d) => !d.accounts);
  const toggle = (id: number, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });

  async function create() {
    setSaving(true);
    const r = await fetch("/api/dealer-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealerIds: [...picked] }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setSaving(false);
    if (!r.ok) return toast.danger(j.error);
    setCreated(j.created);
    if (j.created.length) download(j.created);
    toast.success(`${j.created.length} cuentas de dealers creadas`, { description: "Se descargó el Excel con los accesos." });
    onCreated();
  }

  const close = () => { setCreated(null); setQ(""); onClose(); };

  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={(o) => !o && close()}>
        <Modal.Container size="lg">
          <Modal.Dialog className="sm:max-w-3xl">
            <Modal.CloseTrigger aria-label="Cerrar" />
            <Modal.Header className="flex flex-col gap-1">
              <Modal.Heading>{created ? "Cuentas creadas" : "Cuentas para los dealers"}</Modal.Heading>
              <p className="text-xs text-sb-on-surface-variant">
                {created
                  ? "Guarda el Excel: las contraseñas no se vuelven a mostrar. Si alguien la pierde, restablécela en Usuarios."
                  : "Cada dealer entra a «Mis unidades» y ve solo las suyas: en qué etapa van y si llegan a tiempo. Se crea una cuenta por tienda."}
              </p>
            </Modal.Header>

            <Modal.Body className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto p-1">
              {created ? (
                <>
                  <div className="flex items-center gap-2 rounded-xl bg-sb-surface-container-low px-3 py-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-sb-ontime" /> {created.length} cuentas listas.
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead><tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant/60">
                      <th className="py-2 pr-2">Dealer</th><th className="py-2 pr-2">Usuario</th><th className="py-2">Contraseña</th>
                    </tr></thead>
                    <tbody>
                      {created.map((c) => (
                        <tr key={c.email} className="border-b border-sb-outline-variant/25 last:border-0">
                          <td className="py-2 pr-2">{c.dealer}</td><td className="py-2 pr-2 font-mono">{c.email}</td><td className="py-2 font-mono">{c.password}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : !dealers ? (
                <p className="py-6 text-center text-sm text-sb-on-surface-variant">Cargando dealers…</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sbf-search flex-1">
                      <Search className="h-4 w-4 opacity-40" />
                      <input placeholder="Buscar dealer o departamento…" value={q} onChange={(e) => setQ(e.target.value)} />
                      {q && <button onClick={() => setQ("")} className="opacity-40 hover:opacity-100" aria-label="Borrar búsqueda"><X className="h-4 w-4" /></button>}
                    </label>
                    <button className="sbf-chip" onClick={() => setPicked(new Set(without.map((d) => d.id)))}>Todos sin cuenta ({without.length})</button>
                    <button className="sbf-chip" onClick={() => setPicked(new Set())}>Ninguno</button>
                  </div>
                  <div className="flex flex-col">
                    {list.map((d) => (
                      <label key={d.id} className={`flex items-center gap-3 border-b border-sb-outline-variant/25 py-2 text-xs last:border-0 ${d.accounts ? "opacity-60" : "cursor-pointer"}`}>
                        {d.accounts
                          ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-sb-ontime" aria-label="Ya tiene cuenta" />
                          : <Checkbox checked={picked.has(d.id)} onChange={(v) => toggle(d.id, v)} label={`Crear cuenta para ${d.name}`} />}
                        <Store className="h-3.5 w-3.5 shrink-0 text-sb-on-surface-variant/50" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{d.name}</span>
                          <span className="block truncate text-[11px] text-sb-on-surface-variant">
                            {[d.district, d.department].filter(Boolean).join(", ") || "—"}
                            {d.accounts ? ` · ya tiene cuenta: ${d.accounts}` : ""}
                          </span>
                        </span>
                        <Pill>{d.units.toLocaleString()} unid.{d.open ? ` · ${d.open} en camino` : ""}</Pill>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </Modal.Body>

            <Modal.Footer>
              {created ? (
                <>
                  <Button variant="secondary" className="rounded-full" onPress={() => download(created)}><Download className="h-4 w-4" /> Descargar Excel otra vez</Button>
                  <Button variant="primary" className="rounded-full" onPress={close}>Listo</Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" className="rounded-full" onPress={close}>Cancelar</Button>
                  <Button variant="primary" className="rounded-full" isDisabled={saving || !picked.size} onPress={create}>
                    {saving ? "Creando…" : `Crear ${picked.size} ${picked.size === 1 ? "cuenta" : "cuentas"}`}
                  </Button>
                </>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
