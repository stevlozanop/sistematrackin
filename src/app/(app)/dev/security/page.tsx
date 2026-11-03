"use client";
import Link from "next/link";
import { AlertTriangle, KeyRound, LogIn, MonitorSmartphone, ShieldAlert, ShieldCheck, UserX } from "lucide-react";
import { Card, Empty, PageTitle, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { StatGrid } from "@/components/StatCard";
import { Bars, LiveDot, deviceOf, roleLabel, useLive } from "@/components/dev/DevKit";
import { cn } from "@/lib/cn";

type Sec = {
  kpis: Record<string, number>;
  attempts: { email: string | null; ip: string | null; n: number; last_at: string; user_id: number | null; name: string | null; role: string | null; logged_after: number }[];
  logins: { id: number; at: string; ip: string | null; agent: string | null; user_id: number; name: string; role: string; company: string | null; new_device: boolean; new_ip: boolean }[];
  idle: { id: number; name: string; email: string; role: string; company: string | null; created_at: string; last_seen: string | null; days: number }[];
  byDay: { d: string; ok: number; fail: number }[];
};

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
        {suspicious.length ? <ShieldAlert className="h-5 w-5 shrink-0 text-sb-late" /> : <ShieldCheck className="h-5 w-5 shrink-0 text-sb-primary" />}
        <span>
          {suspicious.length
            ? <><b>Atención:</b> {suspicious.length} {suspicious.length === 1 ? "correo o IP con" : "correos o IP con"} {SUSPICIOUS} o más intentos fallidos en 7 días y sin un ingreso correcto después. Revisa abajo.</>
            : <><b>Sin alertas:</b> ningún correo ni IP con {SUSPICIOUS} o más intentos fallidos seguidos en los últimos 7 días.</>}
        </span>
      </Card>

      <StatGrid
        className="grid-cols-2 md:grid-cols-4 xl:grid-cols-7"
        items={[
          { label: "Fallidos 24 h", value: k.fails_24h, icon: AlertTriangle },
          { label: "Fallidos 7 días", value: k.fails_7d, icon: AlertTriangle },
          { label: "IP con fallidos 7 días", value: k.fail_ips, icon: KeyRound },
          { label: "Ingresos 7 días", value: k.logins_7d, icon: LogIn },
          { label: "Nunca ingresaron", value: k.never, icon: UserX },
          { label: "Sin entrar +30 días", value: k.idle_30d, icon: UserX },
          { label: "Cuentas con permisos altos", value: k.privileged, icon: ShieldCheck },
        ]}
      />

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Intentos fallidos · últimos 14 días</h3>
        <p className="mb-4 text-[11px] text-sb-on-surface-variant">{d.byDay.reduce((t, r) => t + r.fail, 0)} fallidos y {d.byDay.reduce((t, r) => t + r.ok, 0)} ingresos correctos en el periodo</p>
        <Bars height={110} data={days.map((day) => ({ label: day, value: map.get(day)?.fail ?? 0, title: `${day.slice(8)}/${day.slice(5, 7)} · ${map.get(day)?.ok ?? 0} ingresos correctos` }))}
          tick={(l, i) => (i % 2 === 0 || i === 13 ? `${l.slice(8)}/${l.slice(5, 7)}` : null)} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="px-5 pt-4"><h3 className="text-sm font-semibold">Intentos fallidos por correo e IP · 7 días</h3></div>
          <Table>
            <Thead><Th>Correo escrito</Th><Th>IP</Th><Th className="text-right">Intentos</Th><Th>Último</Th><Th>Estado</Th></Thead>
            <tbody>
              {!d.attempts.length ? <Empty cols={5}>Ningún intento fallido en 7 días.</Empty> : d.attempts.map((a, i) => {
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
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
        <Card className="overflow-hidden">
          <div className="px-5 pt-4"><h3 className="text-sm font-semibold">Últimos ingresos</h3></div>
          <Table>
            <Thead><Th>Cuenta</Th><Th>Cuándo</Th><Th>Dispositivo · IP</Th><Th>Novedad</Th></Thead>
            <tbody>
              {!d.logins.length ? <Empty cols={4}>Sin ingresos registrados todavía.</Empty> : d.logins.map((l) => (
                <Tr key={l.id}>
                  <Td><Link href={`/dev/activity?user=${l.user_id}`} className="font-medium hover:underline">{l.name}</Link><span className="block text-[11px] text-sb-on-surface-variant">{roleLabel(l.role)}{l.company ? ` · ${l.company}` : ""}</span></Td>
                  <Td>{l.at}</Td>
                  <Td>{deviceOf(l.agent)}<span className="block font-mono text-[10px] text-sb-on-surface-variant">{l.ip ?? ""}</span></Td>
                  <Td>{l.new_device || l.new_ip
                    ? <span className="inline-flex items-center gap-1 font-medium"><MonitorSmartphone className="h-3.5 w-3.5" /> {l.new_device ? "Dispositivo nuevo" : "IP nueva"}</span>
                    : <span className="text-sb-on-surface-variant">Conocido</span>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 pt-4">
          <h3 className="text-sm font-semibold">Cuentas sin uso</h3>
          <p className="text-[11px] text-sb-on-surface-variant">Nunca ingresaron o llevan más de 30 días sin entrar. Una cuenta olvidada con contraseña vigente es un riesgo: avisa a su empresa para revisarla.</p>
        </div>
        <Table>
          <Thead><Th>Cuenta</Th><Th>Tipo · empresa</Th><Th>Creada</Th><Th>Última vez</Th><Th className="text-right">Días sin uso</Th></Thead>
          <tbody>
            {!d.idle.length ? <Empty cols={5}>Todas las cuentas se usaron en los últimos 30 días.</Empty> : d.idle.map((u) => (
              <Tr key={u.id}>
                <Td><b className="font-medium">{u.name}</b><span className="block text-[11px] text-sb-on-surface-variant">{u.email}</span></Td>
                <Td>{roleLabel(u.role)}<span className="block text-[11px] text-sb-on-surface-variant">{u.company ?? "—"}</span></Td>
                <Td>{u.created_at}</Td>
                <Td>{u.last_seen ?? <span className="text-sb-on-surface-variant">Nunca</span>}</Td>
                <Td className="text-right font-semibold">{u.days}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
