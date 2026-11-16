/**
 * Carreteras desde Pucallpa (almacén) hacia los distritos de los dealers: Federico Basadre a Aguaytía y Tingo María,
 * el valle del Huallaga (Aucayacu, Uchiza, Tocache), Huánuco, la sierra central (Cerro de Pasco, La Oroya, Huancayo),
 * la selva central (La Merced, Pichanaqui, Satipo, Pangoa, Oxapampa, Constitución), Lima y el sur (Cusco, Puerto Maldonado).
 * Un árbol desde Pucallpa: cada pueblo tiene un solo camino. Km aproximados.
 */
import { makeNet, T } from "./road-net";
import type { Town } from "./yur-road";

export const PCL_TOWNS: Town[] = [
  T("PUCALLPA", "Pucallpa", -74.55, -8.38, true),
  T("YARINACOCHA", "Yarinacocha", -74.62, -8.33),
  T("CAMPO VERDE", "Campo Verde", -74.81, -8.48),
  T("AGUAYTIA", "Aguaytía", -75.27, -9.04),
  T("TINGO MARIA", "Tingo María", -75.99, -9.3, true),
  T("AUCAYACU", "Aucayacu", -76.11, -8.93),
  T("UCHIZA", "Uchiza", -76.46, -8.46),
  T("TOCACHE", "Tocache", -76.51, -8.19),
  T("HUANUCO", "Huánuco", -76.24, -9.93),
  T("AMARILIS", "Amarilis", -76.21, -9.98),
  T("CERRO DE PASCO", "Cerro de Pasco", -76.26, -10.68),
  T("LA OROYA", "La Oroya", -75.9, -11.52, true),
  T("TARMA", "Tarma", -75.69, -11.42),
  T("LA MERCED", "La Merced", -75.33, -11.05),
  T("PICHANAQUI", "Pichanaqui", -74.87, -10.92),
  T("SATIPO", "Satipo", -74.64, -11.25),
  T("PANGOA", "Pangoa", -74.49, -11.43),
  T("OXAPAMPA", "Oxapampa", -75.4, -10.58),
  T("CONSTITUCION", "Constitución", -74.98, -9.87),
  T("LIMA", "Lima", -77.04, -12.05),
  T("HUANCAYO", "Huancayo", -75.21, -12.07),
  T("CUSCO", "Cusco", -71.97, -13.53),
  T("PUERTO MALDONADO", "Pto. Maldonado", -69.19, -12.59),
];

export const PCL_ROADS: [string, string, number][] = [
  ["PUCALLPA", "YARINACOCHA", 7], ["PUCALLPA", "CAMPO VERDE", 34], ["CAMPO VERDE", "AGUAYTIA", 125], ["AGUAYTIA", "TINGO MARIA", 120],
  ["TINGO MARIA", "AUCAYACU", 55], ["AUCAYACU", "UCHIZA", 95], ["UCHIZA", "TOCACHE", 30],
  ["TINGO MARIA", "HUANUCO", 120], ["HUANUCO", "AMARILIS", 5], ["HUANUCO", "CERRO DE PASCO", 105], ["CERRO DE PASCO", "LA OROYA", 130],
  ["LA OROYA", "TARMA", 60], ["TARMA", "LA MERCED", 70], ["LA MERCED", "PICHANAQUI", 70], ["PICHANAQUI", "SATIPO", 60], ["SATIPO", "PANGOA", 70],
  ["LA MERCED", "OXAPAMPA", 75], ["OXAPAMPA", "CONSTITUCION", 130],
  ["LA OROYA", "LIMA", 175], ["LA OROYA", "HUANCAYO", 125], ["HUANCAYO", "CUSCO", 750], ["CUSCO", "PUERTO MALDONADO", 480],
];

/** Distritos de la facturación → pueblo de la carretera */
const ALIAS: Record<string, string> = {
  CALLERIA: "PUCALLPA", MANANTAY: "PUCALLPA", "RUPA-RUPA": "TINGO MARIA", "RUPA RUPA": "TINGO MARIA", "JOSE CRESPO Y CASTILLO": "AUCAYACU",
  "PADRE ABAD": "AGUAYTIA", IRAZOLA: "AGUAYTIA", "PILLCO MARCA": "HUANUCO", CHANCHAMAYO: "LA MERCED", "SAN RAMON": "LA MERCED",
  PICHANAKI: "PICHANAQUI", "SAN MARTIN DE PANGOA": "PANGOA", "RIO NEGRO": "SATIPO", YANACANCHA: "CERRO DE PASCO", CHAUPIMARCA: "CERRO DE PASCO",
  TAMBOPATA: "PUERTO MALDONADO", "EL TAMBO": "HUANCAYO", CHILCA: "HUANCAYO", WANCHAQ: "CUSCO", SANTIAGO: "CUSCO", "SAN SEBASTIAN": "CUSCO",
  "VILLA RICA": "OXAPAMPA", "PUERTO BERMUDEZ": "CONSTITUCION", "CIUDAD CONSTITUCION": "CONSTITUCION",
};

export const PCL_NET = makeNet(PCL_TOWNS, PCL_ROADS, "PUCALLPA", ALIAS);
