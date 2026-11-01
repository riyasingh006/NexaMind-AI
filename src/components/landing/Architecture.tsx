"use client";

import { motion } from "framer-motion";
import {
  Braces,
  ChevronRight,
  Database,
  FileCog,
  Monitor,
  Server,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ARCHITECTURE_STAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const stageIcons: Record<string, LucideIcon> = {
  frontend: Monitor,
  api: Server,
  processing: FileCog,
  embeddings: Braces,
  vector: Database,
  graph: Workflow,
  generation: Sparkles,
};

export function Architecture() {
  const [selectedId, setSelectedId] = useState<string>(ARCHITECTURE_STAGES[0].id);
  const selected =
    ARCHITECTURE_STAGES.find((stage) => stage.id === selectedId) ?? ARCHITECTURE_STAGES[0];
  const SelectedIcon = stageIcons[selected.id];

  return (
    <section id="architecture" className="relative scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
            className="lg:sticky lg:top-28 lg:self-start"
          >
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-accent-bright/80">
              System architecture
            </p>
            <h2 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.045em] text-foreground sm:text-[43px]">
              Every answer has
              <br />
              <span className="text-gradient-violet">a traceable path.</span>
            </h2>
            <p className="mt-4 max-w-md text-[13px] leading-6 text-muted">
              A transparent, layered system separates the interface, retrieval intelligence and
              generation. Select any stage to inspect its future contract.
            </p>

            <div className="mt-7 space-y-1.5">
              {ARCHITECTURE_STAGES.map((stage, index) => {
                const Icon = stageIcons[stage.id];
                const isSelected = stage.id === selected.id;
                return (
                  <div key={stage.id} className="relative">
                    {index < ARCHITECTURE_STAGES.length - 1 ? (
                      <span className="absolute left-[19px] top-10 z-0 h-[calc(100%-8px)] w-px bg-[linear-gradient(to_bottom,rgba(255,255,255,0.11),rgba(255,255,255,0.03))]" />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelectedId(stage.id)}
                      aria-pressed={isSelected}
                      className={cn(
                        "group relative z-10 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-200",
                        isSelected
                          ? "border-line-strong bg-white/[0.045] shadow-[0_8px_24px_-16px_rgba(0,0,0,0.6)]"
                          : "border-transparent hover:border-line hover:bg-white/[0.025]",
                      )}
                    >
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors"
                        style={{
                          borderColor: isSelected ? `${stage.accent}44` : "rgba(255,255,255,0.08)",
                          backgroundColor: isSelected ? `${stage.accent}14` : "rgba(255,255,255,0.025)",
                          color: isSelected ? stage.accent : "var(--subtle)",
                        }}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-[12px] font-medium transition",
                              isSelected ? "text-foreground" : "text-muted group-hover:text-foreground",
                            )}
                          >
                            {stage.label}
                          </span>
                          {index === 0 ? (
                            <span className="rounded border border-success/15 bg-success/[0.07] px-1 py-px font-mono text-[7.5px] uppercase tracking-wide text-success">
                              Live
                            </span>
                          ) : (
                            <span className="rounded border border-line px-1 py-px font-mono text-[7.5px] uppercase tracking-wide text-subtle">
                              Phase 2
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[9.5px] text-subtle">{stage.sublabel}</p>
                      </div>
                      <ChevronRight
                        className={cn(
                          "size-3.5 shrink-0 transition",
                          isSelected ? "translate-x-0 text-muted" : "-translate-x-1 text-transparent",
                        )}
                      />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex items-center gap-2 text-[9.5px] text-subtle">
              <span className="size-1.5 rounded-full bg-warning" />
              Phase 1: UI only. No backend services are connected.
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="relative"
          >
            <div className="pointer-events-none absolute -inset-8 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(118,98,255,0.08),transparent_65%)]" />
            <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-[#0a0c17]/90 shadow-[0_40px_100px_-50px_rgba(0,0,0,0.9)]">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 items-center justify-center rounded-lg border border-line bg-white/[0.03]">
                    <SelectedIcon className="size-3.5" style={{ color: selected.accent }} />
                  </span>
                  <div>
                    <p className="text-[11.5px] font-medium text-foreground">{selected.label}</p>
                    <p className="text-[9px] text-subtle">Architecture layer · detailed view</p>
                  </div>
                </div>
                <span className="rounded-full border border-line bg-white/[0.03] px-2 py-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-subtle">
                  {String(ARCHITECTURE_STAGES.findIndex((stage) => stage.id === selected.id) + 1).padStart(2, "0")} / 07
                </span>
              </div>

              <div className="relative p-5 sm:p-7">
                <div
                  className="pointer-events-none absolute right-0 top-0 size-72"
                  style={{
                    background: `radial-gradient(circle, ${selected.accent}12, transparent 68%)`,
                  }}
                />
                <motion.div
                  key={`${selected.id}-icon`}
                  initial={{ opacity: 0, scale: 0.9, rotate: -4 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{ duration: 0.35 }}
                  className="relative flex size-12 items-center justify-center rounded-2xl border"
                  style={{
                    borderColor: `${selected.accent}3d`,
                    backgroundColor: `${selected.accent}10`,
                    boxShadow: `0 0 36px ${selected.accent}14`,
                  }}
                >
                  <SelectedIcon className="size-5" style={{ color: selected.accent }} />
                </motion.div>

                <p
                  className="mt-6 font-mono text-[9px] uppercase tracking-[0.16em]"
                  style={{ color: `${selected.accent}cc` }}
                >
                  {selected.sublabel}
                </p>
                <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-foreground sm:text-[28px]">
                  {selected.label}
                </h3>
                <p className="mt-3 max-w-lg text-[12.5px] leading-6 text-muted">
                  {selected.description}
                </p>

                <div className="mt-5 flex flex-wrap gap-1.5">
                  {selected.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-line bg-white/[0.025] px-2 py-1 font-mono text-[9px] text-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-7 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-white/[0.018] p-3.5">
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-subtle">
                      Current state
                    </p>
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          selected.id === "frontend" ? "bg-success" : "bg-warning",
                        )}
                      />
                      {selected.id === "frontend" ? "Frontend operational" : "Awaiting integration"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-line bg-white/[0.018] p-3.5">
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-subtle">
                      Integration phase
                    </p>
                    <p className="mt-1.5 text-[11px] font-medium text-foreground">
                      {selected.id === "frontend" ? "Phase 1 · complete" : "Phase 2 · planned"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-line bg-[#080a12] p-3.5 font-mono text-[10px]">
                  <p className="text-subtle">
                    <span className="text-accent-bright/70">flow</span>
                    <span className="text-subtle/50">.</span>
                    <span className="text-cyan/80">connect</span>
                    <span className="text-subtle/50">(</span>
                    <span className="text-success/80">&quot;{selected.id}&quot;</span>
                    <span className="text-subtle/50">)</span>
                  </p>
                  <p className="mt-1 text-subtle/60">
                    {"// contract prepared · backend integration pending"}
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Link
                    href="/dashboard/health"
                    className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-line-strong bg-white/[0.04] px-3 text-[11px] font-medium text-foreground transition hover:border-accent/30 hover:bg-accent-soft"
                  >
                    View integration status
                    <ChevronRight className="size-3" />
                  </Link>
                  <span className="text-[9.5px] text-subtle">
                    Select a layer to inspect it
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-line bg-white/[0.012] px-5 py-3">
                <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-subtle">
                  Runtime topology
                </span>
                <div className="flex items-center gap-1.5">
                  {ARCHITECTURE_STAGES.map((stage, index) => (
                    <span key={stage.id} className="flex items-center gap-1.5">
                      <span
                        className="size-1.5 rounded-full transition-colors"
                        style={{
                          backgroundColor:
                            stage.id === selected.id ? stage.accent : "rgba(255,255,255,0.12)",
                        }}
                      />
                      {index < ARCHITECTURE_STAGES.length - 1 ? (
                        <span className="h-px w-2 bg-white/10" />
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
