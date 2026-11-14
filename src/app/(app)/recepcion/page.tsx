"use client";
import { useCallback, useEffect, useState } from "react";
import { TableLabels } from "@/components/TableLabels";
import { Button, toast } from "@heroui/react";
import { CheckCircle2, MessageSquareWarning, PackageCheck, Search } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { ChoiceCards } from "@/components/modal/ChoiceCards";
import { DatePicker, pastQuick } from "@/components/modal/DatePicker";
import { SuggestInput } from "@/components/SuggestInput";
import { DATA_EVENT } from "@/components/UploadCenter";
import { fmtDate } from "@/lib/hsp";
import { today } from "@/lib/workflow";
import { cn } from "@/lib/cn";
import { KindText } from "@/components/Kinds";

/**
 * 6. Entrega · Dealer: busca su guía de remisión y confirma que la recibió,
 * completa o con observación. Las observaciones las revisa la empresa (Leyva) aquí mismo.
 */

type Found = {
  guia: string; site: string; dealer: string; district: string; status: string; driver: string; tipo: string; w2: number; w3: number; total: number;
  pending: number; delivered: number; dispatched: number; last: string; receptions: { kind: string; note: string | null; received_on: string; created_at: string }[];
};
type Obs = { id: number; site: string; guia: string; note: string; received_on: string; units: number; usuario: string | null; dealer: string | null };

const field = "h-10 w-full rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-sm text-sb-on-surface outline-none focus:border-sb-on-surface";
const n = (v: number) => Number(v ?? 0).toLocaleString("es-PE");

/** La empresa ve las recepciones con observación y las marca como revisadas */
function Observations() {
  const [rows, setRows] = useState<Obs[] | null>(null);
  const load = useCallback(() => { fetch("/api/entrega?observations=1").then((r) => r.json()).then((j) => setRows(j.rows ?? [])); }, []);
  useEffect(() => {
    load();
    window.addEventListener(DATA_EVENT, load);
    return () => window.removeEventListener(DATA_EVENT, load);
  }, [load]);
  async function review(id: number) {
    const r = await fetch("/api/entrega", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review", id }) });
    if (!r.ok) return toast.danger("No se pudo marcar");
    setRows((x) => x?.filter((o) => o.id !== id) ?? null);
  }
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-sb-outline-variant/40 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><MessageSquareWarning className="h-4 w-4 text-sb-late" /> Observaciones de los dealers por revisar</h3>
        <span className="text-[11px] text-sb-on-surface-variant">{rows?.length ?? 0}</span>
      </div>
      <div className="flex flex-col">
        {rows?.map((o) => (
          <div key={o.id} className="flex flex-wrap items-start gap-3 border-b border-sb-outline-variant/20 px-4 py-3 text-xs last:border-0">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{o.dealer ?? "—"} <span className="font-mono font-normal text-sb-on-surface-variant">· {o.guia} · {o.site}</span></p>
              <p className="mt-1 rounded-lg bg-sb-late-soft/60 px-2 py-1.5 text-sb-on-surface">{o.note}</p>
              <p className="mt-1 text-[11px] text-sb-on-surface-variant">Recibido {fmtDate(o.received_on)} · {n(o.units)} unidades{o.usuario ? ` · registró ${o.usuario}` : ""}</p>
            </div>
            <Button size="sm" variant="secondary" className="rounded-full" onPress={() => review(o.id)}><CheckCircle2 className="h-3.5 w-3.5" /> Revisado</Button>
          </div>
        ))}
        {rows && !rows.length && <p className="px-4 py-6 text-center text-xs text-sb-on-surface-variant">No hay observaciones pendientes.</p>}
      </div>
    </Card>
  );
}

