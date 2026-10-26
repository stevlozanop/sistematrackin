"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Switch, toast } from "@heroui/react";
import { ChevronRight, MapPin, Search, Ship, Truck, X } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { cn } from "@/lib/cn";

type Dealer = {
  id: number; name: string; department: string | null; district: string | null; coast: number; client: string | null;
  pcl: number; yur: number; pending: number; pending_pcl: number; pending_yur: number; pcl_region: string | null; yur_route: string | null;
};
type Site = "pcl" | "yur";

/** Provincias que en el Excel vienen como departamento: se agrupan en su región. */
const REGION_FIX: Record<string, string> = { "CORONEL PORTILLO": "UCAYALI", SATIPO: "JUNIN" };
/** Orden de las rutas de Yurimaguas (como en los plazos). */
const ROUTE_ORDER = ["RUTA ORIENTE 1", "RUTA ORIENTE 2", "RUTA ORIENTE 3", "RUTA ORIENTE 4", "RUTA ORIENTE 5", "RUTA NORTE 1"];

const SITES = {
  pcl: { title: "PCL · Pucallpa", icon: Ship, regionLabel: "Departamento", desc: "Tiendas que reciben unidades desde Pucallpa, agrupadas por departamento." },
  yur: { title: "YUR · Yurimaguas", icon: Truck, regionLabel: "Ruta", desc: "Tiendas que reciben unidades desde Yurimaguas, agrupadas por ruta (define su plazo)." },
} as const;

/** Región de una tienda en el módulo: departamento (PCL) o ruta (YUR). */
function regionOf(d: Dealer, site: Site) {
  if (site === "yur") return d.yur_route ?? "SIN RUTA";
  const r = (d.pcl_region ?? d.department ?? "SIN DEPARTAMENTO").toUpperCase();
  return REGION_FIX[r] ?? r;
}
const regionRank = (r: string, site: Site) => (site === "yur" ? (ROUTE_ORDER.indexOf(r) + 1 || 99) : r.startsWith("SIN ") ? 99 : 0);

