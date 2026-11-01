import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-200 select-none disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-white shadow-[0_8px_24px_-8px_rgba(139,125,251,0.65)] hover:bg-[#9c90ff] hover:shadow-[0_10px_30px_-8px_rgba(139,125,251,0.8)]",
        secondary:
          "border border-line-strong bg-white/[0.055] text-foreground hover:border-white/20 hover:bg-white/[0.09]",
        outline:
          "border border-line-strong bg-transparent text-foreground hover:border-accent/40 hover:bg-accent-soft",
        ghost: "text-muted hover:bg-white/[0.055] hover:text-foreground",
        soft: "bg-accent-soft text-accent-bright hover:bg-[rgba(139,125,251,0.19)]",
        danger:
          "border border-danger/25 bg-danger/10 text-[#ff9aaa] hover:border-danger/40 hover:bg-danger/15",
        link: "h-auto rounded-none p-0 text-accent-bright underline-offset-4 hover:text-foreground hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9.5 px-4 text-[13px]",
        lg: "h-11 px-5 text-sm",
        xl: "h-12 px-6 text-[15px]",
        icon: "size-9 p-0",
        "icon-sm": "size-7 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  ),
);

Button.displayName = "Button";
