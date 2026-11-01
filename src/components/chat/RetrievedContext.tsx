"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Database, Search, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import type { RetrievalMeta } from "@/types/chat";

export function RetrievedContext({ retrieval }: { retrieval: RetrievalMeta }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2.5 overflow-hidden rounded-xl border border-line bg-[#090b13]/80">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-white/[0.02]"
      >
        <SlidersHorizontal className="size-3 text-subtle" />
        <span className="text-[10px] font-medium text-foreground/90">View retrieved context</span>
        <span className="hidden items-center gap-2 text-[8.5px] text-subtle sm:flex">
          <span className="size-0.5 rounded-full bg-white/15" />
          {retrieval.chunks.length} chunks
          <span className="size-0.5 rounded-full bg-white/15" />
          {retrieval.durationMs}ms retrieval
        </span>
        <ChevronDown
          className={`ml-auto size-3 text-subtle transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-line px-3.5 py-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-white/[0.018] p-2.5">
                  <p className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-subtle">
                    Rewritten query
                  </p>
                  <p className="mt-1 text-[9.5px] leading-4 text-muted">{retrieval.rewrittenQuery}</p>
                </div>
                <div className="rounded-lg border border-line bg-white/[0.018] p-2.5">
                  <p className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-subtle">
                    Retrieval strategy
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[9.5px] text-muted">
                    <Search className="size-2.5 text-accent-bright/70" />
                    {retrieval.strategy}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 font-mono text-[8px] text-subtle">
                    <Database className="size-2.5" />
                    Persistent FAISS index
                  </p>
                </div>
              </div>

              <div className="mt-2.5 space-y-1.5">
                {retrieval.chunks.map((chunk) => (
                  <div
                    key={`${chunk.id}-${chunk.rerankPosition}`}
                    className="rounded-lg border border-line bg-white/[0.015] p-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex size-4 items-center justify-center rounded bg-accent-soft font-mono text-[7px] text-accent-bright">
                        {chunk.rerankPosition}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[9.5px] font-medium text-foreground/85">
                        {chunk.documentName}
                      </span>
                      {chunk.page !== null ? (
                        <span className="font-mono text-[7.5px] text-subtle">p. {chunk.page}</span>
                      ) : null}
                      <span className="rounded border border-success/15 bg-success/[0.06] px-1 py-px font-mono text-[7.5px] text-success">
                        {chunk.similarity.toFixed(2)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[9px] leading-4 text-muted">{chunk.content}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#8b7dfb,#7dd3fc)]"
                          style={{ width: `${chunk.similarity * 100}%` }}
                        />
                      </div>
                      <span className="font-mono text-[7px] text-subtle">sim</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2.5 text-[8px] leading-4 text-subtle">
                These passages were retrieved from the persistent FAISS index and filtered before
                answer generation.
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
