"use client";
import { useRouter } from "next/navigation";
import { Button } from "./button";

type Props = {
  className?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  children?: React.ReactNode;
};

export function LogoutButton({
  className,
  variant = "outline",
  children,
}: Props) {
  const router = useRouter();
  async function onClick() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  }
  return (
    <Button
      className={className}
      variant={
        variant === "link"
          ? "outline"
          : variant === "secondary"
            ? "default"
            : variant
      }
      onClick={onClick}
    >
      {children ?? "Logout"}
    </Button>
  );
}
