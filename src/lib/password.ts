/**
 * Reglas de una contraseña segura (las usan el servidor y las pantallas que la piden):
 * 8 caracteres o más, con letras y números, que no sea de las más usadas ni repita el correo o el nombre.
 */
const COMMON = new Set([
  "password", "contraseña", "contrasena", "qwerty", "qwertyuiop", "asdfghjkl", "zxcvbnm", "abc123", "admin", "administrador",
  "123456", "1234567", "12345678", "123456789", "1234567890", "000000", "111111", "123123", "654321", "iloveyou", "welcome",
  "bienvenido", "hola", "holamundo", "secreto", "clave", "usuario", "user", "login", "dragon", "monkey", "football", "futbol",
  "abc", "abcd", "abcde", "qwe", "qwer", "asd", "asdf", "zxc", "aaa", "xyz", "pass", "admin123", "password123", "1q2w3e4r", "peru", "lima", "trackin", "systemtracking", "leyva", "honda", "yamaha", "pucallpa", "yurimaguas", "iquitos", "moto", "motos",
]);

export type PasswordCheck = { ok: boolean; label: string };

/** Lista de requisitos con su estado (para mostrar al escribir) */
export function passwordChecks(pw: string, ctx: { email?: string | null; name?: string | null } = {}): PasswordCheck[] {
  const low = pw.toLowerCase();
  const base = low.replace(/[^a-zñ]/g, "");
  const words = [String(ctx.email ?? "").split("@")[0], ...String(ctx.name ?? "").split(/\s+/)].map((w) => w.toLowerCase().trim()).filter((w) => w.length >= 4);
  const repeated = /^(.)\1+$/.test(pw) || "0123456789".includes(pw) || "abcdefghijklmnopqrstuvwxyz".includes(low);
  return [
    { ok: pw.length >= 8, label: "8 caracteres o más" },
    { ok: /\p{L}/u.test(pw) && /\d/.test(pw), label: "Letras y números" },
    { ok: !!pw && !COMMON.has(low) && !COMMON.has(base) && !repeated && new Set(low).size >= 5, label: "No es de las más usadas ni repetitiva" },
    { ok: !!pw && !words.some((w) => low.includes(w)), label: "No repite el correo ni el nombre" },
  ];
}

/** Motivo por el que no sirve, o null si está bien */
export function passwordProblem(pw: string, ctx: { email?: string | null; name?: string | null } = {}): string | null {
  if (pw.length > 128) return "La contraseña es demasiado larga (máximo 128 caracteres)";
  const [len, mix, common, own] = passwordChecks(pw, ctx);
  if (!len.ok) return "La contraseña debe tener 8 caracteres o más";
  if (!mix.ok) return "La contraseña debe tener letras y números";
  if (!common.ok) return "Esa contraseña es muy fácil de adivinar: usa una menos común y variada";
  if (!own.ok) return "La contraseña no puede contener el correo ni el nombre";
  return null;
}

/** Contraseña al azar que siempre cumple las reglas: mayúscula, minúscula, número y símbolo (sin letras confusas: I, l, O, 0, 1) */
export function generatePassword(length = 12) {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%"];
  const all = sets.join("");
  const rnd = (n: number) => {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0] % n;
  };
  const chars = sets.map((s) => s[rnd(s.length)]);
  while (chars.length < length) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}
