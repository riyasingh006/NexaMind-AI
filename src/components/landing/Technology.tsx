"use client";

import { motion } from "framer-motion";
import { TECHNOLOGY_STACK } from "@/lib/constants";

export function Technology() {
  return (
    <section
      id="technology"
      className="relative scroll-mt-24 border-y border-line bg-[#080a13] py-20 sm:py-28"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_50%_0%,rgba(112,92,255,0.05),transparent_70%)]" />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-accent-bright/80">
            Technology stack
          </p>
          <h2 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.045em] text-foreground sm:text-[43px]">
            A modern stack for a
            <br />
            <span className="text-subtle">serious intelligence layer.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[13px] leading-6 text-muted">
            The frontend is production-ready today. The retrieval and generation stack is scoped,
            typed and prepared for Phase 2 integration.
          </p>
        </motion.div>

        <div className="mt-11 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {TECHNOLOGY_STACK.map((tech, index) => (
            <motion.div
              key={tech.name}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ duration: 0.35, delay: (index % 3) * 0.04 }}
              className="group flex items-center gap-3.5 rounded-xl border border-line bg-surface/50 p-3.5 transition duration-300 hover:border-line-strong hover:bg-white/[0.035]"
            >
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-lg border font-mono text-[11px] font-semibold transition duration-300 group-hover:scale-105"
                style={{
                  borderColor: `${tech.color}24`,
                  backgroundColor: `${tech.color}0d`,
                  color: tech.color,
                }}
              >
                {tech.mark}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[12.5px] font-medium text-foreground">{tech.name}</p>
                  <span className="rounded border border-line px-1 py-px font-mono text-[7.5px] uppercase tracking-wide text-subtle">
                    {tech.category}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[10px] text-muted">{tech.description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <div className="flex items-center gap-2 rounded-full border border-line bg-white/[0.025] px-3 py-1.5 text-[9.5px] text-subtle">
            <span className="size-1.5 rounded-full bg-success" />
            Next.js and TypeScript active in this build
          </div>
          <div className="flex items-center gap-2 rounded-full border border-line bg-white/[0.025] px-3 py-1.5 text-[9.5px] text-subtle">
            <span className="size-1.5 rounded-full bg-warning" />
            AI and backend services are integration-ready
          </div>
        </div>
      </div>
    </section>
  );
}
