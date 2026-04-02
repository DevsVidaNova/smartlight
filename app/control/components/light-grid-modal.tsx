"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createLightItems,
  type LightStateMap,
} from "@/app/control/helpers/light-grid";

type Props = {
  open: boolean;
  lights: LightStateMap;
  loadingByLight: Record<number, boolean>;
  onClose: () => void;
  onToggleLight: (lightId: number) => void;
};

const lightItems = createLightItems();

export function LightGridModal({
  open,
  lights,
  loadingByLight,
  onClose,
  onToggleLight,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEntered(false);
    const frame = window.requestAnimationFrame(() => {
      setEntered(true);
    });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFirst = () => {
      const firstFocusable =
        panelRef.current?.querySelector<HTMLElement>(focusableSelector);
      firstFocusable?.focus();
    };
    const timer = window.setTimeout(focusFirst, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((item) => !item.hasAttribute("disabled"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Controle individual das luzes"
        className={`relative z-10 w-full max-w-4xl rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-5 shadow-2xl transition-all duration-200 ease-out ${
          entered
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-2 scale-95 opacity-0"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Controle individual das luzes
          </h2>
          <Button
            variant="outline"
            onClick={onClose}
            className="h-9 w-9 p-0"
            aria-label="Fechar modal"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {lightItems.map((light) => {
            const isOn = Boolean(lights[light.id]);
            const isLoading = Boolean(loadingByLight[light.id]);
            return (
              <Button
                key={light.id}
                onClick={() => onToggleLight(light.id)}
                disabled={isLoading}
                className={`h-14 text-sm font-semibold text-white ${
                  isOn
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {isLoading
                  ? `${light.label}...`
                  : `${light.label} · ${isOn ? "Ligada" : "Desligada"}`}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
