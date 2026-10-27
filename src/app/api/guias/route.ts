import { NextResponse } from "next/server";
import { queryList } from "@/lib/db";
import { getScope, guard } from "@/lib/guard";
import { DATE_FIELDS, SITE_INFO, isSite, type DateField } from "@/lib/hsp";
import { isSuper } from "@/lib/workflow";

/**
 * Carga por guía de remisión: las unidades que esperan una etapa, agrupadas por guía.
 * Una guía trae varias motos/motokares; el encargado marca las guías y registra la fecha de su etapa de una vez.
 *
 * GET /api/guias?site=PCL&stage=d_zarpe[&q=0T005]       -> guías pendientes de esa etapa
 * GET /api/guias?site=PCL&stage=d_zarpe&guia=09-0T005-1 -> unidades de esa guía
 * Para guardar se usa PATCH /api/units con los ids (mismas reglas que en «Mi trabajo»).
 */
export async function GET(req: Request) {
  const { s, err } = await guard(["dev", "admin", "operator"]);
  if (err) return err;
  const p = new URL(req.url).searchParams;
  const site = p.get("site");
  if (!isSite(site)) return NextResponse.json({ error: "Módulo inválido" }, { status: 400 });

  // Etapas que puede ver: el encargado, solo las suyas en ese módulo; la empresa, todas
  const scope = isSuper(s.role) ? null : await getScope(s.id);
  const stages = scope
    ? scope.stages.filter((st) => st.site === site).map((st) => st.field as DateField)
    : SITE_INFO[site].dates.map((d) => d.key);
  if (!stages.length) return NextResponse.json({ error: "No tienes etapas en este módulo" }, { status: 403 });
  const asked = p.get("stage") as DateField | null;
  const stage = asked && stages.includes(asked) ? asked : stages[0];

  const where = ["site = ?", "next_step = ?", "guia IS NOT NULL", "guia <> ''"];
  const args: unknown[] = [site, stage];
  if (scope?.carrier) { where.push("carrier = ?"); args.push(scope.carrier); }

  const guia = p.get("guia");
  if (guia) {
    const units = await queryList(
      `SELECT id, chassis, motor, material, category, dealer, billing_date, est_date, service, delay_reason, nave
       FROM v_units WHERE ${where.join(" AND ")} AND guia = ? ORDER BY chassis`,
      [...args, guia],
    );
    return NextResponse.json({ units });
  }

  const q = p.get("q")?.trim();
  if (q) {
    // Varias guías separadas por coma, espacio o salto de línea (como las anota el encargado)
    const parts = q.split(/[\s,;]+/).filter(Boolean).slice(0, 50);
    where.push(`(${parts.map(() => "guia LIKE ? OR chassis LIKE ? OR dealer LIKE ?").join(" OR ")})`);
    for (const t of parts) args.push(`%${t}%`, `%${t}%`, `%${t}%`);
  }

  const [groups, naves, [none]] = await Promise.all([
    queryList<{
      guia: string; n: number; w2: number; w3: number; billing: string | null; est: string | null; dealers: string | null;
      invoices: string | null; naves: string | null; need_reason: number; prev: string | null; ids: string;
    }>(
      `SELECT guia, COUNT(*) n, SUM(category = '2W') w2, SUM(category = '3W') w3, MIN(billing_date) billing, MIN(est_date) est,
         string_agg(DISTINCT dealer, ' · ') dealers, string_agg(DISTINCT invoice, ' · ') invoices, string_agg(DISTINCT nave, ' · ') naves,
         SUM(est_date < CURDATE() AND delay_reason IS NULL) need_reason,
         MAX(GREATEST(${DATE_FIELDS.join(", ")})) prev,
         string_agg(CAST(id AS text), ',') ids
       FROM v_units WHERE ${where.join(" AND ")}
       GROUP BY guia ORDER BY MIN(billing_date) ASC, guia ASC LIMIT 400`,
      args,
    ),
    queryList<{ v: string }>("SELECT DISTINCT UPPER(nave) v FROM units WHERE nave IS NOT NULL AND nave <> '' ORDER BY v LIMIT 300"),
    // Unidades pendientes sin guía (no se pueden cargar por guía: van por «Mi trabajo» o el módulo)
    queryList<{ n: number }>(
      `SELECT COUNT(*) n FROM v_units WHERE site = ? AND next_step = ? AND (guia IS NULL OR guia = '')${scope?.carrier ? " AND carrier = ?" : ""}`,
      scope?.carrier ? [site, stage, scope.carrier] : [site, stage],
    ),
  ]);

  return NextResponse.json({
    site, stage, stages,
    groups: groups.map((g) => ({ ...g, ids: g.ids.split(",").map(Number), need_reason: Number(g.need_reason ?? 0) })),
    naves: naves.map((r) => r.v),
    withoutGuia: Number(none?.n ?? 0),
  });
}
