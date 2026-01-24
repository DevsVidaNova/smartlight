import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function LogoSmall({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center font-semibold", className)}
      {...props}
    >
      <span className="text-bold">VidaNova</span>
      <span className="ml-2 inline-flex items-center rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-2 py-1 leading-none text-sm">
        Smart
      </span>
    </div>
  );
}
