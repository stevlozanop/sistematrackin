"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, toast } from "@heroui/react";
import { AlertTriangle, Ban, History, KeyRound, LogIn, LogOut, MonitorSmartphone, RotateCcw, ShieldAlert, ShieldCheck, Smartphone, Unlock, UserCheck, UserX } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Card, Empty, PageTitle, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { StatGrid } from "@/components/StatCard";
import { Bars, LiveDot, deviceOf, roleLabel, useLive } from "@/components/dev/DevKit";
import { cn } from "@/lib/cn";
import { SoftSelect } from "@/components/SoftSelect";

type Sec = {
  kpis: Record<string, number>;
  attempts: { email: string | null; ip: string | null; n: number; last_at: string; user_id: number | null; name: string | null; role: string | null; logged_after: number }[];
  logins: { id: number; at: string; ip: string | null; agent: string | null; user_id: number; name: string; role: string; company: string | null; new_device: boolean; new_ip: boolean }[];
  idle: { id: number; name: string; email: string; role: string; company: string | null; created_at: string; last_seen: string | null; days: number }[];
  byDay: { d: string; ok: number; fail: number }[];
  blocks: { id: number; kind: string; value: string; reason: string | null; auto: number; until: string; mins: number; who: string | null }[];
  suspended: { id: number; name: string; email: string; role: string; company: string | null; since: string }[];
  privileged: { id: number; name: string; email: string; role: string; company: string | null; totp_enabled: number; must_change: number; last_seen: string | null; suspended: boolean }[];
  changes: { id: number; action: string; detail: string | null; target: string | null; actor: string | null; at: string }[];
};
type Ask = { title: string; body: React.ReactNode; label: string; require?: string; body2?: object; ok: string };

