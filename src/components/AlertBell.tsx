"use client";
import { DATA_EVENT } from "@/components/UploadCenter";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/cn";

/** Campana con el número de unidades vencidas o por vencer (se actualiza cada minuto). */
export function AlertBell({ href }: { href: string }) {
  const [n, setN] = useState<{ total: number; overdue: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/alerts").then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (!alive || !j) return;
        const overdue = (j.bySite as { alert: string; n: number }[]).filter((r) => r.alert === "VENCIDA").reduce((t, r) => t + Number(r.n), 0);
        setN({ total: j.total, overdue });
      });
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener(DATA_EVENT, load);
    return () => { alive = false; clearInterval(t); window.removeEventListener(DATA_EVENT, load); };
  }, []);

  const label = n ? `${n.overdue} vencidas y ${n.total - n.overdue} por vencer` : "Alertas";
  return (
    <Link href={href} title={label} aria-label={`Alertas: ${label}`}
      className="relative grid h-8 w-8 place-items-center rounded-full bg-sb-surface-container-high text-sb-on-surface-variant transition-colors hover:text-sb-on-surface">
      <Bell className="h-4 w-4" />
      {!!n?.total && (
        <span className={cn(
          "absolute -right-1 -top-1 min-w-[18px] rounded-full px-1 text-center text-[10px] font-bold leading-[18px]",
          n.overdue ? "bg-sb-primary text-sb-on-primary" : "bg-sb-surface-container-highest text-sb-on-surface",
        )}>
          {n.total > 999 ? "999+" : n.total}
        </span>
      )}
    </Link>
  );
}
