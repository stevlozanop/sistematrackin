import { query, run } from "./db";

/**
 * Clientes de Honda: cada cliente (SORSA, CREDIVARGAS, MOTOCORP…) tiene una o varias tiendas (dealers).
 * Una cuenta de cliente ve las unidades de todas sus tiendas, y nada de otros clientes.
 *
 * El cliente de cada tienda se asigna solo y se puede corregir en la pantalla Dealers:
 * 1. Si la tienda tiene unidades de YUR, se usa su columna «Dealer» (el grupo del cliente).
 * 2. Si no, se deduce del nombre: la parte antes del « - », sin razón social (S.A.C., E.I.R.L.…).
 *    Las tiendas cuyo nombre empieza igual quedan en el mismo cliente.
 */

const STRIP = /\b(S\.?A\.?C\.?|S\.?A\.?|E\.?I\.?R\.?L\.?|S\.?R\.?L\.?)(?=\s|$|\.)/g;
/** Palabras que por sí solas no identifican al cliente: se toma también la siguiente («GRUPO MALCA»). */
const PREFIX = new Set(["GRUPO", "G", "INV", "INVERSIONES", "IMPORT", "IMPORTACIONES", "COMERCIAL", "CORP", "CORPORACION", "CONCESIONARIA", "EMPRESA"]);

/** Mayúsculas y sin tildes, pero conservando la Ñ (MUÑOZ). */
const norm = (s: string) => s.toUpperCase().replace(/Ñ/g, "\u0001").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0001/g, "Ñ");

