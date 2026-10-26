"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, toast } from "@heroui/react";
import { Activity, CalendarDays, Clock, KeyRound, Save, Upload } from "lucide-react";
import { Card, PageTitle, Pill } from "@/components/ui";
import { StatGrid } from "@/components/StatCard";
import { SITE_INFO, type Site } from "@/lib/hsp";
import { areaOf, companyCode, roleLabel, type Role } from "@/lib/workflow";
import { LogoBadge, LogoPicker } from "@/components/CompanyLogo";

type Profile = {
  id: number; name: string; email: string; role: Role; created_at: string; last_seen: string | null;
  area: string | null; carrier: string | null; canImport: boolean; stages: { site: Site; field: string }[];
  activity: { total: number; today: number; week: number; last: string | null };
  company: { id: number; name: string; kind: string; v: string | null; canEdit: boolean; isOwner: boolean } | null;
};

const ROLE_DESC: Record<Role, string> = {
  dev: "Ves y corriges todo el sistema, y creas empresas, supervisores y encargados.",
  admin: "Supervisas el avance, corriges fechas y creas encargados y cuentas de dealers.",
  operator: "Registras las fechas de tus etapas, en orden.",
  viewer: "Ves todo el sistema en vivo, en solo lectura.",
  dealer: "Ves en qué etapa van las unidades de tu tienda y si llegan a tiempo.",
};
const input = "h-9 w-full rounded-xl border border-sb-outline-variant bg-sb-surface-container-low px-3 text-sm text-sb-on-surface outline-none transition-colors focus:border-sb-primary";
const stageLabel = (site: Site, field: string) => {
  const d = SITE_INFO[site].dates.find((x) => x.key === field);
  return d?.label ?? field; // la etiqueta ya trae el número del paso
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-sb-outline-variant/25 py-2.5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[11px] uppercase tracking-wider text-sb-on-surface-variant/60">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [p, setP] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [busy, setBusy] = useState<"" | "name" | "pw">("");

  const load = () => fetch("/api/profile").then((r) => r.json()).then((d: Profile) => { setP(d); setName(d.name); });
  useEffect(() => { load(); }, []);

  if (!p) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;

  const patch = async (body: object) => {
    const r = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    if (!r.ok) toast.danger(j.error);
    return r.ok;
  };
  const saveName = async () => {
    setBusy("name");
    if (await patch({ name })) { toast.success("Nombre actualizado"); await load(); router.refresh(); }
    setBusy("");
  };
  const savePw = async () => {
    if (pw.next !== pw.again) return toast.danger("Las contraseñas nuevas no coinciden");
    setBusy("pw");
    if (await patch({ current: pw.current, password: pw.next })) {
      toast.success("Contraseña cambiada", { description: "Úsala la próxima vez que ingreses." });
      setPw({ current: "", next: "", again: "" });
    }
    setBusy("");
  };

  const initials = p.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const area = areaOf(p.area);
  const isOperator = p.role === "operator";
  const owner = !!p.company?.isOwner; // cuenta principal de su empresa

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Mi perfil" sub="Tus datos, lo que te toca hacer en el sistema y tu contraseña." />

      {p.company && (
        <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">
              {p.company.isOwner && <span className="mr-1.5 rounded-full bg-sb-primary px-2 py-0.5 text-[10px] font-semibold text-sb-on-primary">Empresa {companyCode(p.company.id)}</span>}
              {p.company.name}
            </h3>
            <p className="text-[12px] text-sb-on-surface-variant">
              {p.company.canEdit ? "Foto de perfil de tu empresa: se ve en el menú de todas sus cuentas." : "Tu empresa."}
            </p>
          </div>
          {p.company.canEdit ? (
            <LogoPicker id={p.company.id} name={p.company.name} v={p.company.v} onChange={() => { load(); router.refresh(); }} />
          ) : (
            <LogoBadge id={p.company.id} name={p.company.name} v={p.company.v} className="h-14 w-14 rounded-2xl text-base" />
          )}
        </Card>
      )}

      <Card className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-sb-primary text-xl font-semibold text-sb-on-primary">{initials}</div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold tracking-tight">{p.name}</h3>
          <p className="truncate text-sm text-sb-on-surface-variant">{p.email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill active>{roleLabel(p.role, owner)}</Pill>
            {area && area.id !== "CUSTOM" && <Pill>{area.label}</Pill>}
            {p.carrier && <Pill>{p.carrier}</Pill>}
          </div>
        </div>
      </Card>

      {p.role !== "viewer" && p.role !== "dealer" && <StatGrid
        className="grid-cols-2 lg:grid-cols-4"
        items={[
          { label: "Registros hoy", value: p.activity.today, icon: Activity },
          { label: "Últimos 7 días", value: p.activity.week, icon: CalendarDays },
          { label: "Total de registros", value: p.activity.total.toLocaleString(), icon: Upload },
          { label: "Último registro", value: p.activity.last ? p.activity.last.slice(5).replace("-", "/") : "—", icon: Clock },
        ]}
      />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-1 text-sm font-semibold">Mi cuenta</h3>
          <p className="mb-2 text-[12px] text-sb-on-surface-variant/70">
            {owner ? `Cuenta principal de la empresa ${companyCode(p.company!.id)}: administras todo tu sistema, tus supervisores, consorcios y dealers.` : ROLE_DESC[p.role]}
          </p>
          <Row label="Rol">{owner ? `Empresa ${companyCode(p.company!.id)}` : roleLabel(p.role)}</Row>
          {isOperator && <Row label="Área">{area?.label ?? "—"}</Row>}
          {isOperator && <Row label="Empresa de transporte">{p.carrier ?? "Todas"}</Row>}
          {isOperator && <Row label="Carga de Excel">{p.canImport ? "Permitida" : "No permitida"}</Row>}
          <Row label="Cuenta creada">{p.created_at.split("-").reverse().join("/")}</Row>
          {isOperator && (
            <div className="pt-3">
              <span className="text-[11px] uppercase tracking-wider text-sb-on-surface-variant/60">Mis etapas</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.stages.length ? p.stages.map((st) => <Pill key={st.site + st.field}>{st.site} · {stageLabel(st.site, st.field)}</Pill>) : <span className="text-sm text-sb-on-surface-variant">Sin etapas asignadas</span>}
              </div>
            </div>
          )}
          {(p.role === "dev" || p.role === "admin") && <p className="pt-3 text-[12px] text-sb-on-surface-variant/70">Tienes acceso a todas las etapas de PCL y YUR.</p>}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-5">
            <h3 className="text-sm font-semibold">Nombre</h3>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre" autoComplete="name" />
            <p className="text-[11px] text-sb-on-surface-variant/70">El correo lo cambia un administrador desde Usuarios.</p>
            <div className="flex justify-end">
              <Button variant="primary" className="rounded-full" isDisabled={busy !== "" || name.trim() === p.name || name.trim().length < 2} onPress={saveName}>
                <Save className="h-4 w-4" /> {busy === "name" ? "Guardando…" : "Guardar nombre"}
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); savePw(); }}>
              <h3 className="text-sm font-semibold">Cambiar contraseña</h3>
              <input type="email" value={p.email} autoComplete="username" readOnly hidden />
              <input className={input} type="password" placeholder="Contraseña actual" aria-label="Contraseña actual" autoComplete="current-password"
                value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              <input className={input} type="password" placeholder="Nueva contraseña (mín. 8)" aria-label="Nueva contraseña" autoComplete="new-password"
                value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              <input className={input} type="password" placeholder="Repite la nueva contraseña" aria-label="Repite la nueva contraseña" autoComplete="new-password"
                value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} />
              {pw.again && pw.next !== pw.again && <p className="text-[11px] text-red-500">No coinciden.</p>}
              <div className="flex justify-end">
                <Button type="submit" variant="primary" className="rounded-full" isDisabled={busy !== "" || !pw.current || pw.next.length < 8 || pw.next !== pw.again}>
                  <KeyRound className="h-4 w-4" /> {busy === "pw" ? "Cambiando…" : "Cambiar contraseña"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
