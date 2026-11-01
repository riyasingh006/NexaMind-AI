"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Braces,
  CheckCircle2,
  Database,
  FileStack,
  FileText,
  Quote,
  Scissors,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useState, type ElementType } from "react";
import { WORKFLOW_STEPS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const iconMap: Record<string, ElementType> = {
  files: FileStack,
  scissors: Scissors,
  braces: Braces,
  search: Search,
  sparkles: Sparkles,
  shieldCheck: ShieldCheck,
};

const evidence = [
  {
    document: "Agentic RAG Systems Survey.pdf",
    page: "p. 14",
    score: "0.94",
    text: "The strongest pipelines separate evidence acquisition from answer composition.",
  },
  {
    document: "Retrieval Evaluation Notes.txt",
    page: "p. 2",
    score: "0.87",
    text: "Semantic rewriting improved recall@5 from 0.81 to 0.87.",
  },
  {
    document: "LangGraph Orchestration Guide.md",
    page: "p. 5",
    score: "0.83",
    text: "A conditional edge routes back to query rewriting below threshold.",
  },
];

export function WorkflowVisual() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((current) => (current + 1) % WORKFLOW_STEPS.length);
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  const activeStep = WORKFLOW_STEPS[active];
  const ActiveIcon = iconMap[activeStep.icon];

  return (
    <div className="relative mx-auto mt-14 w-full max-w-6xl sm:mt-18">
      <div className="pointer-events-none absolute -inset-x-16 -top-16 bottom-0 -z-10 bg-[radial-gradient(ellipse_60%_60%_at_50%_40%,rgba(121,103,255,0.14),transparent_70%)]" />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl border border-line-strong bg-[#0a0c16]/85 shadow-[0_50px_150px_-40px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.02)_inset] backdrop-blur-xl sm:rounded-[20px]"
      >
        <div className="flex h-11 items-center justify-between border-b border-line px-4 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-white/10" />
            <span className="size-2 rounded-full bg-white/10" />
            <span className="size-2 rounded-full bg-white/10" />
          </div>
          <div className="flex items-center gap-2 text-[10px] text-subtle">
            <span className="hidden font-mono sm:inline">documind / retrieval-pipeline</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/15 bg-warning/[0.06] px-2 py-0.5 text-[9px] font-medium text-warning/90">
              <span className="size-1 rounded-full bg-warning" />
              Simulated preview
            </span>
          </div>
          <div className="hidden items-center gap-1.5 text-[9.5px] text-subtle sm:flex">
            <span className="size-1.5 rounded-full bg-success" />
            UI live
          </div>
        </div>

        <div className="overflow-x-auto p-4 scrollbar-none sm:p-5">
          <div className="min-w-[680px] lg:min-w-0">
            <div className="relative grid grid-cols-6 gap-2">
              <div className="absolute left-[8%] right-[8%] top-[19px] h-px bg-white/[0.08]">
                <motion.div
                  className="h-full bg-[linear-gradient(90deg,transparent,#8b7dfb,transparent)]"
                  animate={{ x: ["-100%", "220%"] }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: "linear" }}
                  style={{ width: "35%" }}
                />
              </div>
              {WORKFLOW_STEPS.map((step, index) => {
                const Icon = iconMap[step.icon];
                const isActive = index === active;
                const isComplete = index < active;
                return (
                  <button
                    key={step.title}
                    type="button"
                    onClick={() => setActive(index)}
                    aria-pressed={isActive}
                    className="group relative flex flex-col items-center gap-2 rounded-lg pt-0.5 focus-visible:outline-offset-4"
                  >
                    <span
                      className={cn(
                        "relative z-10 flex size-9.5 items-center justify-center rounded-xl border transition-all duration-300",
                        isActive
                          ? "border-accent/50 bg-[#1a1730] text-accent-bright shadow-[0_0_28px_rgba(139,125,251,0.22)]"
                          : isComplete
                            ? "border-success/20 bg-[#0f1719] text-success/80"
                            : "border-line-strong bg-[#0f111d] text-subtle group-hover:border-white/20 group-hover:text-muted",
                      )}
                    >
                      {isComplete ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
                      {isActive ? (
                        <motion.span
                          layoutId="workflow-active-ring"
                          className="absolute -inset-1 rounded-[14px] border border-accent/20"
                          transition={{ type: "spring", stiffness: 400, damping: 32 }}
                        />
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "text-center text-[10px] font-medium transition sm:text-[11px]",
                        isActive ? "text-foreground" : "text-subtle group-hover:text-muted",
                      )}
                    >
                      {step.title}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[0.95fr_1.35fr_0.85fr]">
              <div className="rounded-xl border border-line bg-white/[0.018] p-3.5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-subtle">
                    Knowledge sources
                  </span>
                  <span className="text-[9px] text-subtle">3 selected</span>
                </div>
                <div className="space-y-2">
                  {[
                    { name: "Agentic RAG Systems Survey", type: "PDF", size: "184 chunks" },
                    { name: "Retrieval Evaluation Notes", type: "TXT", size: "9 chunks" },
                    { name: "LangGraph Orchestration Guide", type: "MD", size: "21 chunks" },
                  ].map((item, index) => (
                    <div
                      key={item.name}
                      className="flex items-center gap-2.5 rounded-lg border border-line/80 bg-[#0d101b] px-2.5 py-2"
                    >
                      <div className="flex size-6 items-center justify-center rounded-md border border-line bg-white/[0.035]">
                        <FileText className="size-3 text-accent-bright/65" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-medium text-foreground/90">{item.name}</p>
                        <p className="text-[8.5px] text-subtle">
                          {item.type} · {item.size}
                        </p>
                      </div>
                      {index === 0 ? (
                        <span className="size-1.5 rounded-full bg-success/80" />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-xl border border-line bg-[linear-gradient(145deg,rgba(20,22,38,0.88),rgba(10,12,22,0.9))] p-3.5">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(ellipse_at_top,rgba(139,125,251,0.11),transparent_70%)]" />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-[#0b0e18] px-2.5 py-1.5">
                    <Search className="size-3 shrink-0 text-subtle" />
                    <span className="truncate text-[10px] text-muted">
                      What are the key findings in the RAG survey?
                    </span>
                  </div>
                  <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-1 font-mono text-[8.5px] text-accent-bright">
                    {active + 1}/6
                  </span>
                </div>

                <div className="relative mt-3.5 flex items-start gap-2.5">
                  <motion.div
                    key={active}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent-soft text-accent-bright"
                  >
                    <ActiveIcon className="size-3.5" />
                  </motion.div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[11px] font-medium text-foreground">{activeStep.title}</p>
                      <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-success/80">
                        {active === WORKFLOW_STEPS.length - 1 ? "Complete" : "In progress"}
                      </span>
                    </div>
                    <motion.p
                      key={`${active}-description`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-1 text-[9.5px] leading-4 text-muted"
                    >
                      {activeStep.description}
                    </motion.p>
                    <div className="mt-2.5 flex items-center gap-1.5">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <motion.div
                          key={`${active}-progress`}
                          initial={{ width: 0 }}
                          animate={{ width: "100%" }}
                          transition={{ duration: 1.5, ease: "easeOut" }}
                          className="h-full rounded-full bg-[linear-gradient(90deg,#8b7dfb,#7dd3fc)]"
                        />
                      </div>
                      <span className="font-mono text-[8px] text-subtle">142ms</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 border-t border-line pt-2.5">
                  {evidence.slice(0, 2).map((item, index) => (
                    <div key={item.document} className="flex items-center gap-2">
                      <span className="font-mono text-[8px] text-subtle">0{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[9px] text-muted">{item.text}</span>
                      <span className="shrink-0 rounded bg-success/10 px-1 py-0.5 font-mono text-[8px] text-success">
                        {item.score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col rounded-xl border border-line bg-white/[0.018] p-3.5">
                <div className="mb-3 flex items-center gap-1.5">
                  <Sparkles className="size-3 text-accent-bright" />
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-subtle">
                    Grounded answer
                  </span>
                </div>
                <p className="text-[10px] leading-[1.7] text-[#c4c6d4]">
                  The strongest systems evaluate evidence before generation and rerank retrieved
                  passages. Reranking reduced unsupported claims by{" "}
                  <span className="font-medium text-foreground">31%</span>
                  <span className="ml-0.5 rounded border border-accent/15 bg-accent-soft px-1 py-px font-mono text-[8px] text-accent-bright">
                    1
                  </span>
                  .
                </p>
                <div className="mt-auto flex items-center justify-between border-t border-line pt-2.5">
                  <span className="flex items-center gap-1 text-[8.5px] text-subtle">
                    <Quote className="size-2.5" />
                    3 citations
                  </span>
                  <span className="flex items-center gap-1 text-[8.5px] text-subtle">
                    <Database className="size-2.5" />
                    FAISS
                  </span>
                  <span className="flex items-center gap-1 text-[8.5px] text-success/80">
                    <CheckCircle2 className="size-2.5" />
                    Verified
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.9, duration: 0.5 }}
        className="absolute -right-3 top-[24%] hidden items-center gap-2 rounded-lg border border-line-strong bg-[#111421]/95 px-3 py-2 shadow-xl backdrop-blur lg:flex"
      >
        <span className="flex size-6 items-center justify-center rounded-md bg-success/10">
          <ShieldCheck className="size-3 text-success" />
        </span>
        <div>
          <p className="text-[9.5px] font-medium text-foreground">Evidence constrained</p>
          <p className="text-[8px] text-subtle">Grounded generation</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.1, duration: 0.5 }}
        className="absolute -left-5 bottom-[22%] hidden items-center gap-2 rounded-lg border border-line-strong bg-[#111421]/95 px-3 py-2 shadow-xl backdrop-blur lg:flex"
      >
        <span className="flex size-6 items-center justify-center rounded-md bg-accent-soft">
          <ArrowRight className="size-3 text-accent-bright" />
        </span>
        <div>
          <p className="text-[9.5px] font-medium text-foreground">Semantic retrieval</p>
          <p className="text-[8px] text-subtle">Top-K · 8 chunks</p>
        </div>
      </motion.div>
    </div>
  );
}
