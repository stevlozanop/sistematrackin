import type { PoolConnection } from "mysql2/promise";
import { DATE_FIELDS } from "./hsp";
import { TEXT_FIELDS, type UnitRow } from "./excel-parse";

export * from "./excel-parse";

/* ---------- Guardado en la base de datos ---------- */

const COLS = ["site", "chassis", "dealer_id", "billing_date", ...TEXT_FIELDS, ...DATE_FIELDS] as const;

/** Inserta o actualiza. Un valor vacío en el Excel nunca borra un dato que ya está en el sistema. */
export async function saveRows(c: PoolConnection, rows: UnitRow[]) {
  // 1) Dealers (tiendas)
  const dealers = new Map<string, UnitRow>();
  for (const r of rows) if (r.dealer) dealers.set(r.dealer, r);
  const dl = [...dealers.entries()];
  for (let i = 0; i < dl.length; i += 500) {
    await c.query(
      `INSERT INTO dealers(name, department, district) VALUES ?
       ON DUPLICATE KEY UPDATE department=COALESCE(VALUES(department), department), district=COALESCE(VALUES(district), district)`,
      [dl.slice(i, i + 500).map(([name, r]) => [name.slice(0, 160), r.fields.department, r.fields.district])],
    );
  }
  const ids = new Map<string, number>();
  for (let i = 0; i < dl.length; i += 500) {
    const [found] = await c.query("SELECT id, name FROM dealers WHERE name IN (?)", [dl.slice(i, i + 500).map(([n]) => n)]);
    for (const d of found as { id: number; name: string }[]) ids.set(d.name, d.id);
  }

  // 2) Unidades
  const before = await existing(async (sql, p) => (await c.query(sql, p))[0] as unknown[], rows);
  const update = COLS.filter((k) => k !== "site" && k !== "chassis").map((k) => `${k}=COALESCE(VALUES(${k}), ${k})`).join(", ");
  for (let i = 0; i < rows.length; i += 1000) {
    const values = rows.slice(i, i + 1000).map((r) => [
      r.site, r.chassis, r.dealer ? ids.get(r.dealer) ?? null : null, r.billing_date,
      ...TEXT_FIELDS.map((f) => r.fields[f]),
      ...DATE_FIELDS.map((d) => r.dates[d] ?? null),
    ]);
    await c.query(`INSERT INTO units(${COLS.join(",")}) VALUES ? ON DUPLICATE KEY UPDATE ${update}`, [values]);
  }
  const updated = rows.filter((r) => before.has(`${r.site}|${r.chassis}`)).length;
  return { created: rows.length - updated, updated };
}

/** Chasis que ya existen en el sistema, como "SITE|CHASIS". */
export async function existing(exec: (sql: string, params: unknown[]) => Promise<unknown[]>, rows: Pick<UnitRow, "site" | "chassis">[]) {
  const set = new Set<string>();
  for (const site of ["PCL", "YUR"] as const) {
    const list = rows.filter((r) => r.site === site).map((r) => r.chassis);
    for (let i = 0; i < list.length; i += 2000) {
      const found = await exec("SELECT chassis FROM units WHERE site=? AND chassis IN (?)", [site, list.slice(i, i + 2000)]);
      for (const f of found as { chassis: string }[]) set.add(`${site}|${f.chassis}`);
    }
  }
  return set;
}
