/** Fechas como texto YYYY-MM-DD en hora de Perú (sin saltos por zona horaria) */
export const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const pad = (n: number) => String(n).padStart(2, "0");
export const fmtISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const todayLima = () => { const n = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" })); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const addMonths = (d: Date, n: number) => { const r = new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); if (r.getDate() !== d.getDate()) r.setDate(0); return r; };
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 864e5);
export const humanDate = (s: string, short = false) => {
  const d = parseISO(s);
  const m = MONTHS[d.getMonth()].toLowerCase();
  return short ? `${d.getDate()} ${m.slice(0, 3)} ${d.getFullYear()}` : `${d.getDate()} de ${m} de ${d.getFullYear()}`;
};
