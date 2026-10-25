"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Switch, toast } from "@heroui/react";
import { Search, X } from "lucide-react";
import { Card, Empty, PageTitle, Table, Td, Th, Thead, Tr } from "@/components/ui";

type Dealer = { id: number; name: string; department: string | null; district: string | null; coast: number; pcl: number; yur: number; pending: number };

export default function DealersPage() {
  const [rows, setRows] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  useEffect(() => { fetch("/api/dealers").then((r) => r.json()).then((d) => { setRows(d); setLoading(false); }); }, []);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter((d) => [d.name, d.department, d.district].some((v) => v?.toLowerCase().includes(t))) : rows;
  }, [rows, q]);
  async function setLima(d: Dealer, on: boolean) {
    setRows((p) => p.map((x) => (x.id === d.id ? { ...x, coast: on ? 1 : 0 } : x)));
    const r = await fetch("/api/dealers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id, coast: on }) });
    if (!r.ok) toast.danger("No se pudo guardar");
    else toast.success(on ? `${d.name} va por Ruta Lima` : `${d.name} va directo al dealer`, { description: on ? "Después del despacho (5) pasa por 5.1 y 5.2 antes de la entrega (6)." : "Después del despacho (5) sigue la entrega (6)." });
  }
  const limaCount = rows.filter((d) => Number(d.coast)).length;
  const link = (site: string, d: Dealer) => `/units/${site}?dealer=${encodeURIComponent(d.name)}`;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Dealers" sub={`${rows.length} tiendas · se crean solas al cargar el Excel (PCL: Nombre Tienda · YUR: Destinatario).`} />
      <p className="-mt-2 text-xs text-sb-on-surface-variant">
        <b>Ruta Lima</b> ({limaCount} dealers): sus unidades de PCL, después del despacho (5), pasan por el almacén de Lima: 5.1 entrega (in) y 5.2 salida (out), y luego 6 entrega al dealer.
        Los demás van directo del despacho a la entrega.
      </p>
      <label className="sbf-search lg:w-96">
        <Search className="h-4 w-4 opacity-40" />
        <input placeholder="Buscar dealer, departamento o distrito…" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button onClick={() => setQ("")} className="opacity-40 hover:opacity-100"><X className="h-4 w-4" /></button>}
      </label>
      {/* Celular: tarjetas */}
      <div className="flex flex-col gap-2 md:hidden">
        {!list.length && <Card className="px-4 py-10 text-center text-sm text-sb-on-surface-variant/60">{loading ? "Cargando…" : "Aún no hay dealers."}</Card>}
        {list.map((d) => (
          <Card key={d.id} className="flex flex-col gap-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{d.name}</div>
                <div className="text-[11px] text-muted">{[d.department, d.district].filter(Boolean).join(" · ") || "—"}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {Number(d.pcl) > 0 && <Link className="underline underline-offset-2" href={link("pcl", d)}>PCL: {Number(d.pcl).toLocaleString()}</Link>}
              {Number(d.yur) > 0 && <Link className="underline underline-offset-2" href={link("yur", d)}>YUR: {Number(d.yur).toLocaleString()}</Link>}
              <span className="text-muted">Sin entregar: {Number(d.pending) || 0}</span>
            </div>
            <Switch size="sm" isSelected={!!Number(d.coast)} onChange={(v) => setLima(d, v)}>
              <Switch.Content aria-label={`Ruta Lima para ${d.name}`} className="cursor-pointer gap-2 text-xs">
                <Switch.Control><Switch.Thumb /></Switch.Control>
                Ruta Lima (5.1 → 5.2): {Number(d.coast) ? "Sí" : "No"}
              </Switch.Content>
            </Switch>
          </Card>
        ))}
      </div>

      <Card className="sb-anim-table-in hidden overflow-hidden md:block">
        <Table>
          <Thead><Th>Dealer</Th><Th>Ruta Lima (5.1 → 5.2)</Th><Th>Departamento</Th><Th>Distrito</Th><Th className="text-right">Unidades PCL</Th><Th className="text-right">Unidades YUR</Th><Th className="text-right">Sin entregar</Th></Thead>
          <tbody>
            {!list.length && <Empty cols={7}>{loading ? "Cargando…" : "Aún no hay dealers."}</Empty>}
            {list.map((d) => (
              <Tr key={d.id}>
                <Td className="font-medium text-sb-on-surface">{d.name}</Td>
                <Td>
                  <Switch size="sm" isSelected={!!Number(d.coast)} onChange={(v) => setLima(d, v)}>
                    <Switch.Content aria-label={`Ruta Lima para ${d.name}`} className="cursor-pointer gap-2 text-xs">
                      <Switch.Control><Switch.Thumb /></Switch.Control>
                      {Number(d.coast) ? "Sí" : "No"}
                    </Switch.Content>
                  </Switch>
                </Td>
                <Td>{d.department}</Td>
                <Td>{d.district}</Td>
                <Td className="text-right">{Number(d.pcl) ? <Link className="hover:underline" href={link("pcl", d)}>{Number(d.pcl).toLocaleString()}</Link> : "—"}</Td>
                <Td className="text-right">{Number(d.yur) ? <Link className="hover:underline" href={link("yur", d)}>{Number(d.yur).toLocaleString()}</Link> : "—"}</Td>
                <Td className="text-right">{Number(d.pending) || "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
