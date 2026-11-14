/**
 * Zonas de despacho (PCL): distritos que salen juntos en el mismo camión desde el almacén.
 * Un distrito que no está en ninguna zona va solo (Tambopata, Constitución, Oxapampa, Callería…).
 * Los nombres se comparan sin tildes ni mayúsculas, tal como vienen en la facturación.
 */
export const ZONES: { name: string; districts: string[] }[] = [
  { name: "Huánuco · Tingo María", districts: ["HUANUCO", "AMARILIS", "RUPA-RUPA", "RUPA RUPA", "TINGO MARIA"] },
  { name: "Tocache · Uchiza · Aucayacu", districts: ["TOCACHE", "UCHIZA", "JOSE CRESPO Y CASTILLO", "AUCAYACU"] },
  { name: "Pichanaqui · Chanchamayo", districts: ["PICHANAQUI", "PICHANAKI", "CHANCHAMAYO"] },
  { name: "Pangoa · Satipo", districts: ["PANGOA", "SATIPO"] },
];

const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
const BY_DISTRICT = new Map(ZONES.flatMap((z) => z.districts.map((d) => [key(d), z.name] as const)));

/** Zona del distrito (o el mismo distrito si va solo). */
export function zoneOf(district: string | null | undefined): string {
  if (!district) return "Sin distrito";
  return BY_DISTRICT.get(key(district)) ?? district;
}

/** Orden del cuadro de stock (como en el Excel de Stock-PCL); lo que no está aquí va después, alfabético. */
const ORDER = ["TAMBOPATA", "Huánuco · Tingo María", "Tocache · Uchiza · Aucayacu", "CONSTITUCION", "OXAPAMPA", "Pichanaqui · Chanchamayo", "Pangoa · Satipo"].map(key);

/** Para ordenar zonas: primero las del cuadro, en su orden; luego el resto alfabético. */
export function zoneCompare(a: string, b: string) {
  const ia = ORDER.indexOf(key(a)), ib = ORDER.indexOf(key(b));
  if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  return a.localeCompare(b, "es");
}

/** Para ordenar distritos: los de una misma zona quedan pegados (en el orden de la zona); la zona sigue el orden del cuadro. */
export function districtCompare(a: string, b: string) {
  const za = zoneOf(a), zb = zoneOf(b);
  if (key(za) !== key(zb)) return zoneCompare(za, zb);
  const list = ZONES.find((z) => z.name === za)?.districts.map(key) ?? [];
  const ia = list.indexOf(key(a)), ib = list.indexOf(key(b));
  return ia !== ib ? (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) : a.localeCompare(b, "es");
}
