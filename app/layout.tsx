// @ts-ignore – CSS import has no type declarations
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "VidaNova | Smart",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport = {
  themeColor: "#00a776",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body>{children}</body>
    </html>
  );
}
