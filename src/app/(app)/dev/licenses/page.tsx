"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Button, toast } from "@heroui/react";
import { LicenseEditor, type LicenseForm } from "@/components/dev/LicenseEditor";
import { LicenseBilling, type Pay } from "@/components/dev/LicenseBilling";
import { AlertTriangle, CalendarClock, CheckCircle2, History, KeyRound, Lock, Pencil, Unlock, Users, XCircle } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LiveDot, useLive } from "@/components/dev/DevKit";
import { notifyData } from "@/components/UploadCenter";
import { cn } from "@/lib/cn";

type Lic = {
  id: number; name: string; code: string | null; color: string | null; status: "active" | "suspended"; plan: string;
  starts_at: string | null; expires_at: string | null; days_left: number | null; max_users: number | null; note: string | null;
  registered: boolean; updated_at: string | null; updated_by: string | null; accounts: number; online: number;
  consortia: number; consortia_names: string | null; last_seen: string | null;
  fee: number | null; currency: string; cycle: string; pay_info: string | null;
};
type Ev = { id: number; company: string; action: string; detail: string | null; user: string | null; at: string };

/** Estado real: suspendida, vencida, por vencer (15 días) o activa. Siempre ícono + palabra. */
function stateOf(l: Lic) {
  if (l.status === "suspended") return { key: "suspended", label: "Suspendida", icon: Lock, cls: "bg-sb-late-soft text-sb-late" };
  if (l.days_left !== null && l.days_left < 0) return { key: "expired", label: "Vencida", icon: XCircle, cls: "bg-sb-late-soft text-sb-late" };
  if (l.days_left !== null && l.days_left <= 15) return { key: "soon", label: `Vence en ${l.days_left} ${l.days_left === 1 ? "día" : "días"}`, icon: AlertTriangle, cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
  return { key: "active", label: "Activa", icon: CheckCircle2, cls: "bg-sb-ontime-soft text-sb-ontime" };
}
const ACTION: Record<string, string> = { suspend: "Suspendió", activate: "Reactivó", update: "Editó", pago: "Registró un pago en" };

async function send(body: Record<string, unknown>) {
  const r = await fetch("/api/dev/licenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: "Error del servidor" }));
  if (!r.ok) { toast.danger(j.error); return false; }
  notifyData();
  return true;
}

/** Consola The Iceberg Labs · Licencias: activar, suspender, vencimiento y cupo de cuentas de cada empresa, en tiempo real. */
export default function DevLicenses() {
  const { data, at } = useLive<{ companies: Lic[]; events: Ev[]; payments: Record<number, Pay[]> }>("/api/dev/licenses", 5000);
  const [ask, setAsk] = useState<{ lic: Lic; action: "suspend" | "activate" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Lic | null>(null);

  if (!data) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando licencias…</div>;

  const confirm = async () => {
    if (!ask) return;
    setBusy(true);
    const ok = await send({ companyId: ask.lic.id, action: ask.action, note: reason });
    setBusy(false);
    if (ok) toast.success(ask.action === "suspend" ? `Licencia de ${ask.lic.name} suspendida` : `Licencia de ${ask.lic.name} reactivada`, {
      description: ask.action === "suspend" ? `Sus ${ask.lic.accounts} cuentas quedan fuera en unos segundos.` : "Vuelven a entrar solas en unos segundos.",
    });
    setAsk(null); setReason("");
  };
  const openEdit = (l: Lic) => setEdit(l);
  const save = async (form: LicenseForm) => {
    if (!edit) return;
    setBusy(true);
    const ok = await send({ companyId: edit.id, action: "update", plan: form.plan, expiresAt: form.expiresAt || null, maxUsers: form.maxUsers || null, note: form.note });
    setBusy(false);
    if (ok) { toast.success("Licencia actualizada"); setEdit(null); }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Licencias" sub="La licencia de cada empresa decide si su gente (y la de sus consorcios y clientes) puede entrar. Suspender o vencer corta el acceso en segundos; reactivar lo devuelve solo.">
        <LiveDot at={at} />
      </PageTitle>

      {!data.companies.length && <Card className="p-8 text-center text-sm text-sb-on-surface-variant">Todavía no hay empresas. Créalas en Empresas.</Card>}
      <div className="grid gap-4 xl:grid-cols-2">
        {data.companies.map((l, i) => {
          const st = stateOf(l);
          const blocked = st.key === "suspended" || st.key === "expired";
          const used = l.max_users ? Math.min(100, (l.accounts / l.max_users) * 100) : 0;
          return (
            <motion.div key={l.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className={cn("flex h-full flex-col gap-4 p-5 transition-colors", blocked && "border-sb-late/50")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: l.color ?? "var(--sb-on-surface)" }}><KeyRound className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{l.name} {l.code && <span className="font-mono text-[11px] text-sb-on-surface-variant">{l.code}</span>}</p>
                      <p className="truncate text-[11px] text-sb-on-surface-variant">Plan {l.plan}{l.consortia ? ` · incluye ${l.consortia_names}` : ""}</p>
                    </div>
                  </div>
                  <motion.span key={st.key} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", st.cls)}>
                    <st.icon className="h-3.5 w-3.5" /> {st.label}
                  </motion.span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div><p className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant/70">Vence</p><p className="font-semibold">{l.expires_at ?? "Sin vencimiento"}</p>{l.days_left !== null && l.days_left >= 0 && <p className="text-[10px] text-sb-on-surface-variant">en {l.days_left} días</p>}</div>
                  <div><p className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant/70">Cuentas</p><p className="font-semibold">{l.accounts}{l.max_users ? ` de ${l.max_users}` : " · sin límite"}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant/70">En línea ahora</p><p className="flex items-center gap-1.5 font-semibold">{l.online > 0 && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sb-primary" />}{l.online}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wider text-sb-on-surface-variant/70">Último uso</p><p className="font-semibold">{l.last_seen ?? "Nunca"}</p></div>
                </div>
                {l.max_users ? (
                  <div className="h-1.5 overflow-hidden rounded-full bg-sb-surface-container-high">
                    <motion.div className={cn("h-full rounded-full", used >= 100 ? "bg-sb-late" : used >= 85 ? "bg-amber-500" : "bg-sb-primary")} initial={{ width: 0 }} animate={{ width: `${used}%` }} transition={{ duration: 0.8 }} />
                  </div>
                ) : null}
                {l.note && <p className="rounded-xl bg-sb-surface-container-low px-3 py-2 text-[11px] text-sb-on-surface-variant">Nota: {l.note}</p>}
                <LicenseBilling companyId={l.id} company={l.name} payments={data.payments?.[l.id] ?? []}
                  billing={{ fee: l.fee === null ? null : Number(l.fee), currency: l.currency, cycle: l.cycle, pay_info: l.pay_info }} />

                <div className="mt-auto flex flex-wrap items-center gap-2">
                  {l.status === "suspended"
                    ? <Button size="sm" className="rounded-full" onPress={() => setAsk({ lic: l, action: "activate" })}><Unlock className="h-3.5 w-3.5" /> Reactivar</Button>
                    : <Button size="sm" variant="danger" className="rounded-full" onPress={() => setAsk({ lic: l, action: "suspend" })}><Lock className="h-3.5 w-3.5" /> Suspender</Button>}
                  <Button size="sm" variant="secondary" className="rounded-full" onPress={() => openEdit(l)}><Pencil className="h-3.5 w-3.5" /> Plan, vencimiento y cupo</Button>
                  <span className="ml-auto text-[10px] text-sb-on-surface-variant">{l.registered ? `Cambiada ${l.updated_at}${l.updated_by ? ` por ${l.updated_by}` : ""}` : "Activa por defecto"}</span>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><History className="h-3.5 w-3.5" /> Historial de licencias</h3>
        {data.events.length ? data.events.map((e) => (
          <div key={e.id} className="flex items-start gap-2.5 border-b border-sb-outline-variant/20 py-2 text-xs last:border-0">
            {e.action === "suspend" ? <Lock className="mt-0.5 h-3.5 w-3.5 text-sb-late" /> : e.action === "activate" ? <Unlock className="mt-0.5 h-3.5 w-3.5 text-sb-ontime" /> : <CalendarClock className="mt-0.5 h-3.5 w-3.5 text-sb-on-surface-variant" />}
            <span className="flex-1"><b>{e.user ?? "—"}</b> {(ACTION[e.action] ?? e.action).toLowerCase()} la licencia de <b>{e.company}</b>{e.detail ? <span className="text-sb-on-surface-variant"> · {e.detail}</span> : null}</span>
            <span className="shrink-0 font-mono text-[10px] text-sb-on-surface-variant">{e.at}</span>
          </div>
        )) : <p className="py-4 text-center text-xs text-sb-on-surface-variant">Sin cambios todavía.</p>}
      </Card>

      <ConfirmDialog
        open={!!ask} busy={busy} onCancel={() => { setAsk(null); setReason(""); }} onConfirm={confirm}
        title={ask?.action === "suspend" ? `¿Suspender la licencia de ${ask?.lic.name}?` : `¿Reactivar la licencia de ${ask?.lic.name}?`}
        confirmLabel={ask?.action === "suspend" ? "Sí, suspender" : "Sí, reactivar"}
        requireText={ask?.action === "suspend" ? "SUSPENDER" : undefined}
        busyLabel={ask?.action === "suspend" ? "Suspendiendo…" : "Reactivando…"} tone={ask?.action === "suspend" ? "danger" : "primary"}
      >
        {ask?.action === "suspend" ? (
          <div className="flex flex-col gap-3">
            <p><b className="text-sb-on-surface"><Users className="mr-1 inline h-3.5 w-3.5" />{ask.lic.accounts} cuentas</b>{ask.lic.consortia ? ` (incluye ${ask.lic.consortia_names} y sus clientes)` : ""} quedarán fuera en unos segundos{ask.lic.online ? `, ${ask.lic.online} de ellas conectadas ahora` : ""}. Nadie perderá datos: al reactivar vuelven tal cual.</p>
            <label className="flex flex-col gap-1 text-xs">Motivo (lo verá el historial)
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. falta de pago de octubre" className="h-10 rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-primary" />
            </label>
          </div>
        ) : <p>Las {ask?.lic.accounts} cuentas vuelven a entrar solas en unos segundos, sin tener que iniciar sesión de nuevo.</p>}
      </ConfirmDialog>

      {edit && (
        <LicenseEditor key={edit.id} open company={edit.name} used={edit.accounts} busy={busy} onCancel={() => setEdit(null)} onSave={save}
          initial={{ plan: edit.plan, expiresAt: edit.expires_at ?? "", maxUsers: edit.max_users ? String(edit.max_users) : "", note: edit.note ?? "" }} />
      )}
    </div>
  );
}
