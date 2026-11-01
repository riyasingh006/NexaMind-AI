"use client";

import { motion } from "framer-motion";
import { ArrowRight, Check, CheckCircle2, Copy, FileJson2, Radio } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { cn } from "@/lib/utils";

const contracts = [
  {
    id: "retrieval",
    label: "Retrieval",
    icon: FileJson2,
    code: `POST /api/v1/retrieval
Content-Type: application/json

{
  "query": "key findings in the RAG survey",
  "document_ids": ["doc-rag-survey"],
  "top_k": 8,
  "rerank": true
}

// 200 OK · illustrative response
{
  "latency_ms": 142,
  "chunks": [
    {
      "document": "Agentic RAG Systems Survey.pdf",
      "page": 14,
      "similarity": 0.94,
      "text": "Systems that grade retrieved evidence..."
    }
  ]
}`,
  },
  {
    id: "stream",
    label: "Stream",
    icon: Radio,
    code: `POST /api/v1/chat
Accept: text/event-stream

{
  "conversation_id": "conv_rag_findings",
  "document_ids": ["doc-rag-survey"],
  "message": "What are the key findings?"
}

event: retrieval.complete
data: {"chunks": 8, "latency_ms": 142}

event: answer.delta
data: {"text": "The survey converges on four..."}

event: answer.complete
data: {"citations": 3, "processing_ms": 2480}`,
  },
];

export function Documentation() {
  const [activeTab, setActiveTab] = useState("retrieval");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const active = contracts.find((contract) => contract.id === activeTab) ?? contracts[0];

  const copyContract = async () => {
    try {
      await navigator.clipboard.writeText(active.code);
      setCopied(true);
      toast({
        title: "Contract copied",
        description: "The illustrative Phase 2 API contract is on your clipboard.",
        tone: "success",
      });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({
        title: "Clipboard unavailable",
        description: "Your browser blocked clipboard access. Select the code manually to copy.",
        tone: "error",
      });
    }
  };

  return (
    <section
      id="documentation"
      className="relative scroll-mt-24 overflow-hidden border-y border-line bg-[#080a12] py-20 sm:py-28"
    >
      <div className="surface-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:linear-gradient(to_bottom,transparent,black_40%,transparent)]" />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
          >
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-accent-bright/80">
              Documentation
            </p>
            <h2 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.045em] text-foreground sm:text-[43px]">
              Built for the
              <br />
              <span className="text-subtle">integration ahead.</span>
            </h2>
            <p className="mt-4 max-w-md text-[13px] leading-6 text-muted">
              Phase 1 ships the full interface and typed frontend contracts. Phase 2 connects
              FastAPI, Gemini and FAISS without redesigning the experience.
            </p>

            <ul className="mt-6 space-y-2.5">
              {[
                "Typed request and response boundaries",
                "Streaming-ready answer architecture",
                "Source citations and retrieval traces",
                "Scoped document selection end to end",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-[11.5px] text-muted">
                  <span className="flex size-4 items-center justify-center rounded-full border border-success/20 bg-success/[0.08]">
                    <Check className="size-2.5 text-success" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-wrap gap-2">
              <Link
                href="/dashboard/health"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-[11.5px] font-medium text-white transition hover:bg-[#9b8eff]"
              >
                Integration status
                <ArrowRight className="size-3.5" />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-white/[0.035] px-4 text-[11.5px] font-medium text-foreground transition hover:bg-white/[0.065]"
              >
                Open workspace
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="overflow-hidden rounded-2xl border border-line-strong bg-[#0a0c16] shadow-[0_40px_100px_-50px_rgba(0,0,0,0.9)]"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-1">
                {contracts.map((contract) => {
                  const Icon = contract.icon;
                  return (
                    <button
                      key={contract.id}
                      type="button"
                      onClick={() => setActiveTab(contract.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition",
                        activeTab === contract.id
                          ? "bg-white/[0.055] text-foreground"
                          : "text-subtle hover:text-muted",
                      )}
                    >
                      <Icon className="size-3" />
                      {contract.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-1 rounded-full border border-warning/15 bg-warning/[0.05] px-1.5 py-0.5 font-mono text-[7.5px] uppercase tracking-wide text-warning/80 sm:flex">
                  Illustrative contract
                </span>
                <button
                  type="button"
                  onClick={copyContract}
                  className="rounded-md border border-line p-1.5 text-subtle transition hover:bg-white/5 hover:text-foreground"
                  aria-label="Copy API contract"
                >
                  {copied ? <CheckCircle2 className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                </button>
              </div>
            </div>
            <div className="relative max-h-[440px] overflow-auto p-4 sm:p-5">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-[#0a0c16] to-transparent" />
              <pre className="font-mono text-[10.5px] leading-[1.85] text-[#a9adc1]">
                {active.code.split("\n").map((line, index) => (
                  <div key={`${active.id}-${index}`} className="flex">
                    <span className="mr-4 w-5 shrink-0 select-none text-right text-white/15">
                      {index + 1}
                    </span>
                    <span
                      className={cn(
                        line.startsWith("POST") && "text-accent-bright",
                        line.startsWith("event:") && "text-cyan",
                        line.startsWith("data:") && "text-success/80",
                        (line.startsWith("//") || line.startsWith("#")) && "text-subtle/60",
                      )}
                    >
                      {line || " "}
                    </span>
                  </div>
                ))}
              </pre>
            </div>
            <div className="flex items-center justify-between border-t border-line bg-white/[0.012] px-4 py-2.5">
              <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-subtle">
                API contract preview
              </span>
              <span className="flex items-center gap-1.5 text-[8.5px] text-subtle">
                <span className="size-1.5 rounded-full bg-warning" />
                Awaiting backend
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
