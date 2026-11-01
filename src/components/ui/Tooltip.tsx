import { cn } from "@/lib/utils";

export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "right";
  className?: string;
}) {
  const position =
    side === "bottom"
      ? "top-full left-1/2 mt-2 -translate-x-1/2"
      : side === "right"
        ? "left-full top-1/2 ml-2 -translate-y-1/2"
        : "bottom-full left-1/2 mb-2 -translate-x-1/2";

  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-[130] hidden whitespace-nowrap rounded-md border border-line-strong bg-[#151827] px-2 py-1 text-[11px] font-medium text-foreground opacity-0 shadow-xl transition-opacity duration-150 group-hover/tooltip:opacity-100 md:block",
          position,
        )}
      >
        {label}
      </span>
    </span>
  );
}
