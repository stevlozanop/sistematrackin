import type { MetadataRoute } from "next";

/** Datos para instalar System Trackin como app (celular, tablet y computadora). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "System Trackin",
    short_name: "Trackin",
    description: "Seguimiento de cajas CKD: Iquitos, Pucallpa y Yurimaguas",
    lang: "es-PE",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0b0b0b",
    theme_color: "#078a04",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
