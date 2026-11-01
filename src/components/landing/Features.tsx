"use client";

import { motion } from "framer-motion";
import {
  FileStack,
  ListFilter,
  Quote,
  Radar,
  ScanSearch,
  ShieldCheck,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { FEATURES } from "@/lib/constants";

const iconMap: Record<string, LucideIcon> = {
  fileStack: FileStack,
  radar: Radar,
  workflow: Workflow,
  scanSearch: ScanSearch,
  shieldCheck: ShieldCheck,
  quote: Quote,
  wandSparkles: WandSparkles,
  listFilter: ListFilter,
};

export function Features() {
  return (
    <section id="features" className="relative scroll-mt-24 py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)]" />
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="max-w-2xl"
          >
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-accent-bright/80">
              Capabilities
            </p>
            <h2 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.045em] text-foreground sm:text-[43px]">
              Designed to retrieve.
              <br />
              <span className="text-subtle">Built to prove.</span>
            </h2>
            <p className="mt-4 max-w-xl text-[13px] leading-6 text-muted sm:text-[14px]">
              A complete retrieval intelligence layer — from document ingestion to cited,
              evidence-constrained answers. Every capability has a visible trace.
            </p>
          </motion.div>
          <div className="hidden items-center gap-2 text-[10.5px] text-subtle sm:flex">
            <span className="size-1.5 rounded-full bg-accent" />
            8 core capabilities
          </div>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, index) => {
            const Icon = iconMap[feature.icon];
            return (
              <motion.article
                key={feature.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: (index % 4) * 0.045 }}
                className="card-sheen group relative flex min-h-[192px] flex-col rounded-xl border border-line bg-surface/60 p-5 transition-colors duration-300 hover:border-line-strong"
              >
                <div className="flex items-start justify-between">
                  <span className="flex size-8 items-center justify-center rounded-lg border border-line bg-white/[0.035] text-accent-bright/85 transition duration-300 group-hover:border-accent/25 group-hover:bg-accent-soft group-hover:text-accent-bright">
                    <Icon className="size-4" />
                  </span>
                  <span className="font-mono text-[9px] text-subtle/50">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-5 text-[13px] font-medium leading-5 text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-[11px] leading-[1.7] text-muted">{feature.description}</p>
                <div className="mt-auto flex items-center gap-1.5 pt-4">
                  <span
                    className={`size-1 rounded-full ${
                      feature.accent === "cyan" ? "bg-cyan/70" : "bg-accent/70"
                    }`}
                  />
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-subtle/60">
                    {feature.accent === "cyan" ? "Retrieval layer" : "Intelligence layer"}
                  </span>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
