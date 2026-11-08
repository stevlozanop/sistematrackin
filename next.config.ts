import type { NextConfig } from "next";

/**
 * Protecciones del navegador para todo el sistema:
 * - nadie puede meter el sistema dentro de otra web (evita engaños con clics, «clickjacking»);
 * - el navegador no adivina tipos de archivo; las direcciones no viajan completas a otras webs;
 * - sin cámara, micrófono ni ubicación; siempre por HTTPS.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["xlsx"],
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // El service worker se revisa siempre para que cada versión nueva llegue al instante
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
    ];
  },
};

export default nextConfig;
