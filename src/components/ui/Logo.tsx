import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-white/15 bg-[linear-gradient(145deg,#9b8dff_0%,#6e5be8_54%,#4335a4_100%)] shadow-[0_6px_18px_-4px_rgba(109,91,232,0.7),inset_0_1px_0_rgba(255,255,255,0.3)]",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[17px]" aria-hidden="true">
        <path
          d="M7 4.75h7.1L18 8.65V19.2a.8.8 0 0 1-.8.8H7a.8.8 0 0 1-.8-.8V5.55a.8.8 0 0 1 .8-.8Z"
          stroke="white"
          strokeWidth="1.45"
          strokeLinejoin="round"
        />
        <path d="M13.9 4.9v3.9h3.9" stroke="white" strokeWidth="1.45" strokeLinejoin="round" />
        <path d="M9.2 12.1h5.4M9.2 15.1h3.6" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
        <path d="m16.7 13.2.45 1.15 1.15.45-1.15.45-.45 1.15-.45-1.15-1.15-.45 1.15-.45.45-1.15Z" fill="white" />
      </svg>
    </div>
  );
}

export function Logo({
  href = "/",
  compact = false,
  className,
}: {
  href?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("group inline-flex items-center gap-2.5 rounded-lg", className)}
      aria-label="DocuMind AI home"
    >
      <LogoMark className="transition-transform duration-300 group-hover:rotate-[-4deg] group-hover:scale-105" />
      {!compact ? (
        <span className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-semibold tracking-[-0.03em] text-foreground">DocuMind</span>
          <span className="rounded border border-accent/20 bg-accent-soft px-1 py-px font-mono text-[8px] font-semibold tracking-[0.1em] text-accent-bright">
            AI
          </span>
        </span>
      ) : null}
    </Link>
  );
}