export default function RecepcionPage() {
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [input, setInput] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [looking, setLooking] = useState(false);
  const [kind, setKind] = useState<"completo" | "observacion">("completo");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);
  useEffect(() => { fetch("/api/me").then((r) => r.json()).then(setMe); }, []);

  async function look(g = input.trim()) {
    if (!g) return;
    setLooking(true);
    const r = await fetch(`/api/entrega?${new URLSearchParams({ guia: g })}`);
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setLooking(false);
    if (!r.ok) { setFound(null); return toast.danger(j.error); }
    setFound(j); setKind("completo"); setNote("");
  }

  async function save() {
    if (!found) return;
    if (kind === "observacion" && !note.trim()) return toast.danger("Escribe la observación");
    setSaving(true);
    const r = await fetch("/api/entrega", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "receive", guia: found.guia, kind, note, date }) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setSaving(false);
    if (!r.ok) return toast.danger(j.error);
    toast.success(kind === "completo" ? "Recepción confirmada: llegó completo" : "Recepción registrada con observación",
      { description: kind === "observacion" ? "La empresa revisará tu observación" : `${n(j.units)} unidades recibidas`, timeout: 7000 });
    look(found.guia);
  }

  if (!me) return <div className="p-6 text-sm text-sb-on-surface-variant">Cargando…</div>;
  const ready = !!found && found.dispatched > 0;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Entrega · Dealer" sub="6. Busca tu guía de remisión y confirma que la recibiste: completa o con observación." />
      <Card className="overflow-hidden">
        <div className="border-b border-sb-outline-variant/40 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><PackageCheck className="h-4 w-4" /> Confirmar recepción</h3>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_19rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); look(); }}>
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-[11px] text-sb-on-surface-variant">Guía de remisión
                <SuggestInput inputClassName={field} mono placeholder="Escribe tu guía para buscarla" value={input} onChange={setInput}
                  onPick={(v) => { setInput(v); look(v); }} onEnter={() => look()}
                  source={(q) => `/api/suggest?${new URLSearchParams({ kind: "guia", step: "dispatched", q })}`} />
              </label>
              <Button type="submit" variant="primary" className="rounded-full" isDisabled={looking || !input.trim()}><Search className="h-4 w-4" /> {looking ? "Buscando…" : "Buscar"}</Button>
              {found && <span className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Estado
                <span className="rounded-full border border-sb-outline-variant px-3 py-2 text-xs font-semibold text-sb-on-surface">{found.status}</span></span>}
            </form>
            <TableLabels className="rounded-xl border border-sb-outline-variant/40">
              <table className="w-full min-w-[460px] text-left text-xs">
                <thead>
                  <tr className="border-b border-sb-outline-variant/40 text-[10px] uppercase tracking-wider text-sb-on-surface-variant">
                    <th className="px-3 py-2 font-semibold">Guía</th><th className="px-2 py-2 font-semibold">Tipo</th><th className="px-2 py-2 font-semibold">Dealer</th><th className="px-3 py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {found ? (
                    <tr>
                      <td className="px-3 py-2.5 font-mono font-semibold">{found.guia}<span className="block font-sans text-[10px] font-normal text-sb-on-surface-variant">{found.district}{found.driver ? ` · chofer ${found.driver}` : ""}</span></td>
                      <td className="px-2 py-2.5">{found.tipo}<KindText w2={found.w2} w3={found.w3} className="block text-[10px]" /></td>
                      <td className="max-w-[16rem] truncate px-2 py-2.5" title={found.dealer}>{found.dealer}</td>
                      <td className="px-3 py-2.5 text-right text-base font-bold tabular-nums">{n(found.total)}</td>
                    </tr>
                  ) : <tr><td colSpan={4} className="px-3 py-8 text-center text-sb-on-surface-variant">Escribe tu guía y pulsa «Buscar».</td></tr>}
                </tbody>
              </table>
            </TableLabels>
            {found && !ready && <p className="rounded-xl bg-sb-surface-container-low px-3 py-2 text-xs text-sb-on-surface-variant">Esta guía todavía no sale del almacén: podrás confirmarla cuando la despachen.</p>}
            {found?.receptions.length ? (
              <div className="flex flex-col gap-1">
                <p className="text-[11px] text-sb-on-surface-variant">Recepciones registradas</p>
                {found.receptions.map((r, i) => (
                  <p key={i} className={cn("rounded-lg px-2.5 py-1.5 text-xs", r.kind === "completo" ? "bg-sb-primary-soft" : "bg-sb-late-soft/60")}>
                    <b>{r.kind === "completo" ? "Completo" : "Con observación"}</b> · {fmtDate(r.received_on)}{r.note ? ` — ${r.note}` : ""}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 border-t border-sb-outline-variant/40 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <ChoiceCards label="Cómo llegó" columns={1} value={kind} onChange={setKind} options={[
              { key: "completo", label: "Entregado completo", desc: "Llegó todo bien", icon: CheckCircle2, disabled: !ready },
              { key: "observacion", label: "Entregado con observación", desc: "Falta algo o llegó dañado", icon: MessageSquareWarning, disabled: !ready },
            ]} />
            <div className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Fecha de recepción
              <DatePicker label="Fecha de recepción" value={date} min={found?.last || null} onChange={setDate} disabled={!ready} quick={pastQuick(found?.last || null, today())} />
            </div>
            <label className="flex flex-col gap-1 text-[11px] text-sb-on-surface-variant">Observación{kind === "observacion" ? " (obligatoria)" : " (opcional)"}
              <textarea className={cn(field, "h-24 resize-none py-2")} value={note} onChange={(e) => setNote(e.target.value)} disabled={!ready} placeholder="Ej. llegó con el espejo roto" />
            </label>
            <Button variant="primary" className="rounded-full" onPress={save} isDisabled={saving || !ready}>{saving ? "Registrando…" : "Registrar recepción"}</Button>
            {kind === "observacion" && ready && <p className="text-[11px] text-sb-on-surface-variant">La empresa verá tu observación y la revisará.</p>}
          </div>
        </div>
      </Card>
      {me.role === "admin" && <Observations />}
    </div>
  );
}
