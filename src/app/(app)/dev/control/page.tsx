"use client";
import { useMemo, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Building2, Download, History, LogOut, Power, Search, ShieldAlert, Users, Wrench } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LiveDot, roleLabel, useLive } from "@/components/dev/DevKit";
import { cn } from "@/lib/cn";
import { SoftSelect } from "@/components/SoftSelect";

type Data = {
  platform: { maintenance: boolean; message: string | null; until: string | null };
  users: { id: number; name: string; email: string; role: string; company: string | null; online: boolean; last_seen: string | null; closed_at: string | null }[];
  companies: { id: number; name: string; kind: string; users: number }[];
  tables: { name: string; rows: number }[];
  log: { id: number; action: string; target: string | null; detail: string | null; at: string; who: string | null }[];
};
type Ask = { title: string; body: React.ReactNode; label: string; require?: string; run: () => Promise<void> };

async function post(body: object) {
  const r = await fetch("/api/dev/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: "Error del servidor" }));
  if (!r.ok) { toast.danger(j.error); return null; }
  return j;
}

/**
 * Consola The Iceberg Labs · Control de la plataforma:
 * modo mantenimiento, cerrar sesiones (una cuenta, una empresa o todas), respaldo de tablas y registro de acciones.
 */
export default function DevControl() {
  const { data: d, at } = useLive<Data>("/api/dev/control", 5000);
  const [msg, setMsg] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [q, setQ] = useState("");
  const [table, setTable] = useState("units");
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);

  const users = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (d?.users ?? []).filter((u) => !t || [u.name, u.email, u.company, u.role].some((x) => (x ?? "").toLowerCase().includes(t)));
  }, [d, q]);
  if (!d) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  const on = d.platform.maintenance;
  const online = d.users.filter((u) => u.online).length;
  const confirm = async () => { if (!ask) return; setBusy(true); await ask.run(); setBusy(false); setAsk(null); };

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Control de la plataforma" sub="Superpoderes de The Iceberg Labs: poner el sistema en mantenimiento, cerrar sesiones, descargar respaldos y ver todo lo que se hizo desde aquí.">
        <LiveDot at={at} />
      </PageTitle>

      {/* 1. Modo mantenimiento */}
      <Card className={cn("flex flex-col gap-4 p-5", on && "ring-2 ring-sb-late/50")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", on ? "bg-sb-late-soft text-sb-late" : "bg-sb-surface-container")}><Wrench className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold">Modo mantenimiento · <span className={on ? "text-sb-late" : "text-sb-ontime"}>{on ? "ENCENDIDO" : "apagado"}</span></h3>
            <p className="text-xs text-sb-on-surface-variant">
              {on ? `Nadie más que The Iceberg Labs puede usar el sistema.${d.platform.until ? ` Vuelta estimada: ${d.platform.until.slice(11)}.` : ""} Al apagarlo, todos entran solos.`
                : "Pone a todas las cuentas en una pantalla de «Volvemos en unos minutos» mientras haces cambios grandes. Tú sigues entrando."}
            </p>
          </div>
          </div>
          <Button variant={on ? "primary" : "danger"} className="w-full shrink-0 rounded-full sm:w-auto" isDisabled={busy}
            onPress={() => on
              ? post({ action: "maintenance", on: false }).then((j) => j && toast.success("Mantenimiento apagado: todos pueden entrar"))
              : setAsk({ title: "¿Encender el modo mantenimiento?", label: "Sí, encender", body: <>Todas las cuentas (Leyva, consorcios, encargados y clientes) verán la pantalla de mantenimiento en pocos segundos y no podrán entrar hasta que lo apagues.</>,
                run: async () => { const j = await post({ action: "maintenance", on: true, message: msg, minutes }); if (j) toast.success("Mantenimiento encendido"); } })}>
            <Power className="h-4 w-4" /> {on ? "Apagar mantenimiento" : "Encender mantenimiento"}
          </Button>
        </div>
        {on ? (
          <p className="rounded-xl bg-sb-surface-container-low px-4 py-3 text-sm">Mensaje que ven: <b>{d.platform.message ?? "Estamos mejorando el sistema. Volvemos en unos minutos."}</b></p>
        ) : (
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Mensaje para los usuarios (opcional)
              <input value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={300} placeholder="Ej. Estamos actualizando el sistema. Volvemos en 30 minutos."
                className="h-10 rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm outline-none focus:border-sb-on-surface" />
            </label>
            <div className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Vuelta estimada
              <div className="grid grid-cols-4 gap-1 rounded-full bg-sb-surface-container p-1 sm:flex">
                {[[15, "15 min"], [30, "30 min"], [60, "1 h"], [0, "Sin hora"]].map(([m, l]) => (
                  <button key={m} type="button" onClick={() => setMinutes(Number(m))} className={cn("sb-pill rounded-full px-3 py-1.5 text-xs font-semibold", minutes === m ? "bg-sb-primary text-sb-on-primary" : "text-sb-on-surface-variant")}>{l}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* 2. Cerrar sesiones */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-sb-outline-variant/40 px-5 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" /> Cerrar la sesión de una cuenta</h3>
            <span className="text-[11px] text-sb-on-surface-variant">{online} conectada(s) ahora</span>
            <label className="relative ml-auto w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sb-on-surface-variant" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre, correo o empresa" className="h-9 w-full rounded-xl border border-sb-outline-variant bg-sb-surface pl-9 pr-3 text-sm outline-none focus:border-sb-on-surface" />
            </label>
          </div>
          <ul className="max-h-[26rem] divide-y divide-sb-outline-variant/30 overflow-y-auto">
            {users.slice(0, 120).map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-5 py-2.5 text-xs">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", u.online ? "bg-sb-ontime" : "bg-sb-outline-variant")} title={u.online ? "Conectado ahora" : "Desconectado"} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{u.name}</b>
                  <span className="block truncate text-[11px] text-sb-on-surface-variant">{u.email} · {roleLabel(u.role)}{u.company ? ` · ${u.company}` : ""}</span>
                  <span className="block text-[11px] text-sb-on-surface-variant">{u.online ? "conectado ahora" : u.last_seen ? `visto ${u.last_seen}` : "nunca entró"}{u.closed_at && <span className="text-sb-late"> · cerrada {u.closed_at}</span>}</span>
                </span>
                <Button size="sm" variant="secondary" className="rounded-full" isDisabled={busy}
                  onPress={() => setAsk({ title: `¿Cerrar la sesión de ${u.name}?`, label: "Sí, cerrar sesión", body: <>Sale del sistema en pocos segundos en todos sus equipos y tendrá que volver a ingresar con su contraseña. Útil si perdió el celular o compartió su cuenta.</>,
                    run: async () => { const j = await post({ action: "close-user", id: u.id }); if (j) toast.success(`Sesión de ${u.name} cerrada`); } })}>
                  <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
                </Button>
              </li>
            ))}
            {!users.length && <li className="px-5 py-8 text-center text-xs text-sb-on-surface-variant">Ninguna cuenta coincide.</li>}
          </ul>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col overflow-hidden">
            <div className="border-b border-sb-outline-variant/40 px-5 py-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4" /> Cerrar las sesiones de una empresa</h3>
              <p className="text-[11px] text-sb-on-surface-variant">Incluye sus consorcios y sus clientes.</p></div>
            <ul className="divide-y divide-sb-outline-variant/30">
              {d.companies.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-2.5 text-xs">
                  <span className="min-w-0 flex-1"><b className="block truncate text-sm">{c.name}</b><span className="text-[11px] text-sb-on-surface-variant">{c.users} cuenta(s)</span></span>
                  <Button size="sm" variant="secondary" className="rounded-full" isDisabled={busy || !c.users}
                    onPress={() => setAsk({ title: `¿Cerrar todas las sesiones de ${c.name}?`, label: "Sí, cerrar", body: <>Las {c.users} cuentas de {c.name} (y de sus consorcios y clientes) salen del sistema en pocos segundos.</>,
                      run: async () => { const j = await post({ action: "close-company", id: c.id }); if (j) toast.success(`${j.n} sesiones cerradas en ${c.name}`); } })}>
                    <LogOut className="h-3.5 w-3.5" /> Cerrar
                  </Button>
                </li>
              ))}
            </ul>
            <div className="border-t border-sb-outline-variant/40 p-4">
              <Button variant="danger" className="w-full rounded-full" isDisabled={busy}
                onPress={() => setAsk({ title: "¿Cerrar TODAS las sesiones?", label: "Sí, cerrar todas", require: "CERRAR", body: <>Todas las cuentas salvo The Iceberg Labs salen del sistema y deben volver a ingresar. Úsalo si sospechas que una contraseña se filtró.</>,
                  run: async () => { const j = await post({ action: "close-all" }); if (j) toast.success(`${j.n} sesiones cerradas`); } })}>
                <ShieldAlert className="h-4 w-4" /> Cerrar todas las sesiones
              </Button>
            </div>
          </Card>

          {/* 3. Respaldo */}
          <Card className="flex flex-col gap-3 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Download className="h-4 w-4" /> Respaldo de una tabla en Excel</h3>
            <p className="text-[11px] text-sb-on-surface-variant">Descárgalo antes de una operación delicada. Las contraseñas y llaves salen ocultas.</p>
            <div className="flex gap-2">
              <SoftSelect value={table} onChange={(e) => setTable(e.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm">
                {d.tables.map((t) => <option key={t.name} value={t.name}>{t.name} · {Number(t.rows).toLocaleString("es-PE")} filas</option>)}
              </SoftSelect>
              <a href={`/api/dev/export?table=${encodeURIComponent(table)}`} className="sb-pill [--px:1rem] inline-flex h-10 items-center gap-1.5 rounded-full bg-sb-primary px-4 text-sm font-semibold text-sb-on-primary">
                <Download className="h-4 w-4" /> Descargar
              </a>
            </div>
          </Card>
        </div>
      </div>

      {/* 4. Registro */}
      <Card className="overflow-hidden">
        <div className="border-b border-sb-outline-variant/40 px-5 py-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> Registro de acciones de The Iceberg Labs</h3>
          <p className="text-[11px] text-sb-on-surface-variant">Todo lo que se hizo desde la consola: mantenimiento, sesiones cerradas, limpiezas, conexiones cortadas y respaldos.</p></div>
        <ul className="max-h-[22rem] divide-y divide-sb-outline-variant/30 overflow-y-auto">
          {d.log.map((l) => (
            <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-2.5 text-xs">
              <span className="w-36 shrink-0 font-mono text-[11px] text-sb-on-surface-variant">{l.at}</span>
              <b className="text-sm">{l.action}</b>
              {l.target && <span className="font-mono">{l.target}</span>}
              {l.detail && <span className="text-sb-on-surface-variant">· {l.detail}</span>}
              <span className="ml-auto text-[11px] text-sb-on-surface-variant">{l.who ?? "—"}</span>
            </li>
          ))}
          {!d.log.length && <li className="px-5 py-8 text-center text-xs text-sb-on-surface-variant">Todavía no hay acciones registradas.</li>}
        </ul>
      </Card>

      <ConfirmDialog open={!!ask} title={ask?.title ?? ""} confirmLabel={ask?.label} busy={busy} requireText={ask?.require} busyLabel="Aplicando…"
        onCancel={() => setAsk(null)} onConfirm={confirm}>
        {ask?.body}
      </ConfirmDialog>
    </div>
  );
}
