"use client";
import { Toast } from "@heroui/react";
import { I18nProvider } from "react-aria-components";
import { InstallApp } from "@/components/InstallApp";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // Fechas, calendarios y números de HeroUI en español de Perú (semana desde el lunes, día/mes/año)
    <I18nProvider locale="es-PE">
      <Toast.Provider placement="top end" />
      {children}
      <InstallApp />
    </I18nProvider>
  );
}