export default function DealersPage() {
  const [rows, setRows] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [site, setSite] = useState<Site>("pcl");
  // Regiones abiertas (clic en la región la abre; otro clic la cierra). Al buscar se abren todas.
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const isOpen = (region: string) => !!q.trim() || opened.has(`${site}|${region}`);
  const toggle = (region: string) => setOpened((p) => {
    const k = `${site}|${region}`;
    const n = new Set(p);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  // Solo la empresa (Leyva) cambia el cliente y la Ruta Lima; The Iceberg Labs y Honda solo miran
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    fetch("/api/dealers").then((r) => r.json()).then((d) => { setRows(d); setLoading(false); });
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((m) => setCanEdit(m?.role === "admin")).catch(() => {});
  }, []);

  async function setLima(d: Dealer, on: boolean) {
    setRows((p) => p.map((x) => (x.id === d.id ? { ...x, coast: on ? 1 : 0 } : x)));
    const r = await fetch("/api/dealers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id, coast: on }) });
    if (!r.ok) toast.danger("No se pudo guardar");
    else toast.success(on ? `${d.name} va por Ruta Lima` : `${d.name} va directo al dealer`, { description: on ? "Después del despacho (5) pasa por 5.1 y 5.2 antes de la entrega (6)." : "Después del despacho (5) sigue la entrega (6)." });
  }
  const limaCount = rows.filter((d) => Number(d.coast)).length;
  const clients = useMemo(() => [...new Set(rows.map((d) => d.client).filter((c): c is string => !!c))].sort(), [rows]);
  /** Cambia el cliente de una tienda (al salir del campo). */
  async function setClient(d: Dealer, value: string) {
    const v = value.trim().toUpperCase();
    if (!v || v === d.client) return;
    const r = await fetch("/api/dealers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id, client: v }) });
    if (!r.ok) return toast.danger("No se pudo guardar");
    setRows((p) => p.map((x) => (x.id === d.id ? { ...x, client: v } : x)));
    toast.success(`${d.name} ahora es de ${v}`, { description: "Las cuentas de ese cliente ya ven esta tienda." });
  }
  const clientInput = (d: Dealer) => !canEdit ? <span className="text-xs">{d.client ?? "—"}</span> : (
    <input key={`${d.id}-${d.client}`} list="clientes" defaultValue={d.client ?? ""} onBlur={(e) => setClient(d, e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} aria-label={`Cliente de ${d.name}`}
      className="h-8 w-full min-w-[11rem] rounded-xl border border-sb-outline-variant bg-sb-surface-container-low px-2 text-xs outline-none focus:border-sb-primary" />
  );
  const limaSwitch = (d: Dealer, label?: boolean) => !canEdit ? (
    <span className="text-xs">{label ? "Ruta Lima (5.1 → 5.2): " : ""}{Number(d.coast) ? "Sí" : "No"}</span>
  ) : (
    <Switch size="sm" isSelected={!!Number(d.coast)} onChange={(v) => setLima(d, v)}>
      <Switch.Content aria-label={`Ruta Lima para ${d.name}`} className="cursor-pointer gap-2 text-xs">
        <Switch.Control><Switch.Thumb /></Switch.Control>
        {label ? "Ruta Lima (5.1 → 5.2): " : ""}{Number(d.coast) ? "Sí" : "No"}
      </Switch.Content>
    </Switch>
  );
  const link = (d: Dealer) => `/units/${site}?dealer=${encodeURIComponent(d.name)}`;

  // Tiendas del módulo elegido (solo las que tienen unidades ahí), agrupadas por región y en orden
  const count = (d: Dealer) => Number(site === "pcl" ? d.pcl : d.yur);
  const pend = (d: Dealer) => Number(site === "pcl" ? d.pending_pcl : d.pending_yur);
  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = rows
      .filter((d) => Number(site === "pcl" ? d.pcl : d.yur) > 0)
      .filter((d) => !t || [d.name, d.client, d.department, d.district, regionOf(d, site)].some((v) => v?.toLowerCase().includes(t)));
    const map = new Map<string, Dealer[]>();
    for (const d of list) map.set(regionOf(d, site), [...(map.get(regionOf(d, site)) ?? []), d]);
    return [...map.entries()]
      .sort((a, b) => regionRank(a[0], site) - regionRank(b[0], site) || a[0].localeCompare(b[0]))
      .map(([region, ds]) => ({ region, dealers: ds.sort((a, b) => (a.client ?? "").localeCompare(b.client ?? "") || a.name.localeCompare(b.name)) }));
  }, [rows, q, site]);
  const inSite = (s: Site) => rows.filter((d) => Number(s === "pcl" ? d.pcl : d.yur) > 0).length;
  const info = SITES[site];
  const total = groups.reduce((n, g) => n + g.dealers.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Dealers" sub={`${rows.length} tiendas de ${clients.length} clientes · se crean solas al cargar el Excel (PCL: Nombre Tienda · YUR: Destinatario).`} />
      <datalist id="clientes">{clients.map((c) => <option key={c} value={c} />)}</datalist>

      {/* Módulo: lo de Pucallpa en Pucallpa y lo de Yurimaguas en Yurimaguas */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Módulo">
        {(Object.keys(SITES) as Site[]).map((s) => {
          const Icon = SITES[s].icon;
          return (
            <button key={s} role="tab" aria-selected={site === s} className={`sbf-chip flex items-center gap-1.5 ${site === s ? "active" : ""}`} onClick={() => setSite(s)}>
              <Icon className="h-3.5 w-3.5" /> {SITES[s].title} <span className="opacity-60">({inSite(s)})</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1 text-xs text-sb-on-surface-variant">
        <p>{info.desc} Una tienda que recibe de los dos módulos aparece en ambos, con sus unidades de cada uno.</p>
        <p>
          <b>Cliente</b>: el cliente de Honda dueño de la tienda (SORSA, CREDIVARGAS…). Sus cuentas ven todas sus tiendas y nada de otros clientes.
          {canEdit ? " Si una tienda quedó en el cliente equivocado, cámbialo aquí." : " El cliente y la Ruta Lima los cambia la empresa (Leyva)."}
        </p>
        {site === "pcl" && (
          <p><b>Ruta Lima</b> ({limaCount} dealers): después del despacho (5) pasan por el almacén de Lima: 5.1 entrega (in) y 5.2 salida (out), y luego 6 entrega al dealer.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
      <label className="sbf-search w-full lg:w-96">
        <Search className="h-4 w-4 opacity-40" />
        <input placeholder={`Buscar dealer, cliente o ${info.regionLabel.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button onClick={() => setQ("")} className="opacity-40 hover:opacity-100" aria-label="Borrar búsqueda"><X className="h-4 w-4" /></button>}
      </label>
        <button className="sbf-chip" onClick={() => setOpened((p) => new Set([...p, ...groups.map((g) => `${site}|${g.region}`)]))}>Abrir todas</button>
        <button className="sbf-chip" onClick={() => setOpened((p) => new Set([...p].filter((k) => !k.startsWith(`${site}|`))))}>Cerrar todas</button>
      </div>

      {!total && <Card className="px-4 py-10 text-center text-sm text-sb-on-surface-variant/60">{loading ? "Cargando…" : q ? "Sin resultados." : "Aún no hay dealers en este módulo."}</Card>}

      {/* Celular: tarjetas por región */}
      <div className="flex flex-col gap-4 md:hidden">
        {groups.map((g) => (
          <section key={g.region} className="flex flex-col gap-2">
            <button type="button" onClick={() => toggle(g.region)} aria-expanded={isOpen(g.region)}
              className="flex items-center gap-1.5 rounded-xl bg-sb-surface px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-sb-on-surface-variant">
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isOpen(g.region) && "rotate-90")} />
              <MapPin className="h-3.5 w-3.5 text-sb-primary" /> {g.region}
              <span className="ml-auto font-normal normal-case">{g.dealers.length} {g.dealers.length === 1 ? "tienda" : "tiendas"}</span>
            </button>
            {isOpen(g.region) && g.dealers.map((d) => (
              <Card key={d.id} className="flex flex-col gap-2 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{d.name}</div>
                  <div className="text-[11px] text-muted">{d.district ?? "—"}</div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <Link className="underline underline-offset-2" href={link(d)}>{count(d).toLocaleString()} unidades</Link>
                  <span className="text-muted">Sin entregar: {pend(d) || 0}</span>
                </div>
                <label className="flex flex-col gap-1 text-[11px] text-muted">Cliente{clientInput(d)}</label>
                {site === "pcl" && limaSwitch(d, true)}
              </Card>
            ))}
          </section>
        ))}
      </div>

      {total > 0 && (
        <Card className="sb-anim-table-in hidden overflow-hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant/60">
                  <th className="px-3 py-2.5 font-semibold">Dealer</th>
                  <th className="px-3 py-2.5 font-semibold">Cliente</th>
                  {site === "pcl" && <th className="px-3 py-2.5 font-semibold">Ruta Lima (5.1 → 5.2)</th>}
                  <th className="px-3 py-2.5 font-semibold">Distrito</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Unidades {site.toUpperCase()}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Sin entregar</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.region}>
                    {/* Encabezado de la región */}
                    <tr className="cursor-pointer border-b border-sb-outline-variant/25 bg-sb-surface-container-low transition-colors hover:bg-sb-surface-container" onClick={() => toggle(g.region)}>
                      <td colSpan={site === "pcl" ? 6 : 5} className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-sb-on-surface-variant">
                        <button type="button" aria-expanded={isOpen(g.region)} className="inline-flex w-full items-center gap-1.5 text-left uppercase"
                          onClick={(e) => { e.stopPropagation(); toggle(g.region); }}>
                          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isOpen(g.region) && "rotate-90")} />
                          <MapPin className="h-3.5 w-3.5 text-sb-primary" /> {g.region}
                          <span className="font-normal normal-case">
                            · {g.dealers.length} {g.dealers.length === 1 ? "tienda" : "tiendas"} · {(() => { const n = g.dealers.reduce((t, d) => t + count(d), 0); return `${n.toLocaleString()} ${n === 1 ? "unidad" : "unidades"}`; })()}
                            {g.dealers.some((d) => pend(d)) && ` · ${g.dealers.reduce((n, d) => n + pend(d), 0).toLocaleString()} sin entregar`}
                          </span>
                        </button>
                      </td>
                    </tr>
                    {isOpen(g.region) && g.dealers.map((d) => (
                      <tr key={d.id} className="border-b border-sb-outline-variant/25 transition-colors hover:bg-sb-surface-container-low">
                        <td className="px-3 py-2 font-medium text-sb-on-surface">{d.name}</td>
                        <td className="px-3 py-2">{clientInput(d)}</td>
                        {site === "pcl" && <td className="px-3 py-2">{limaSwitch(d)}</td>}
                        <td className="px-3 py-2 text-sb-on-surface/80">{d.district ?? "—"}</td>
                        <td className="px-3 py-2 text-right"><Link className="hover:underline" href={link(d)}>{count(d).toLocaleString()}</Link></td>
                        <td className={cn("px-3 py-2 text-right", pend(d) ? "" : "text-sb-on-surface-variant")}>{pend(d) || "—"}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
