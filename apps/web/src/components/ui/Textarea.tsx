import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "min-h-[88px] w-full rounded-sm border border-nexus-border bg-nexus-bg/70 px-3 py-2 text-sm text-nexus-text placeholder:text-nexus-muted/70 outline-none transition-colors focus:border-nexus-amber/70 focus:ring-1 focus:ring-nexus-amber/40",
        className,
      )}
      {...props}
    />
  );
}
