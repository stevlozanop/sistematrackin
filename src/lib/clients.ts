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
