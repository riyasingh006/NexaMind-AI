import { ArrowLeft, FileQuestion } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="landing-shell flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-line-strong bg-white/[0.035]">
        <FileQuestion className="size-6 text-accent-bright" />
      </div>
      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-accent-bright/70">
        404 · Page not found
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-foreground">
        This page is outside the index.
      </h1>
      <p className="mt-3 max-w-sm text-[13px] leading-6 text-muted">
        The route you requested does not exist in this Phase 1 workspace.
      </p>
      <div className="mt-7 flex gap-2">
        <Link
          href="/"
          className="inline-flex h-9.5 items-center gap-2 rounded-lg border border-line-strong bg-white/[0.04] px-4 text-[12px] font-medium text-foreground transition hover:bg-white/[0.07]"
        >
          <ArrowLeft className="size-3.5" />
          Back home
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex h-9.5 items-center rounded-lg bg-accent px-4 text-[12px] font-medium text-white transition hover:bg-[#9b8eff]"
        >
          Open workspace
        </Link>
      </div>
    </div>
  );
}
