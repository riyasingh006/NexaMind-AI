import { ArrowUpRight, Code2, Sparkles } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

const productLinks = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Documents", href: "/dashboard/documents" },
  { label: "AI Workspace", href: "/dashboard/chat" },
  { label: "Retrieval Analytics", href: "/dashboard/analytics" },
];

const resourceLinks = [
  { label: "Features", href: "/#features" },
  { label: "Architecture", href: "/#architecture" },
  { label: "Technology", href: "/#technology" },
  { label: "Documentation", href: "/#documentation" },
];

const technologyLinks = [
  { label: "Next.js", href: "https://nextjs.org" },
  { label: "Google Gemini", href: "https://deepmind.google/technologies/gemini/" },
  { label: "LangGraph", href: "https://www.langchain.com/langgraph" },
  { label: "FAISS", href: "https://github.com/facebookresearch/faiss" },
];

export function CTA() {
  return (
    <section className="relative px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-[#0b0d19] px-6 py-14 text-center shadow-[0_40px_120px_-50px_rgba(105,83,255,0.35)] sm:px-12 sm:py-18">
          <div className="pointer-events-none absolute inset-0">
            <div className="surface-grid absolute inset-0 opacity-35 [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
            <div className="absolute left-1/2 top-0 size-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(126,104,255,0.22),transparent_65%)]" />
            <div className="absolute bottom-0 left-0 h-px w-full bg-[linear-gradient(90deg,transparent,rgba(139,125,251,0.4),transparent)]" />
          </div>
          <div className="relative">
            <span className="inline-flex size-10 items-center justify-center rounded-xl border border-accent/25 bg-accent-soft text-accent-bright shadow-[0_0_30px_rgba(139,125,251,0.15)]">
              <Sparkles className="size-4.5" />
            </span>
            <h2 className="mx-auto mt-5 max-w-2xl text-[32px] font-semibold leading-[1.08] tracking-[-0.045em] text-foreground sm:text-[45px]">
              Turn every document into
              <br />
              <span className="text-gradient">a source of truth.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[12.5px] leading-6 text-muted sm:text-[13.5px]">
              Explore the complete Phase 1 workspace with mock documents, simulated retrieval and
              grounded answer experiences.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
              <Link
                href="/dashboard"
                className="group inline-flex h-10.5 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 text-[12.5px] font-medium text-white shadow-[0_10px_30px_-8px_rgba(139,125,251,0.75)] transition hover:bg-[#9b8eff] sm:w-auto"
              >
                Enter the workspace
                <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <Link
                href="/#architecture"
                className="inline-flex h-10.5 w-full items-center justify-center rounded-lg border border-line-strong bg-white/[0.035] px-5 text-[12.5px] font-medium text-foreground transition hover:bg-white/[0.065] sm:w-auto"
              >
                Review architecture
              </Link>
            </div>
            <p className="mt-4 font-mono text-[8.5px] uppercase tracking-[0.14em] text-subtle/70">
              Frontend demo · no account required
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line bg-[#06070d]">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_repeat(3,0.7fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-[11.5px] leading-5.5 text-muted">
              Intelligent document understanding. Grounded AI answers. An agentic RAG platform
              built for evidence-first knowledge work.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="flex size-8 items-center justify-center rounded-lg border border-line bg-white/[0.025] text-subtle transition hover:border-line-strong hover:text-foreground"
                aria-label="GitHub placeholder"
              >
                <Code2 className="size-3.5" />
              </a>
              <span className="rounded-full border border-line bg-white/[0.025] px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.1em] text-subtle">
                GitHub placeholder
              </span>
            </div>
          </div>

          <div>
            <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-subtle">
              Product
            </p>
            <ul className="mt-4 space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-[11.5px] text-muted transition hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-subtle">
              Resources
            </p>
            <ul className="mt-4 space-y-2.5">
              {resourceLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-[11.5px] text-muted transition hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-subtle">
              Technology credits
            </p>
            <ul className="mt-4 space-y-2.5">
              {technologyLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11.5px] text-muted transition hover:text-foreground"
                  >
                    {link.label}
                    <ArrowUpRight className="size-2.5 text-subtle" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-line pt-6 sm:flex-row sm:items-center">
          <p className="text-[10px] text-subtle">
            © 2026 DocuMind AI. Phase 1 frontend demonstration.
          </p>
          <div className="flex flex-wrap items-center gap-4 text-[10px] text-subtle">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-warning" />
              Demo data only
            </span>
            <Link href="/dashboard/health" className="transition hover:text-foreground">
              System status
            </Link>
            <span>Built with Next.js, Gemini, and FAISS</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