/** Nombre del cliente sin la sucursal ni la razón social: «SORSA MOTORS - TARAPOTO» -> «SORSA MOTORS». */
export function clientName(store: string) {
  const base = norm(store).split(/\s-\s|\s-|-\s|\(/)[0].replace(STRIP, "").replace(/[.,]+$/, "").replace(/\s+/g, " ").trim();
  return base || norm(store).trim();
}

/** Clave para juntar tiendas del mismo cliente: la primera palabra (o dos, si es «GRUPO …», «INV. …»). */
function key(name: string) {
  const words = clientName(name).replace(/\./g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return name;
  return PREFIX.has(words[0]) && words[1] ? `${words[0]} ${words[1]}` : words[0];
}

/** Asigna el cliente a las tiendas que todavía no lo tienen. Devuelve cuántas se actualizaron. */
export async function fillDealerClients() {
  const n = await fillClients();
  await fillConsortia();
  return n;
}

/**
 * Consorcio de las tiendas nuevas: el de otras tiendas del mismo cliente; si no, y la empresa trabaja con un solo
 * consorcio, ese. Si hay varios y el cliente es nuevo, queda sin consorcio hasta que se le cree su cuenta.
 */
async function fillConsortia() {
  await run(
    `UPDATE dealers d SET company_id = o.company_id
       FROM (SELECT DISTINCT ON (client) client, company_id FROM dealers WHERE company_id IS NOT NULL AND client IS NOT NULL ORDER BY client, id) o
      WHERE d.company_id IS NULL AND d.client = o.client`,
  );
  await run(
    `UPDATE dealers SET company_id = (SELECT id FROM companies WHERE kind = 'client' ORDER BY id LIMIT 1)
      WHERE company_id IS NULL AND (SELECT COUNT(*) FROM companies WHERE kind = 'client') = 1`,
  );
}

async function fillClients() {
  const missing = await query<{ id: number; name: string }>("SELECT id, name FROM dealers WHERE client IS NULL");
  if (!missing.length) return 0;
  // Grupo de YUR más frecuente de cada tienda
  const yur = await query<{ dealer_id: number; g: string }>(
    `SELECT dealer_id, dealer_group g FROM (
       SELECT dealer_id, dealer_group, ROW_NUMBER() OVER (PARTITION BY dealer_id ORDER BY COUNT(*) DESC) rn
       FROM units WHERE site = 'YUR' AND dealer_group IS NOT NULL AND dealer_group <> '' AND dealer_id IS NOT NULL
       GROUP BY dealer_id, dealer_group) x WHERE rn = 1`,
  );
  const groupOf = new Map(yur.map((r) => [r.dealer_id, clientName(r.g)]));
  // Clientes ya conocidos por clave (de otras tiendas), para que las nuevas se sumen al mismo cliente
  const all = await query<{ id: number; name: string; client: string | null }>("SELECT id, name, client FROM dealers");
  const byKey = new Map<string, string>();
  for (const d of all) {
    const c = d.client ?? groupOf.get(d.id);
    if (c && !byKey.has(key(d.name))) byKey.set(key(d.name), c);
  }
  for (const d of missing) {
    const client = groupOf.get(d.id) ?? byKey.get(key(d.name)) ?? clientName(d.name);
    byKey.set(key(d.name), byKey.get(key(d.name)) ?? client);
    await run("UPDATE dealers SET client=? WHERE id=?", [client.slice(0, 120), d.id]);
  }
  return missing.length;
}

/**
 * Filtro SQL de las unidades que ve una cuenta de cliente/dealer (sobre v_units o units):
 * todas las tiendas de su cliente o, si la cuenta es de una sola tienda, solo esa.
 */
export async function dealerScope(userId: number): Promise<{ sql: string; args: unknown[]; client: string | null; dealerId: number | null } | null> {
  const [u] = await query<{ client: string | null; dealer_id: number | null }>("SELECT client, dealer_id FROM users WHERE id=?", [userId]);
  if (u?.client) return { sql: "dealer_id IN (SELECT id FROM dealers WHERE client = ?)", args: [u.client], client: u.client, dealerId: null };
  if (u?.dealer_id) return { sql: "dealer_id = ?", args: [u.dealer_id], client: null, dealerId: u.dealer_id };
  return null;
}

const consortiumCache = new Map<number, { at: number; v: { sql: string; args: unknown[] } | null }>();

/**
 * Filtro SQL de las unidades que ve el personal de un consorcio (viewer), sobre v_units o units:
 * solo las de las tiendas de su consorcio. Mientras la empresa trabaje con un solo consorcio, ve todo
 * (todas las unidades son suyas). El resto de roles (personal de Leyva, The Iceberg Labs) no tiene filtro.
 * El dealer usa dealerScope().
 */
export async function consortiumScope(s: { id: number; role: string }): Promise<{ sql: string; args: unknown[] } | null> {
  if (s.role !== "viewer") return null;
  const hit = consortiumCache.get(s.id);
  if (hit && Date.now() - hit.at < 30_000) return hit.v;
  const [c] = await query<{ id: number; kind: string; siblings: number }>(
    `SELECT c.id, c.kind, (SELECT COUNT(*) FROM companies o WHERE o.kind = 'client' AND o.parent_id IS NOT DISTINCT FROM c.parent_id)::int siblings
       FROM users u JOIN companies c ON c.id = u.company_id WHERE u.id = ?`,
    [s.id],
  );
  // Lector de la propia empresa de transporte (cuentas antiguas) o único consorcio: ve todo, como antes
  const v = !c || c.kind !== "client" || c.siblings <= 1 ? null
    : { sql: "dealer_id IN (SELECT id FROM dealers WHERE company_id = ?)", args: [c.id] };
  consortiumCache.set(s.id, { at: Date.now(), v });
  return v;
}

/** Igual que consortiumScope, pero listo para pegar en un WHERE: « AND (…)» o vacío. */
export async function consortiumAnd(s: { id: number; role: string }, alias = "") {
  const sc = await consortiumScope(s);
  if (!sc) return { and: "", args: [] as unknown[] };
  return { and: ` AND (${alias ? sc.sql.replace(/^dealer_id/, `${alias}.dealer_id`) : sc.sql})`, args: sc.args };
}
