"use client";

import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  GraduationCap,
  Library,
  Microscope,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { USE_CASES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const iconMap: Record<string, LucideIcon> = {
  microscope: Microscope,
  graduationCap: GraduationCap,
  terminal: Terminal,
  library: Library,
  briefcaseBusiness: BriefcaseBusiness,
};

export function UseCases() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
          >
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-accent-bright/80">
              Use cases
            </p>
            <h2 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.045em] text-foreground sm:text-[43px]">
              Built for questions that
              <br />
              <span className="text-subtle">need real evidence.</span>
            </h2>
          </motion.div>
          <p className="max-w-sm text-[12px] leading-5.5 text-muted">
            From dense academic papers to operational knowledge bases, DocuMind is designed around
            traceable understanding.
          </p>
        </div>

        <div className="mt-10 grid gap-3 lg:grid-cols-12">
          {USE_CASES.map((useCase, index) => {
            const Icon = iconMap[useCase.icon];
            const large = index < 2;
            return (
              <motion.div
                key={useCase.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className={cn(
                  "group relative overflow-hidden rounded-xl border border-line bg-surface/60 p-5 transition duration-300 hover:border-line-strong",
                  large ? "lg:col-span-6 lg:p-6" : "lg:col-span-4",
                )}
              >
                <div className="pointer-events-none absolute right-0 top-0 size-40 translate-x-10 -translate-y-10 rounded-full bg-accent/[0.045] blur-2xl transition-opacity group-hover:opacity-150" />
                <div className="flex items-start justify-between">
                  <span className="flex size-8 items-center justify-center rounded-lg border border-line bg-white/[0.035] text-accent-bright/80">
                    <Icon className="size-4" />
                  </span>
                  <span className="rounded-full border border-line bg-white/[0.02] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-subtle">
                    {useCase.meta}
                  </span>
                </div>
                <h3 className={cn("mt-5 font-medium text-foreground", large ? "text-[16px]" : "text-[13px]")}>
                  {useCase.title}
                </h3>
                <p className="mt-2 max-w-md text-[11.5px] leading-[1.75] text-muted">
                  {useCase.description}
                </p>
                <Link
                  href="/dashboard/chat"
                  className="mt-5 inline-flex items-center gap-1.5 text-[10px] font-medium text-subtle transition hover:text-accent-bright"
                >
                  Try in workspace
                  <ArrowUpRight className="size-3" />
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
