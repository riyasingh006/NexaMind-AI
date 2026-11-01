"use client";

import { ChevronDown, ExternalLink, Quote } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Source } from "@/types/chat";

export function SourceCitation({ sources }: { sources: Source[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (sources.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-line bg-white/[0.018]">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
        <div className="flex items-center gap-1.5">
          <Quote className="size-3 text-accent-bright/70" />
          <span className="text-[10px] font-medium text-foreground">Sources</span>
          <span className="rounded bg-white/[0.04] px-1 py-px font-mono text-[8px] text-subtle">
            {sources.length}
          </span>
        </div>
        <span className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-subtle">
          Evidence-backed
        </span>
      </div>
      <div className="divide-y divide-line/60">
        {sources.map((source, index) => {
          const isExpanded = expanded === source.id;
          return (
            <div key={source.id} className="px-3.5 py-2.5">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border border-accent/15 bg-accent-soft font-mono text-[8px] text-accent-bright">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/dashboard/documents?doc=${encodeURIComponent(source.documentId)}${
                        source.page !== null ? `&page=${source.page}` : ""
                      }`}
                      className="group inline-flex min-w-0 items-center gap-1 text-[10.5px] font-medium text-foreground/90 transition hover:text-accent-bright"
                    >
                      <span className="truncate">{source.documentName}</span>
                      <ExternalLink className="size-2.5 shrink-0 text-subtle opacity-0 transition group-hover:opacity-100" />
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      {source.page !== null ? (
                        <span className="font-mono text-[8px] text-subtle">p. {source.page}</span>
                      ) : null}
                      <span className="rounded border border-success/15 bg-success/[0.07] px-1 py-0.5 font-mono text-[8px] text-success">
                        {source.similarity.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <p
                    className={`mt-1 text-[10px] leading-4.5 text-muted ${
                      isExpanded ? "" : "line-clamp-1"
                    }`}
                  >
                    {source.excerpt}
                  </p>
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : source.id)}
                    className="mt-1 inline-flex items-center gap-0.5 text-[8.5px] text-subtle transition hover:text-accent-bright"
                  >
                    {isExpanded ? "Hide evidence" : "View evidence"}
                    <ChevronDown
                      className={`size-2.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
