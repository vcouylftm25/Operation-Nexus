import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-sm border border-nexus-border bg-nexus-bg/70 px-3 text-sm text-nexus-text placeholder:text-nexus-muted/70 outline-none transition-colors focus:border-nexus-amber/70 focus:ring-1 focus:ring-nexus-amber/40",
        className,
      )}
      {...props}
    />
  );
}
