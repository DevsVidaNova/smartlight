"use client";
import { useState } from "react";
import Link from "next/link";
import { Wifi, Lightbulb, LogOut, Menu, X } from "lucide-react";
import { LogoutButton } from "./logout-button";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 h-12 border-b bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
        <div className="h-full flex items-center px-4">
          <button
            aria-label="Abrir menu"
            className="p-2 rounded-md hover:bg-[hsl(var(--accent))]"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="ml-3 text-sm font-semibold">LightON</div>
        </div>
      </header>
      {open ? (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={() => setOpen(false)}
          />
          <aside className="fixed top-0 left-0 z-50 h-full w-64 border-r bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-4 md:hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold">LightON</div>
              <button
                aria-label="Fechar menu"
                className="p-2 rounded-md hover:bg-[hsl(var(--accent))]"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-2">
              <Link
                href="/wifi"
                className="rounded-md px-3 py-2 hover:bg-[hsl(var(--accent))] flex items-center"
                onClick={() => setOpen(false)}
              >
                <Wifi className="h-6 w-6" />
                <span className="px-3 text-sm font-semibold">Wi‑Fi</span>
              </Link>
              <Link
                href="/control"
                className="rounded-md px-3 py-2 hover:bg-[hsl(var(--accent))] flex items-center"
                onClick={() => setOpen(false)}
              >
                <Lightbulb className="h-6 w-6" />
                <span className="px-3 text-sm font-semibold">Luzes</span>
              </Link>
              <div className="mt-2">
                <LogoutButton className="w-full" variant="outline">
                  <LogOut className="h-6 w-6" />
                  <span className="px-3 text-sm font-semibold">Logout</span>
                </LogoutButton>
              </div>
            </nav>
          </aside>
        </>
      ) : null}
    </>
  );
}

