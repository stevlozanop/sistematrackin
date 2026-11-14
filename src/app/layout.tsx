import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

export const metadata: Metadata = {
  title: "System Tracking",
  description: "Seguimiento de cajas CKD: Iquitos, Pucallpa y Yurimaguas",
  applicationName: "System Tracking",
  appleWebApp: { capable: true, title: "Tracking", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#078a04",
  viewportFit: "cover",
};

// Aplica el tema guardado antes de pintar para evitar parpadeos.
const themeScript = `try{if(localStorage.getItem("theme")==="dark")document.documentElement.classList.add("dark");var l=localStorage.getItem("look");if(l==="pebble"||l==="burbuja"||l==="brut"){l="clasica";localStorage.setItem("look",l)}if(l&&l!=="clasica")document.documentElement.dataset.look=l;var a=JSON.parse(localStorage.getItem("accent")||"null");if(a){document.documentElement.dataset.accent="1";for(var k in a)document.documentElement.style.setProperty(k,a[k])}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={dmSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
