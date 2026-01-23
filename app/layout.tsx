// @ts-ignore – CSS import has no type declarations
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "SmartLight",
  description: "Controle de luz via MQTT",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body>{children}</body>
    </html>
  );
}
