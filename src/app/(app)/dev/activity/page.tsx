"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Card, Checkbox, PageTitle } from "@/components/ui";
import { Chips, Feed, LiveDot, useFresh, useLive, type FeedRow } from "@/components/dev/DevKit";

const KINDS = [
  { key: "all", label: "Todo" },
  { key: "view", label: "Pantallas" },
  { key: "auth", label: "Ingresos y salidas" },
  { key: "fail", label: "Fallidos" },
  { key: "event", label: "Fechas registradas" },
  { key: "import", label: "Excel" },
] as const;
type Kind = (typeof KINDS)[number]["key"];

/** Consola The Iceberg Labs · Interacciones: todo lo que hacen las cuentas, en tiempo real (últimos 30 días). */
export default function DevActivityPage() {
  return <Suspense><DevActivity /></Suspense>;
}

function DevActivity() {
  const sp = useSearchParams();
  const user = Number(sp.get("user")) || 0;
  const [kind, setKind] = useState<Kind>("all");
  const [withDev, setWithDev] = useState(false);
  const qs = new URLSearchParams({ kind, limit: "250", ...(user ? { user: String(user) } : {}), ...(withDev || user ? { dev: "1" } : {}) });
  const { data, at } = useLive<{ rows: FeedRow[] }>(`/api/dev/activity?${qs}`, 4000);
  const fresh = useFresh(data?.rows);
  const who = user ? data?.rows.find((r) => r.user_id === user)?.name : null;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Interacciones" sub="Pantallas abiertas, ingresos (y los fallidos), fechas registradas y Excel subidos por cada cuenta. Datos reales, últimos 30 días.">
        <LiveDot at={at} />
      </PageTitle>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chips value={kind} onChange={setKind} options={[...KINDS]} />
        <div className="flex items-center gap-3">
          {user ? (
            <Link href="/dev/activity" className="inline-flex items-center gap-1.5 rounded-full bg-sb-primary px-3 py-1 text-[11px] font-medium text-sb-on-primary">
              Solo {who ?? `la cuenta #${user}`} <X className="h-3 w-3" />
            </Link>
          ) : (
            <label className="flex items-center gap-2 text-[11px] text-sb-on-surface-variant">
              <Checkbox checked={withDev} onChange={setWithDev} label="Incluir a The Iceberg Labs" /> Incluir The Iceberg Labs
            </label>
          )}
        </div>
      </div>
      <Card className="px-5 py-2">
        {data ? <Feed rows={data.rows} fresh={fresh} /> : <p className="py-8 text-center text-xs text-sb-on-surface-variant">Cargando…</p>}
      </Card>
      {data && data.rows.length >= 250 && <p className="text-center text-[11px] text-sb-on-surface-variant">Se muestran las 250 más recientes. Filtra por tipo o por cuenta para ver más atrás.</p>}
    </div>
  );
}
