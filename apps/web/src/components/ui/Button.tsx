import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-sm text-sm font-medium tracking-wide transition-colors disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-amber/70 focus-visible:ring-offset-2 focus-visible:ring-offset-nexus-bg cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-nexus-amber text-nexus-bg hover:bg-[#ffd06a] shadow-[0_0_18px_rgb(245_185_66/0.18)]",
        ghost: "bg-transparent text-nexus-text hover:bg-white/5 border border-nexus-border",
        outline:
          "border border-nexus-amber/50 text-nexus-amber hover:bg-nexus-amber/10 bg-transparent",
        danger: "bg-nexus-danger text-white hover:bg-[#ff7a7a]",
        signal: "bg-nexus-signal text-nexus-bg hover:bg-[#6af0ba]",
        subtle: "bg-white/5 text-nexus-muted hover:text-nexus-text hover:bg-white/8",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});

export { buttonVariants };
