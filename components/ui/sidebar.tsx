"use client";
import Link from "next/link";
import { LogoutButton } from "./logout-button";
import { Wifi, Lightbulb, LogOut } from "lucide-react";
import { LogoSmall } from "./logo-small";

export function Sidebar() {
  return (
    <aside className="hidden md:block fixed left-0 top-0 h-screen w-64 border-r bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-4">
      <nav className="flex flex-col gap-2">
        <LogoSmall className="mb-4" />
        <div className="flex items-center justify-start">
          <Link
            aria-label="Configurar WiFi"
            href="/wifi"
            className="rounded-md px-3 py-2 hover:bg-[hsl(var(--accent))] flex items-center justify-start"
          >
            <Wifi className="h-6 w-6" />
            <span className="px-4 text-sm font-semibold">
              Configuração WiFi
            </span>
          </Link>
        </div>
        <Link
          aria-label="Controle de Luzes"
          href="/control"
          className="rounded-md px-3 py-2 hover:bg-[hsl(var(--accent))] flex items-center justify-start"
        >
          <Lightbulb className="h-6 w-6" />
          <span className="px-4 text-sm font-semibold">Controle de Luzes</span>
        </Link>
        <LogoutButton className="mt-2 w-full" variant="outline">
          <LogOut className="h-6 w-6" />
          <span className="px-4 text-sm font-semibold">Logout</span>
        </LogoutButton>
      </nav>
    </aside>
  );
}
