import { NextResponse } from "next/server";
import { query, queryList } from "@/lib/db";
import { guard, SUPER } from "@/lib/guard";
import { SITES, SITE_INFO, type DateField, type Site } from "@/lib/hsp";

/**
 * Seguimiento en vivo (solo super admin): encargados, su bandeja de pendientes,
 * lo que registraron hoy y la actividad reciente. La pantalla lo consulta cada pocos segundos.
 */
export async function GET(req: Request) {
  const { err } = await guard([...SUPER, "viewer"]);
  if (err) return err;
  const after = Number(new URL(req.url).searchParams.get("after")) || 0;

  const [groups, users, stages, todayByUser, events] = await Promise.all([
    query<{ site: Site; next_step: DateField | null; n: number }>(
      `SELECT site, next_step, COUNT(*) n FROM v_units WHERE next_step IS NOT NULL GROUP BY site, next_step ORDER BY site ASC, next_step ASC`,
    ),
    query<{ id: number; name: string; email: string; role: string; area: string | null; carrier: string | null; last_seen: string | null; online: number }>(
      `SELECT id, name, email, role, area, carrier, DATE_FORMAT(last_seen,'%Y-%m-%d %H:%i:%s') last_seen,
         (last_seen > NOW() - INTERVAL 60 SECOND) online
       FROM users ORDER BY role = 'operator' DESC, name, id`,
    ),
    query<{ user_id: number; site: Site; field: DateField }>("SELECT user_id, site, field FROM user_stages"),
    query<{ user_id: number; n: number; last_at: string }>(
      `SELECT user_id, COUNT(*) n, DATE_FORMAT(MAX(at),'%Y-%m-%d %H:%i:%s') last_at
       FROM unit_events WHERE at >= CURDATE() GROUP BY user_id ORDER BY user_id ASC`,
    ),
    queryList<Record<string, unknown>>(
      `SELECT e.id, DATE_FORMAT(e.at,'%Y-%m-%d %H:%i:%s') at, e.field, e.old_value, e.new_value,
         u.site, u.chassis, u.id unit_id, v.status, us.name user_name, us.role user_role
       FROM unit_events e
       JOIN units u ON u.id = e.unit_id
       JOIN v_units v ON v.id = e.unit_id
       LEFT JOIN users us ON us.id = e.user_id
       WHERE e.id > ?
       ORDER BY e.id DESC LIMIT 60`,
      [after],
    ),
  ]);

  // Bandeja por etapa: unidades cuya siguiente etapa es esa
  const pending: Record<string, number> = {};
  for (const site of SITES) for (const { key } of SITE_INFO[site].dates) pending[`${site}|${key}`] = 0;
  for (const g of groups) if (g.next_step) pending[`${g.site}|${g.next_step}`] = Number(g.n);

  const [{ now }] = await query<{ now: string }>("SELECT DATE_FORMAT(NOW(),'%Y-%m-%d %H:%i:%s') now");
  const today = new Map(todayByUser.map((t) => [t.user_id, t]));
  return NextResponse.json({
    now,
    pending,
    users: users.map((u) => ({
      ...u,
      online: !!Number(u.online),
      stages: stages.filter((s) => s.user_id === u.id).map(({ site, field }) => ({ site, field })),
      today: Number(today.get(u.id)?.n ?? 0),
      lastAction: today.get(u.id)?.last_at ?? null,
    })),
    events,
  });
}
