"use client";
import { Button, Chip, toast } from "@heroui/react";
import { Save, X } from "lucide-react";
import { Card, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { fmtDate, type Site } from "@/lib/hsp";

export type Preview = {
  name: string;
  token: string;
  format: "HSP" | "FACT";
  duplicates: number;
  sites: Record<Site, { total: number; created: number; updated: number }>;
  sample: {
    site: Site; chassis: string; motor: string | null; material: string | null; category: string | null;
    dealer: string | null; zone: string | null; billing: string | null; delivered: string | null; exists: boolean;
  }[];
  saved: boolean;
};

/** Lee el Excel en el servidor y devuelve la vista previa (no guarda nada). */
export async function readExcel(file: File): Promise<Preview | null> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/import", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({ error: "Error del servidor" }));
  if (!r.ok) { toast.danger(j.error); return null; }
  return { ...j, name: file.name, saved: false };
}

export function ImportPanel({
  preview, saving, onSave, onClose,
}: { preview: Preview; saving: boolean; onSave: () => void; onClose: () => void }) {
  const total = preview.sites.PCL.total + preview.sites.YUR.total;
  return (
    <Card className="sb-anim-table-in flex flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-sb-outline-variant/40 px-4 py-3">
        <div>
          <div className="text-sm font-semibold">
            Vista previa · {preview.name}{" "}
            <span className="font-normal text-sb-on-surface-variant/70">({preview.format === "HSP" ? "HSP-OFICIAL" : "PCL-FACT facturación"})</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-sb-on-surface-variant/80">
            {(["PCL", "YUR"] as const).filter((s) => preview.sites[s].total).map((s) => (
              <span key={s}>
                <b className="text-sb-on-surface">{s}</b>: {preview.sites[s].total.toLocaleString()} unidades · {preview.sites[s].created.toLocaleString()} nuevas · {preview.sites[s].updated.toLocaleString()} se actualizarán
              </span>
            ))}
            {preview.duplicates > 0 && <span>{preview.duplicates} chasis repetidos en el archivo (se toma la última fila)</span>}
          </div>
        </div>
        <button onClick={onClose} disabled={saving} aria-label="Cerrar vista previa" className="rounded-full p-1.5 opacity-50 hover:bg-sb-surface-container hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="scroll-hidden max-h-80 overflow-auto">
        <Table>
          <Thead>
            <Th>Módulo</Th><Th>Chasis / Motor</Th><Th>Modelo</Th><Th>Dealer</Th><Th>Zona</Th><Th>F. facturación</Th><Th>Entrega</Th><Th>Acción</Th>
          </Thead>
          <tbody>
            {preview.sample.map((r, i) => (
              <Tr key={`${r.site}-${r.chassis}-${i}`}>
                <Td>{r.site}</Td>
                <Td><div className="font-mono font-medium">{r.chassis}</div><div className="font-mono text-[10px] text-muted">{r.motor}</div></Td>
                <Td><div>{r.material}</div><div className="text-[10px] text-muted">{r.category}</div></Td>
                <Td className="max-w-[14rem] truncate">{r.dealer}</Td>
                <Td>{r.zone}</Td>
                <Td>{fmtDate(r.billing) || "—"}</Td>
                <Td>{fmtDate(r.delivered) || "—"}</Td>
                <Td><Chip size="sm" variant="soft" color={r.exists ? "default" : "accent"}>{r.exists ? "Actualizar" : "Nueva"}</Chip></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sb-outline-variant/40 px-4 py-3">
        <span className="text-[11px] text-sb-on-surface-variant/70">
          {total > preview.sample.length ? `Mostrando ${preview.sample.length} de ${total.toLocaleString()} filas.` : `${total} filas.`}
          {preview.format === "FACT" && " La facturación no borra las fechas que ya estén registradas."}
        </span>
        <div className="flex items-center gap-2">
          {!preview.saved && (
            <Button size="sm" variant="secondary" className="rounded-full" isDisabled={saving} onPress={onClose}>Cancelar</Button>
          )}
          <Button
            size="sm"
            variant="primary"
            className={`rounded-full transition-opacity duration-300 ${preview.saved ? "pointer-events-none opacity-30" : ""}`}
            isDisabled={saving || preview.saved || !total}
            onPress={onSave}
          >
            <Save className="h-3.5 w-3.5" /> {preview.saved ? "Guardado ✓" : saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
