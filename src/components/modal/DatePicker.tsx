"use client";
import { parseDate, type DateValue } from "@internationalized/date";
import { Button, Calendar, DateField, DatePicker as HeroDatePicker, Label } from "@heroui/react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { addDays, fmtISO, todayLima } from "@/lib/dates";

export type Quick = { label: string; value: string };

/** Atajos para registrar una fecha que ya pasó: hoy, ayer y anteayer (respetando min y max) */
export function pastQuick(min?: string | null, max?: string | null): Quick[] {
  const t = todayLima();
  return [["Hoy", 0], ["Ayer", -1], ["Anteayer", -2]].map(([l, n]) => ({ label: l as string, value: fmtISO(addDays(t, n as number)) }))
    .filter((q) => (!min || q.value >= min) && (!max || q.value <= max));
}

const toDate = (s?: string | null) => { try { return s ? parseDate(s) : null; } catch { return null; } };

/**
 * Selector de fecha de HeroUI (campo por partes + calendario en un popover), con valores YYYY-MM-DD.
 * Atajos opcionales (Hoy, Ayer…) como botones de HeroUI y botón para borrar.
 */
export function DatePicker({ value, onChange, min, max, quick, clearable = false, disabled = false, label, className }: {
  value: string; onChange: (v: string) => void; min?: string | null; max?: string | null; quick?: Quick[];
  clearable?: boolean; disabled?: boolean; label?: string; className?: string;
  /** Se aceptan por compatibilidad; el popover de HeroUI decide cómo se muestra */
  placeholder?: string; mode?: "inline" | "popover"; id?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-end gap-1.5">
        <HeroDatePicker className="min-w-0 flex-1" aria-label={label ?? "Fecha"} isDisabled={disabled}
          value={toDate(value)} minValue={toDate(min) ?? undefined} maxValue={toDate(max) ?? undefined}
          onChange={(v: DateValue | null) => onChange(v ? v.toString() : "")}>
          {label && <Label className="sr-only">{label}</Label>}
          <DateField.Group fullWidth>
            <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
            <DateField.Suffix>
              <HeroDatePicker.Trigger><HeroDatePicker.TriggerIndicator /></HeroDatePicker.Trigger>
            </DateField.Suffix>
          </DateField.Group>
          <HeroDatePicker.Popover>
            <Calendar aria-label={label ?? "Elegir fecha"} firstDayOfWeek="mon">
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
          </HeroDatePicker.Popover>
        </HeroDatePicker>
        {clearable && value && !disabled && (
          <Button isIconOnly size="sm" variant="tertiary" aria-label="Borrar fecha" onPress={() => onChange("")}><X className="h-4 w-4" /></Button>
        )}
      </div>
      {!!quick?.length && !disabled && (
        <div className="flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <Button key={q.label} size="sm" variant={value === q.value ? "primary" : "secondary"} onPress={() => onChange(q.value)}>{q.label}</Button>
          ))}
        </div>
      )}
    </div>
  );
}
