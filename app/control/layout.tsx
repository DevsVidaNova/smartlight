import type { ReactNode } from "react";
import { Sidebar } from "@/components/ui/sidebar";
import { MobileNav } from "@/components/ui/mobile-nav";

export default function ControlLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <MobileNav />
      <main className="min-h-screen md:ml-64 pt-12 md:pt-0">{children}</main>
    </div>
  );
}
