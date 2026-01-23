import type { ReactNode } from "react";
import { Sidebar } from "@/components/ui/sidebar";
import { MobileNav } from "@/components/ui/mobile-nav";

export default function WifiLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <MobileNav />
      <main className="min-h-screen flex items-center justify-center px-4 md:px-6 md:ml-64 pt-12 md:pt-0">
        {children}
      </main>
    </div>
  );
}
