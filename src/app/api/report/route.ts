import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { queryList } from "@/lib/db";
import { guard } from "@/lib/guard";
import { reportScope } from "@/lib/report";
import { SITE_INFO, STATUS_LABEL, type Status } from "@/lib/hsp";
import { today } from "@/lib/workflow";

/**
 * Reporte de estados en Excel (lo que Leyva le pasa a Honda, o lo que Honda descarga con su usuario).
 * - The Iceberg Labs, la empresa, sus supervisores y Honda (solo lectura): todas las unidades.
 * - Cliente de Honda: solo las de sus tiendas.
 * Hojas: Resumen por mes y estado · Sin entregar (más antiguas primero, FIFO) · Por cliente.
 */
export const maxDuration = 120;

const STATUSES: Status[] = ["IQT-PORT", "TRANSITO FLUVIAL", "ARRIBO PUERTO", "EN ALMACÉN", "TRANSITO DEALER", "EN ALMACÉN LIMA", "TRANSITO DEALER 2", "ENTREGADO"];

export async function GET(req: Request) {
  const { s, err } = await guard(["dev", "admin", "viewer", "dealer"]);
  if (err) return err;
  // Filtros opcionales: período, módulo y cliente (un cliente de Honda solo ve lo suyo)
  const scope = await reportScope(s, new URL(req.url).searchParams);
  if (!scope) return NextResponse.json({ error: "Tu cuenta no tiene un cliente asignado" }, { status: 404 });
  const { where, args } = scope;
  const who = [scope.title, ...scope.filters].join(" · ");

  const [byMonth, open, byClient] = await Promise.all([
    queryList<{ site: string; ym: string; status: Status; n: number; on_time: number; late: number }>(
      `SELECT site, DATE_FORMAT(billing_date,'%Y-%m') ym, status, COUNT(*) n,
         SUM(service='A TIEMPO') on_time, SUM(service='FUERA DE TIEMPO') late
       FROM v_units WHERE ${where} GROUP BY site, ym, status ORDER BY site, ym`,
      args,
    ),
    queryList<Record<string, unknown>>(
      `SELECT v.site, v.chassis, v.motor, v.material, v.guia, v.invoice, d.client, v.dealer, v.zone, v.status, v.billing_date, v.est_date, v.days_left,
         v.alert, v.service, v.carrier, v.delay_reason
       FROM v_units v LEFT JOIN dealers d ON d.id = v.dealer_id
       WHERE ${where.replace(/\bdealer_id\b/g, "v.dealer_id").replace(/\bbilling_date\b/g, "v.billing_date")} AND v.d_entrega IS NULL
       ORDER BY v.billing_date, v.id`,
      args,
    ),
    queryList<{ client: string | null; total: number; open: number; delivered: number; on_time: number }>(
      `SELECT d.client, COUNT(*) total, SUM(v.d_entrega IS NULL) open, SUM(v.d_entrega IS NOT NULL) delivered, SUM(v.service='A TIEMPO') on_time
       FROM v_units v LEFT JOIN dealers d ON d.id = v.dealer_id
       WHERE ${where.replace(/\bdealer_id\b/g, "v.dealer_id").replace(/\bbilling_date\b/g, "v.billing_date")}
       GROUP BY d.client ORDER BY total DESC, d.client ASC`,
      args,
    ),
  ]);

  // Hoja 1: resumen por módulo y mes, con la cantidad en cada estado y el % a tiempo
  const key = (r: { site: string; ym: string }) => `${r.site}|${r.ym}`;
  const groups = new Map<string, { site: string; ym: string; counts: Partial<Record<Status, number>>; total: number; onTime: number; late: number }>();
  for (const r of byMonth) {
    const g = groups.get(key(r)) ?? { site: r.site, ym: r.ym, counts: {}, total: 0, onTime: 0, late: 0 };
    g.counts[r.status] = Number(r.n);
    g.total += Number(r.n); g.onTime += Number(r.on_time); g.late += Number(r.late);
    groups.set(key(r), g);
  }
  const summary = [
    ["Módulo", "Mes de facturación", ...STATUSES.map((st) => STATUS_LABEL[st]), "Total", "Sin entregar", "A tiempo", "Fuera de tiempo", "% a tiempo"],
    ...[...groups.values()].map((g) => [
      SITE_INFO[g.site as "PCL" | "YUR"]?.title ?? g.site, g.ym, ...STATUSES.map((st) => g.counts[st] ?? 0), g.total,
      g.total - (g.counts["ENTREGADO"] ?? 0), g.onTime, g.late, g.total ? Math.round((100 * g.onTime) / g.total) : 0,
    ]),
  ];

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([[`Reporte de estados · ${who} · ${new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })}`], [], ...summary]);
  ws1["!cols"] = [{ wch: 18 }, { wch: 12 }, ...STATUSES.map(() => ({ wch: 14 })), { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Resumen");

  const ws2 = XLSX.utils.json_to_sheet(open.map((u) => ({
    Módulo: u.site, Chasis: u.chassis, Motor: u.motor, Modelo: u.material, "Guía de remisión": u.guia ?? "", Factura: u.invoice ?? "", Cliente: u.client, Tienda: u.dealer, Zona: u.zone,
    Estado: STATUS_LABEL[u.status as Status] ?? u.status, Facturada: u.billing_date, "Fecha estimada": u.est_date,
    "Días para vencer": u.days_left, Alerta: u.alert ?? "", "Nivel de servicio": u.service ?? "", Transportista: u.carrier ?? "",
    "Motivo de demora": u.delay_reason ?? "",
  })));
  XLSX.utils.book_append_sheet(wb, ws2, "Sin entregar (FIFO)");

  const ws3 = XLSX.utils.json_to_sheet(byClient.map((c) => ({
    Cliente: c.client ?? "(sin cliente)", Unidades: Number(c.total), Entregadas: Number(c.delivered), "Sin entregar": Number(c.open),
    "% a tiempo": Number(c.total) ? Math.round((100 * Number(c.on_time)) / Number(c.total)) : 0,
  })));
  XLSX.utils.book_append_sheet(wb, ws3, "Por cliente");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const name = `reporte-estados-${today()}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
