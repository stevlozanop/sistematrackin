import type { TxConnection } from "./db";
import { DATE_FIELDS } from "./hsp";
import { TEXT_FIELDS, type UnitRow } from "./excel-parse";

export * from "./excel-parse";

/* ---------- Guardado en la base de datos ---------- */

/** La unidad todavía no tiene ninguna fecha de seguimiento (no empezó su recorrido). */
const NO_DATES = DATE_FIELDS.map((d) => `u.${d} IS NULL`).join(" AND ");

/** Chasis que están en la otra ruta sin fechas: al guardar se moverán a la ruta del Excel. Devuelve "SITE|CHASIS" (ruta nueva). */
export async function movable(exec: (sql: string, params: unknown[]) => Promise<unknown[]>, rows: Pick<UnitRow, "site" | "chassis">[]) {
  const set = new Set<string>();
  for (let i = 0; i < rows.length; i += 2000) {
    const chunk = rows.slice(i, i + 2000);
    const found = await exec(`SELECT u.site, u.chassis FROM units u WHERE u.chassis IN (?) AND ${NO_DATES}`, [chunk.map((r) => r.chassis)]);
    const at = new Map((found as { site: string; chassis: string }[]).map((f) => [f.chassis.toUpperCase(), f.site]));
    for (const r of chunk) {
      const s = at.get(r.chassis.toUpperCase());
      if (s && s !== r.site) set.add(`${r.site}|${r.chassis.toUpperCase()}`);
    }
  }
  return set;
}

const COLS = ["site", "chassis", "dealer_id", "billing_date", ...TEXT_FIELDS, ...DATE_FIELDS] as const;

/** Inserta o actualiza. Un valor vacío en el Excel nunca borra un dato que ya está en el sistema. */
export async function saveRows(c: TxConnection, input: UnitRow[]) {
  // Postgres no deja tocar la misma fila dos veces en un INSERT: un chasis repetido (aunque cambie en
  // mayúsculas) se queda con la última fila, como en el Excel
  const uniq = new Map<string, UnitRow>();
  for (const r of input) uniq.set(`${r.site}|${r.chassis.toUpperCase()}`, r);
  const rows = [...uniq.values()];
  // 1) Dealers (tiendas)
  const dealers = new Map<string, UnitRow>();
  for (const r of rows) if (r.dealer) dealers.set(r.dealer.slice(0, 160).toUpperCase(), r);
  const dl = [...dealers.entries()];
  for (let i = 0; i < dl.length; i += 500) {
    await c.query(
      `INSERT INTO dealers(name, department, district) VALUES ?
       ON CONFLICT (name) DO UPDATE SET department=COALESCE(EXCLUDED.department, dealers.department), district=COALESCE(EXCLUDED.district, dealers.district)`,
      [dl.slice(i, i + 500).map(([, r]) => [r.dealer!.slice(0, 160), r.fields.department, r.fields.district])],
    );
  }
  const ids = new Map<string, number>();
  for (let i = 0; i < dl.length; i += 500) {
    const [found] = await c.query("SELECT id, name FROM dealers WHERE name IN (?)", [dl.slice(i, i + 500).map(([, r]) => r.dealer!.slice(0, 160))]);
    for (const d of found as { id: number; name: string }[]) ids.set(d.name.toUpperCase(), d.id);
  }

  // 2) Unidades. Si el chasis está en la otra ruta y todavía no tiene ninguna fecha, se mueve a la del Excel
  //    (ej. una factura de Tarapoto que se cargó como PCL pasa a YUR). Si ya empezó su recorrido, no se toca.
  for (let i = 0; i < rows.length; i += 1000) {
    await c.query(
      `UPDATE units u SET site = v.site FROM (VALUES ?) AS v(site, chassis)
       WHERE u.chassis = v.chassis::citext AND u.site <> v.site::citext AND ${NO_DATES}
         AND NOT EXISTS (SELECT 1 FROM units x WHERE x.site = v.site::citext AND x.chassis = v.chassis::citext)`,
      [rows.slice(i, i + 1000).map((r) => [r.site, r.chassis])],
    );
  }
  const before = await existing(async (sql, p) => (await c.query(sql, p))[0] as unknown[], rows);
  const update = COLS.filter((k) => k !== "site" && k !== "chassis").map((k) => `${k}=COALESCE(EXCLUDED.${k}, units.${k})`).join(", ");
  for (let i = 0; i < rows.length; i += 1000) {
    const values = rows.slice(i, i + 1000).map((r) => [
      r.site, r.chassis, r.dealer ? ids.get(r.dealer.slice(0, 160).toUpperCase()) ?? null : null, r.billing_date,
      ...TEXT_FIELDS.map((f) => r.fields[f]),
      ...DATE_FIELDS.map((d) => r.dates[d] ?? null),
    ]);
    await c.query(`INSERT INTO units(${COLS.join(",")}) VALUES ? ON CONFLICT (site, chassis) DO UPDATE SET ${update}`, [values]);
  }
  const updated = rows.filter((r) => before.has(`${r.site}|${r.chassis.toUpperCase()}`)).length;
  return { created: rows.length - updated, updated };
}

/** Chasis que ya existen en el sistema, como "SITE|CHASIS". */
export async function existing(exec: (sql: string, params: unknown[]) => Promise<unknown[]>, rows: Pick<UnitRow, "site" | "chassis">[]) {
  const set = new Set<string>();
  for (const site of ["PCL", "YUR"] as const) {
    const list = rows.filter((r) => r.site === site).map((r) => r.chassis);
    for (let i = 0; i < list.length; i += 2000) {
      const found = await exec("SELECT chassis FROM units WHERE site=? AND chassis IN (?)", [site, list.slice(i, i + 2000)]);
      for (const f of found as { chassis: string }[]) set.add(`${site}|${f.chassis.toUpperCase()}`); // sin distinguir mayúsculas, como la base
    }
  }
  return set;
}