async function act(body: object) {
  const r = await fetch("/api/dev/security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: "Error del servidor" }));
  if (!r.ok) { toast.danger(j.error); return null; }
  return j;
}
const BLOCK_TIMES = [[60, "1 hora"], [60 * 24, "1 día"], [60 * 24 * 7, "7 días"], [60 * 24 * 365, "1 año"]] as const;

/** Cuántos intentos fallidos en 7 días ya son sospechosos */
const SUSPICIOUS = 5;

function lastDays(n: number) {
  const out: string[] = [];
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

/** Consola The Iceberg Labs · Seguridad: intentos fallidos, ingresos desde dispositivos nuevos y cuentas sin uso. */
export default function DevSecurity() {
  const { data: d, at } = useLive<Sec>("/api/dev/security", 8000);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [blockFor, setBlockFor] = useState<number>(60 * 24);
  const go = (a: Ask) => setAsk(a);
  const confirm = async () => { if (!ask?.body2) return; setBusy(true); const j = await act(ask.body2); setBusy(false); if (j) toast.success(ask.ok); setAsk(null); };
  const block = (kind: "ip" | "email", value: string) => go({
    title: `¿Bloquear ${kind === "ip" ? "la IP" : "el correo"} ${value}?`, label: "Sí, bloquear", ok: `${value} bloqueado`,
    body: <>Nadie podrá ingresar {kind === "ip" ? "desde esa IP" : "con ese correo"} durante <b>{BLOCK_TIMES.find(([m]) => m === blockFor)?.[1]}</b>. Lo puedes quitar antes en «Bloqueos activos».</>,
    body2: { action: "block", kind, value, minutes: blockFor },
  });
  const user = (action: string, u: { id: number; name: string }, title: string, body: React.ReactNode, label: string, ok: string) =>
    go({ title, body, label, ok, body2: { action, id: u.id } });
  if (!d) return <div className="p-6 text-sm text-sb-on-surface-variant">Revisando la seguridad…</div>;
  const k = d.kpis;
  const days = lastDays(14);
  const map = new Map(d.byDay.map((r) => [r.d, r]));
  const suspicious = d.attempts.filter((a) => a.n >= SUSPICIOUS && !a.logged_after);

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Seguridad" sub="Ingresos reales al sistema: intentos fallidos, dispositivos nuevos y cuentas sin uso. Se actualiza solo.">
        <LiveDot at={at} />
      </PageTitle>

      {/* Estado general: siempre con ícono y texto, nunca solo color */}
      <Card className={cn("flex items-center gap-3 p-4 text-sm", suspicious.length ? "border-sb-late/50 bg-sb-late-soft/40" : "")}>
        {suspicious.length || k.burst > 10 ? <ShieldAlert className="h-5 w-5 shrink-0 text-sb-late" /> : <ShieldCheck className="h-5 w-5 shrink-0 text-sb-primary" />}
        <span>
          {k.burst > 10 ? <><b>Posible ataque:</b> {k.burst} intentos fallidos en los últimos 10 minutos. Los correos e IP que pasen el límite se bloquean solos; revisa abajo.</>
            : suspicious.length
            ? <><b>Atención:</b> {suspicious.length} {suspicious.length === 1 ? "correo o IP con" : "correos o IP con"} {SUSPICIOUS} o más intentos fallidos en 7 días y sin un ingreso correcto después. Revisa abajo.</>
            : <><b>Sin alertas:</b> ningún correo ni IP con {SUSPICIOUS} o más intentos fallidos seguidos en los últimos 7 días.</>}
        </span>
      </Card>

      <StatGrid
        className="grid-cols-2 md:grid-cols-5"
        items={[
          { label: "Fallidos 24 h", value: k.fails_24h, icon: AlertTriangle },
          { label: "Fallidos 7 días", value: k.fails_7d, icon: AlertTriangle },
          { label: "IP con fallidos 7 días", value: k.fail_ips, icon: KeyRound },
          { label: "Ingresos 7 días", value: k.logins_7d, icon: LogIn },
          { label: "Nunca ingresaron", value: k.never, icon: UserX },
          { label: "Sin entrar +30 días", value: k.idle_30d, icon: UserX },
          { label: "Cuentas con permisos altos", value: k.privileged, icon: ShieldCheck },
          { label: "Bloqueos activos", value: k.blocks, icon: Ban },
          { label: "Cuentas suspendidas", value: k.suspended, icon: UserX },
          { label: "Supervisores con 2FA", value: `${k.with_2fa} de ${k.privileged}` as unknown as number, icon: Smartphone },
        ]}
      />

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Intentos fallidos · últimos 14 días</h3>
        <p className="mb-4 text-[11px] text-sb-on-surface-variant">{d.byDay.reduce((t, r) => t + r.fail, 0)} fallidos y {d.byDay.reduce((t, r) => t + r.ok, 0)} ingresos correctos en el periodo</p>
        <Bars height={110} data={days.map((day) => ({ label: day, value: map.get(day)?.fail ?? 0, title: `${day.slice(8)}/${day.slice(5, 7)} · ${map.get(day)?.ok ?? 0} ingresos correctos` }))}
          tick={(l, i) => (i % 2 === 0 || i === 13 ? `${l.slice(8)}/${l.slice(5, 7)}` : null)} />
      </Card>

      <div className="grid gap-4">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
            <h3 className="text-sm font-semibold">Intentos fallidos por correo e IP · 7 días</h3>
            <span className="ml-auto flex items-center gap-1 text-[11px] text-sb-on-surface-variant">Bloquear por
              <SoftSelect value={blockFor} onChange={(e) => setBlockFor(Number(e.target.value))} className="h-7 rounded-lg border border-sb-outline-variant bg-sb-surface px-1.5 text-xs">
                {BLOCK_TIMES.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
              </SoftSelect>
            </span>
          </div>
          <p className="px-5 text-[11px] text-sb-on-surface-variant">Automático: 5 fallidos en 15 min con el mismo correo (o 10 con la misma IP) bloquean el ingreso 15 min.</p>
          <Table>
            <Thead><Th>Correo escrito</Th><Th>IP</Th><Th className="text-right">Intentos</Th><Th>Último</Th><Th>Estado</Th><Th className="text-right">Bloquear</Th></Thead>
            <tbody>
              {!d.attempts.length ? <Empty cols={6}>Ningún intento fallido en 7 días.</Empty> : d.attempts.map((a, i) => {
                const bad = a.n >= SUSPICIOUS && !a.logged_after;
                return (
                  <Tr key={i}>
                    <Td>
                      <span className="font-medium">{a.email ?? "—"}</span>
                      <span className="block text-[11px] text-sb-on-surface-variant">{a.user_id ? <Link className="hover:underline" href={`/dev/activity?user=${a.user_id}`}>{a.name} · {roleLabel(a.role)}</Link> : "No es una cuenta del sistema"}</span>
                    </Td>
                    <Td className="font-mono text-[11px]">{a.ip ?? "—"}</Td>
                    <Td className="text-right font-semibold">{a.n}</Td>
                    <Td>{a.last_at}</Td>
                    <Td>{bad
                      ? <span className="inline-flex items-center gap-1 font-semibold text-sb-late"><ShieldAlert className="h-3.5 w-3.5" /> Sospechoso</span>
                      : a.logged_after ? <span className="inline-flex items-center gap-1 text-sb-on-surface-variant"><ShieldCheck className="h-3.5 w-3.5" /> Luego entró bien</span>
                      : <span className="text-sb-on-surface-variant">Pocos intentos</span>}</Td>
                    <Td className="text-right">
                      <span className="flex justify-end gap-1">
                        {a.ip && <Button size="sm" variant={bad ? "danger-soft" : "tertiary"} className="rounded-full" onPress={() => block("ip", a.ip!)}><Ban className="h-3 w-3" /> IP</Button>}
                        {a.email && <Button size="sm" variant={bad ? "danger-soft" : "tertiary"} className="rounded-full" onPress={() => block("email", a.email!)}><Ban className="h-3 w-3" /> Correo</Button>}
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
        <Card className="overflow-hidden">
          <div className="px-5 pt-4"><h3 className="text-sm font-semibold">Últimos ingresos</h3></div>
          <Table>
            <Thead><Th>Cuenta</Th><Th>Cuándo</Th><Th>Dispositivo · IP</Th><Th>Novedad</Th><Th className="text-right">Si no fue él</Th></Thead>
            <tbody>
              {!d.logins.length ? <Empty cols={5}>Sin ingresos registrados todavía.</Empty> : d.logins.map((l) => (
                <Tr key={l.id}>
                  <Td><Link href={`/dev/activity?user=${l.user_id}`} className="font-medium hover:underline">{l.name}</Link><span className="block text-[11px] text-sb-on-surface-variant">{roleLabel(l.role)}{l.company ? ` · ${l.company}` : ""}</span></Td>
                  <Td>{l.at}</Td>
                  <Td>{deviceOf(l.agent)}<span className="block font-mono text-[10px] text-sb-on-surface-variant">{l.ip ?? ""}</span></Td>
                  <Td>{l.new_device || l.new_ip
                    ? <span className="inline-flex items-center gap-1 font-medium"><MonitorSmartphone className="h-3.5 w-3.5" /> {l.new_device ? "Dispositivo nuevo" : "IP nueva"}</span>
                    : <span className="text-sb-on-surface-variant">Conocido</span>}</Td>
                  <Td className="text-right">
                    {!!(l.new_device || l.new_ip) && l.role !== "dev" && (
                      <span className="flex justify-end gap-1">
                        <Button size="sm" variant="tertiary" className="rounded-full" onPress={() => user("close", { id: l.user_id, name: l.name }, `¿Cerrar la sesión de ${l.name}?`, <>Sale del sistema en todos sus equipos y debe volver a ingresar.</>, "Sí, cerrar", `Sesión de ${l.name} cerrada`)}><LogOut className="h-3 w-3" /> Cerrar</Button>
                        {l.ip && <Button size="sm" variant="tertiary" className="rounded-full" onPress={() => block("ip", l.ip!)}><Ban className="h-3 w-3" /> IP</Button>}
                      </span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Cuentas sin uso</h3>
            <Button size="sm" variant="secondary" className="rounded-full" onPress={() => go({ title: "¿Suspender las cuentas sin uso hace más de 90 días?", label: "Sí, suspender", require: "SUSPENDER", ok: "Cuentas sin uso suspendidas",
              body: <>Se suspenden (no se borran) las cuentas de encargados, consorcios y clientes que no entran hace más de 90 días. Los supervisores y The Iceberg Labs no se tocan. Se reactivan con un clic.</>, body2: { action: "suspend-idle", days: 90 } })}>
              <UserX className="h-3.5 w-3.5" /> Suspender las de +90 días
            </Button>
          </div>
          <p className="text-[11px] text-sb-on-surface-variant">Nunca ingresaron o llevan más de 30 días sin entrar. Una cuenta olvidada con contraseña vigente es un riesgo.</p>
        </div>
        <Table>
          <Thead><Th>Cuenta</Th><Th>Tipo · empresa</Th><Th>Creada</Th><Th>Última vez</Th><Th className="text-right">Días sin uso</Th><Th /></Thead>
          <tbody>
            {!d.idle.length ? <Empty cols={6}>Todas las cuentas se usaron en los últimos 30 días.</Empty> : d.idle.map((u) => (
              <Tr key={u.id}>
                <Td><b className="font-medium">{u.name}</b><span className="block text-[11px] text-sb-on-surface-variant">{u.email}</span></Td>
                <Td>{roleLabel(u.role)}<span className="block text-[11px] text-sb-on-surface-variant">{u.company ?? "—"}</span></Td>
                <Td>{u.created_at}</Td>
                <Td>{u.last_seen ?? <span className="text-sb-on-surface-variant">Nunca</span>}</Td>
                <Td className="text-right font-semibold">{u.days}</Td>
                <Td className="text-right">
                  {u.role !== "dev" && <Button size="sm" variant="tertiary" className="rounded-full" onPress={() => user("suspend", u, `¿Suspender a ${u.name}?`, <>No podrá ingresar hasta que la reactives. No se borra nada.</>, "Sí, suspender", `${u.name} suspendida`)}><UserX className="h-3 w-3" /> Suspender</Button>}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Bloqueos activos */}
        <Card className="overflow-hidden">
          <div className="px-5 pt-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Ban className="h-4 w-4" /> Bloqueos activos</h3>
            <p className="text-[11px] text-sb-on-surface-variant">Correos e IP que no pueden ingresar por ahora.</p></div>
          <Table>
            <Thead><Th>Qué</Th><Th>Por qué</Th><Th>Hasta</Th><Th /></Thead>
            <tbody>
              {!d.blocks.length ? <Empty cols={4}>Ningún bloqueo activo.</Empty> : d.blocks.map((b) => (
                <Tr key={b.id}>
                  <Td><span className="font-mono text-[11px]">{b.value}</span><span className="block text-[10px] text-sb-on-surface-variant">{b.kind === "ip" ? "IP" : "Correo"} · {b.auto ? "automático" : `por ${b.who ?? "The Iceberg Labs"}`}</span></Td>
                  <Td className="text-[11px]">{b.reason ?? "—"}</Td>
                  <Td className="text-[11px]">{b.until}<span className="block text-sb-on-surface-variant">quedan {b.mins >= 1440 ? `${Math.round(b.mins / 1440)} d` : b.mins >= 60 ? `${Math.round(b.mins / 60)} h` : `${b.mins} min`}</span></Td>
                  <Td className="text-right"><Button size="sm" variant="tertiary" className="rounded-full" onPress={async () => { if (await act({ action: "unblock", id: b.id })) toast.success(`${b.value} desbloqueado`); }}><Unlock className="h-3 w-3" /> Quitar</Button></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {/* Cuentas suspendidas */}
        <Card className="overflow-hidden">
          <div className="px-5 pt-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><UserX className="h-4 w-4" /> Cuentas suspendidas</h3>
            <p className="text-[11px] text-sb-on-surface-variant">No pueden ingresar. Sus datos y su historial se conservan.</p></div>
          <Table>
            <Thead><Th>Cuenta</Th><Th>Desde</Th><Th /></Thead>
            <tbody>
              {!d.suspended.length ? <Empty cols={3}>Ninguna cuenta suspendida.</Empty> : d.suspended.map((u) => (
                <Tr key={u.id}>
                  <Td><b className="font-medium">{u.name}</b><span className="block text-[11px] text-sb-on-surface-variant">{u.email} · {roleLabel(u.role)}{u.company ? ` · ${u.company}` : ""}</span></Td>
                  <Td className="text-[11px]">{u.since}</Td>
                  <Td className="text-right"><Button size="sm" variant="secondary" className="rounded-full" onPress={async () => { if (await act({ action: "reactivate", id: u.id })) toast.success(`${u.name} reactivada`); }}><UserCheck className="h-3 w-3" /> Reactivar</Button></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      {/* Cuentas con poder: doble verificación y cambio de contraseña */}
      <Card className="overflow-hidden">
        <div className="px-5 pt-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" /> Cuentas con permisos altos</h3>
          <p className="text-[11px] text-sb-on-surface-variant">The Iceberg Labs y supervisores. Lo recomendado: doble verificación activada (desde «Mi perfil»). Si alguien perdió su celular, quítale la doble verificación para que la vuelva a activar.</p></div>
        <Table>
          <Thead><Th>Cuenta</Th><Th>Doble verificación</Th><Th>Contraseña</Th><Th>Última vez</Th><Th className="text-right">Acciones</Th></Thead>
          <tbody>
            {d.privileged.map((u) => (
              <Tr key={u.id}>
                <Td><b className="font-medium">{u.name}</b><span className="block text-[11px] text-sb-on-surface-variant">{u.email} · {roleLabel(u.role)}{u.company ? ` · ${u.company}` : ""}{u.suspended ? " · SUSPENDIDA" : ""}</span></Td>
                <Td>{u.totp_enabled ? <span className="inline-flex items-center gap-1 font-semibold text-sb-ontime"><Smartphone className="h-3.5 w-3.5" /> Activa</span> : <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" /> Sin activar</span>}</Td>
                <Td className="text-[11px]">{u.must_change ? <b className="text-amber-600 dark:text-amber-400">Debe cambiarla</b> : "Vigente"}</Td>
                <Td className="text-[11px]">{u.last_seen ?? "Nunca"}</Td>
                <Td className="text-right">
                  <span className="flex flex-wrap justify-end gap-1">
                    {!u.must_change && <Button size="sm" variant="tertiary" className="rounded-full" onPress={() => user("force-change", u, `¿Pedir a ${u.name} que cambie su contraseña?`, <>En su próximo ingreso tendrá que elegir una contraseña nueva antes de usar el sistema.</>, "Sí, pedirlo", `${u.name} deberá cambiar su contraseña`)}><KeyRound className="h-3 w-3" /> Forzar cambio</Button>}
                    {!!u.totp_enabled && <Button size="sm" variant="tertiary" className="rounded-full" onPress={() => user("reset-2fa", u, `¿Quitar la doble verificación de ${u.name}?`, <>Úsalo si perdió su celular. Entrará solo con su contraseña hasta que la vuelva a activar.</>, "Sí, quitar", `Doble verificación de ${u.name} quitada`)}><RotateCcw className="h-3 w-3" /> Quitar 2FA</Button>}
                    {u.role !== "dev" && !u.suspended && <Button size="sm" variant="danger-soft" className="rounded-full" onPress={() => user("suspend", u, `¿Suspender a ${u.name}?`, <>No podrá ingresar hasta que la reactives. Sale del sistema en pocos segundos.</>, "Sí, suspender", `${u.name} suspendida`)}><UserX className="h-3 w-3" /> Suspender</Button>}
                  </span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {/* Registro de cambios de cuentas */}
      <Card className="overflow-hidden">
        <div className="px-5 pt-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> Cambios de cuentas</h3>
          <p className="text-[11px] text-sb-on-surface-variant">Quién creó, borró, suspendió o cambió la contraseña o los permisos de quién.</p></div>
        <ul className="max-h-[22rem] divide-y divide-sb-outline-variant/30 overflow-y-auto">
          {d.changes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 px-5 py-2.5 text-xs">
              <span className="w-32 shrink-0 font-mono text-[11px] text-sb-on-surface-variant">{c.at}</span>
              <b className="text-sm">{c.action}</b>
              {c.target && <span>{c.target}</span>}
              {c.detail && <span className="text-sb-on-surface-variant">· {c.detail}</span>}
              <span className="ml-auto text-[11px] text-sb-on-surface-variant">por {c.actor ?? "—"}</span>
            </li>
          ))}
          {!d.changes.length && <li className="px-5 py-8 text-center text-xs text-sb-on-surface-variant">Todavía no hay cambios registrados.</li>}
        </ul>
      </Card>

      <ConfirmDialog open={!!ask} title={ask?.title ?? ""} confirmLabel={ask?.label} busy={busy} requireText={ask?.require} busyLabel="Aplicando…" onCancel={() => setAsk(null)} onConfirm={confirm}>
        {ask?.body}
      </ConfirmDialog>
    </div>
  );
}
