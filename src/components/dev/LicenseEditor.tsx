"use client";
import { useState } from "react";
import { parseDate, type DateValue } from "@internationalized/date";
import { Button, Calendar, Description, Label, NumberField, ProgressBar, Slider, TextArea, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import type { Key } from "@heroui/react";
import { CalendarDays } from "lucide-react";
import { Sheet, SheetSection } from "@/components/modal/Sheet";
import { ChoiceCards } from "@/components/modal/ChoiceCards";
import { addMonths, daysBetween, fmtISO, humanDate, parseISO, todayLima } from "@/lib/dates";

/** Lo que se guarda */
export type LicenseForm = { plan: string; expiresAt: string; maxUsers: string; note: string };

const PLANS = [
  { key: "Prueba", label: "Prueba", desc: "Para probar el sistema unas semanas" },
  { key: "Estándar", label: "Estándar", desc: "Operación normal de la empresa" },
  { key: "Profesional", label: "Profesional", desc: "Más cuentas y consorcios" },
  { key: "Empresarial", label: "Empresarial", desc: "Grupo grande, sin límites" },
];
const WARN_DAYS = 15;
const short = (s: string) => { const d = parseISO(s); return `${d.getDate()}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };

/** Editor de licencia con componentes de HeroUI: plan, vencimiento en calendario, cupo de cuentas y nota */
export function LicenseEditor({ open, company, used, initial, busy, onCancel, onSave }: {
  open: boolean; company: string; used: number; initial: LicenseForm; busy: boolean; onCancel: () => void; onSave: (f: LicenseForm) => void;
}) {
  const [f, setF] = useState<LicenseForm>(initial);
  const set = (p: Partial<LicenseForm>) => setF((x) => ({ ...x, ...p }));
  const today = todayLima();
  const quick = [
    { id: "1", label: "+1 mes", v: fmtISO(addMonths(today, 1)) }, { id: "3", label: "+3 meses", v: fmtISO(addMonths(today, 3)) },
    { id: "6", label: "+6 meses", v: fmtISO(addMonths(today, 6)) }, { id: "12", label: "+1 año", v: fmtISO(addMonths(today, 12)) },
    { id: "none", label: "Sin vencimiento", v: "" },
  ];
  const quickKey = quick.find((q) => q.v === f.expiresAt)?.id;
  const days = f.expiresAt ? daysBetween(today, parseISO(f.expiresAt)) : null;
  const warnFrom = f.expiresAt ? fmtISO(new Date(parseISO(f.expiresAt).getTime() - WARN_DAYS * 864e5)) : null;
  const unlimited = f.maxUsers === "";
  const max = unlimited ? 0 : Number(f.maxUsers);
  const full = !unlimited && max < used;

  return (
    <Sheet open={open} onClose={onCancel} size="xl" busy={busy} icon={CalendarDays} title={`Licencia de ${company}`}
      sub="Plan, vencimiento y cupo de cuentas. Los cambios aplican al instante."
      summary={<>Plan <b className="text-sb-on-surface">{f.plan || "Estándar"}</b> · {f.expiresAt ? <>vence el <b className="text-sb-on-surface">{humanDate(f.expiresAt)}</b></> : "sin vencimiento"} · {f.maxUsers ? <>hasta <b className="text-sb-on-surface">{f.maxUsers}</b> cuentas</> : "cuentas sin límite"}</>}
      footer={<>
        <Button variant="secondary" isDisabled={busy} onPress={onCancel}>Cancelar</Button>
        <Button isDisabled={busy} onPress={() => onSave(f)}>{busy ? "Guardando…" : "Guardar licencia"}</Button>
      </>}>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-5">
          <SheetSection title="Plan">
            <ChoiceCards label="Plan" value={f.plan} onChange={(v) => set({ plan: v })} options={PLANS} />
          </SheetSection>

          <SheetSection title="Cupo de cuentas" hint="Cuenta a la empresa, sus consorcios y sus clientes.">
            <ToggleButtonGroup aria-label="Tipo de cupo" size="sm" disallowEmptySelection selectedKeys={new Set<Key>([unlimited ? "free" : "max"])}
              onSelectionChange={(k) => set({ maxUsers: k.has("free") ? "" : String(Math.max(used, 1)) })}>
              <ToggleButton id="free">Sin límite</ToggleButton>
              <ToggleButton id="max"><ToggleButtonGroup.Separator />Con máximo</ToggleButton>
            </ToggleButtonGroup>
            {unlimited ? (
              <Description>Puede crear todas las cuentas que necesite. Hoy tiene {used}.</Description>
            ) : (
              <div className="flex flex-col gap-3">
                <NumberField value={max} minValue={1} onChange={(v) => set({ maxUsers: String(v && v > 0 ? Math.round(v) : 1) })}>
                  <Label>Máximo de cuentas</Label>
                  <NumberField.Group>
                    <NumberField.DecrementButton />
                    <NumberField.Input />
                    <NumberField.IncrementButton />
                  </NumberField.Group>
                </NumberField>
                <Slider aria-label="Máximo de cuentas" value={max} minValue={1} maxValue={Math.max(used * 2, max + 10, 20)} onChange={(v) => set({ maxUsers: String(Array.isArray(v) ? v[0] : v) })}>
                  <Slider.Track><Slider.Fill /><Slider.Thumb /></Slider.Track>
                </Slider>
                <ProgressBar aria-label="Cuentas en uso" value={Math.min(used, max)} maxValue={Math.max(1, max)} size="sm"
                  color={full ? "danger" : used / max >= 0.85 ? "warning" : "accent"}>
                  <Label>{used} en uso</Label>
                  <ProgressBar.Output>{full ? "Lleno" : `${max - used} libres`}</ProgressBar.Output>
                  <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
                </ProgressBar>
                {full && <Description className="text-sb-late">Ya tiene {used} cuentas: no podrá crear nuevas hasta tener menos de {max}.</Description>}
              </div>
            )}
          </SheetSection>

          <SheetSection title="Nota">
            <TextArea aria-label="Nota" rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Ej. contrato firmado el 01/11, pago anual" />
          </SheetSection>
        </div>

        <SheetSection title="Vencimiento" hint={days !== null ? `En ${days} días` : "Sin fecha de vencimiento"}>
          <ToggleButtonGroup aria-label="Atajos de vencimiento" size="sm" className="flex-wrap" selectedKeys={new Set<Key>(quickKey ? [quickKey] : [])}
            onSelectionChange={(k) => { const id = [...k][0]; const q = quick.find((x) => x.id === id); if (q) set({ expiresAt: q.v }); }}>
            {quick.map((q, i) => <ToggleButton key={q.id} id={q.id}>{i > 0 && <ToggleButtonGroup.Separator />}{q.label}</ToggleButton>)}
          </ToggleButtonGroup>
          <Calendar aria-label="Fecha de vencimiento" className="w-full" firstDayOfWeek="mon" minValue={parseDate(fmtISO(today))}
            value={f.expiresAt ? parseDate(f.expiresAt) : null} onChange={(v: DateValue) => set({ expiresAt: v.toString() })}>
            <Calendar.Header>
              <Calendar.Heading />
              <Calendar.NavButton slot="previous" />
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
              <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
            </Calendar.Grid>
          </Calendar>
          {f.expiresAt && days !== null ? (
            <ProgressBar aria-label="Tiempo hasta el aviso" value={Math.max(0, days - WARN_DAYS)} maxValue={Math.max(1, days)} size="sm" color={days <= WARN_DAYS ? "warning" : "accent"}>
              <Label>{days} días de licencia</Label>
              <ProgressBar.Output>{short(f.expiresAt)}</ProgressBar.Output>
              <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
            </ProgressBar>
          ) : null}
          <Description>
            {!f.expiresAt ? "Sin vencimiento: la licencia sigue activa hasta que la suspendas."
              : days !== null && days <= WARN_DAYS ? "La empresa verá el aviso de vencimiento desde ya."
              : `Desde el ${short(warnFrom!)} la empresa ve el aviso. El ${short(f.expiresAt)} nadie entra hasta renovarla.`}
          </Description>
        </SheetSection>
      </div>
    </Sheet>
  );
}
