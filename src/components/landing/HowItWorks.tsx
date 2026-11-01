"use client";

import { motion } from "framer-motion";
import { ArrowRight, FileUp, Layers3, MessageSquareQuote, ScanLine } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Upload your knowledge",
    description:
      "Drop in research papers, reports, technical docs or notes. DocuMind accepts PDF, TXT and Markdown with clear validation.",
    meta: "Drag, drop, done",
    icon: FileUp,
  },
  {
    number: "02",
    title: "Structure and index",
    description:
      "Documents are parsed, split into semantic chunks and enriched with page-level metadata for precise retrieval.",
    meta: "Clean extraction",
    icon: ScanLine,
  },
  {
    number: "03",
    title: "Embed and retrieve",
    description:
      "Gemini embeddings and FAISS vector search make every passage semantically discoverable, not just keyword-searchable.",
    meta: "Meaning-aware search",
    icon: Layers3,
  },
  {
    number: "04",
    title: "Ask with confidence",
    description:
      "The agentic pipeline retrieves, reranks and generates an answer backed by visible evidence and source citations.",
    meta: "Cited answers",
    icon: MessageSquareQuote,
  },
];

export function HowItWorks() {
  return (
    <section className="relative border-y border-line bg-[#080a12] py-20 sm:py-28">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-20 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-accent-bright/80">
            How it works
          </p>
          <h2 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.045em] text-foreground sm:text-[43px]">
            From document to evidence,
            <br />
            in four deliberate steps.
          </h2>
        </motion.div>

        <div className="relative mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="absolute left-[10%] right-[10%] top-9 hidden h-px bg-[linear-gradient(90deg,transparent,rgba(139,125,251,0.35),rgba(125,211,252,0.25),transparent)] xl:block" />
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.article
                key={step.number}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: index * 0.07 }}
                className="group relative rounded-xl border border-line bg-[#0b0d18]/85 p-5"
              >
                <div className="relative z-10 flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-xl border border-accent/20 bg-accent-soft text-accent-bright">
                    <Icon className="size-4" />
                  </span>
                  <span className="font-mono text-[10px] text-subtle/50">{step.number}</span>
                </div>
                <h3 className="mt-5 text-[13.5px] font-medium text-foreground">{step.title}</h3>
                <p className="mt-2 text-[11.5px] leading-5.5 text-muted">{step.description}</p>
                <div className="mt-5 flex items-center gap-1.5 border-t border-line pt-3.5 text-[9.5px] text-subtle">
                  <span className="size-1 rounded-full bg-success/70" />
                  {step.meta}
                  <ArrowRight className="ml-auto size-3 text-subtle/50 transition-transform group-hover:translate-x-0.5" />
                </div>
              </motion.article>
            );
          })}
        </div>

        <div className="mt-10 flex items-center justify-center gap-2 text-[10.5px] text-subtle">
          <span className="h-px w-8 bg-line" />
          Backend processing is planned for Phase 2. This flow is demonstrated with local mock data.
          <span className="h-px w-8 bg-line" />
        </div>
      </div>
    </section>
  );
}
