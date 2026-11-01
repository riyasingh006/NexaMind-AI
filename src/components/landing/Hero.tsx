"use client";

import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, LockKeyhole, Network, Sparkles } from "lucide-react";
import Link from "next/link";
import { platformStats } from "@/lib/mock-data";
import { WorkflowVisual } from "@/components/landing/WorkflowVisual";

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-10 pt-30 sm:pb-14 sm:pt-36">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="surface-grid absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,black_0%,transparent_65%)]" />
        <div className="animate-drift absolute left-1/2 top-[-320px] size-[780px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(108,88,255,0.19),transparent_66%)] blur-2xl" />
        <div className="absolute right-[8%] top-[28%] size-72 rounded-full bg-[radial-gradient(circle,rgba(91,171,255,0.07),transparent_68%)] blur-2xl" />
        <div className="absolute left-[-6%] top-[44%] size-80 rounded-full bg-[radial-gradient(circle,rgba(164,91,255,0.06),transparent_70%)] blur-2xl" />
      </div>

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft py-1 pl-1.5 pr-3 text-[10.5px] text-accent-bright"
          >
            <span className="rounded-full bg-accent/20 px-2 py-0.5 font-mono text-[8.5px] font-semibold uppercase tracking-[0.12em] text-[#d8d2ff]">
              Phase 1
            </span>
            <span className="text-[#c1baff]">Agentic retrieval, grounded by design</span>
            <Sparkles className="size-3" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="text-balance text-[43px] font-semibold leading-[1.03] tracking-[-0.055em] text-foreground sm:text-[64px] lg:text-[76px]"
          >
            Your Documents.
            <br />
            <span className="text-gradient">One Intelligent AI.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mt-6 max-w-2xl text-balance text-[13.5px] leading-6.5 text-muted sm:text-[15.5px] sm:leading-7"
          >
            Transform your documents into an intelligent knowledge system. Upload, retrieve,
            analyze, and get evidence-backed answers powered by advanced Retrieval-Augmented
            Generation.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row"
          >
            <Link
              href="/dashboard"
              className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 text-[13px] font-medium text-white shadow-[0_10px_32px_-8px_rgba(139,125,251,0.72)] transition hover:bg-[#9b8eff] hover:shadow-[0_14px_38px_-8px_rgba(139,125,251,0.9)] sm:w-auto"
            >
              Start Exploring
              <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
            <Link
              href="/#architecture"
              className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-white/[0.035] px-6 text-[13px] font-medium text-foreground transition hover:border-white/20 hover:bg-white/[0.065] sm:w-auto"
            >
              <Network className="size-4 text-accent-bright/80" />
              Explore Architecture
              <ArrowRight className="size-3.5 text-subtle transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] text-subtle"
          >
            <span className="flex items-center gap-1.5">
              <LockKeyhole className="size-3" />
              Local demo environment
            </span>
            <span className="size-0.5 rounded-full bg-white/20" />
            <span>PDF · TXT · Markdown</span>
            <span className="size-0.5 rounded-full bg-white/20" />
            <span>No API keys required</span>
          </motion.div>
        </div>

        <WorkflowVisual />

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5 }}
          className="relative mx-auto mt-16 grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line/60 sm:mt-20 lg:grid-cols-4"
        >
          {platformStats.map((stat) => (
            <div key={stat.label} className="group bg-[#0a0c15]/95 px-4 py-5 text-center sm:px-6">
              <p className="text-[21px] font-semibold tracking-[-0.03em] text-foreground sm:text-[25px]">
                {stat.value}
              </p>
              <p className="mt-1 text-[10.5px] font-medium text-muted">{stat.label}</p>
              <p className="mt-0.5 text-[9px] text-subtle">{stat.detail}</p>
            </div>
          ))}
          <span className="col-span-full bg-[#090b13] py-1.5 text-center font-mono text-[8.5px] uppercase tracking-[0.15em] text-subtle/70">
            Illustrative platform metrics · demo data
          </span>
        </motion.div>
      </div>
    </section>
  );
}
