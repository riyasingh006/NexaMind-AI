"use client";

import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BookOpenCheck,
  FileSearch,
  Info,
  Layers3,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { QUERY_EXAMPLES } from "@/lib/constants";
import { formatNumber } from "@/lib/utils";
import type { ChatMessage } from "@/types/chat";

interface ChatWindowProps {
  messages: ChatMessage[];
  isGenerating: boolean;
  selectedDocumentCount: number;
  totalChunks: number;
  allSourcesSelected: boolean;
  onExampleClick: (prompt: string) => void;
  onRegenerate: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
}

const exampleIcons = [BookOpenCheck, FileSearch, Layers3, WandSparkles, Sparkles];

export function ChatWindow({
  messages,
  isGenerating,
  selectedDocumentCount,
  totalChunks,
  allSourcesSelected,
  onExampleClick,
  onRegenerate,
  onRetry,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: messages.length > 0 ? "smooth" : "auto", block: "end" });
  }, [messages, isGenerating]);

  if (messages.length === 0) {
    return (
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[520px] -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(118,98,255,0.1),transparent_70%)]" />
        <div className="relative mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center px-5 py-10 sm:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="flex size-13 items-center justify-center rounded-2xl border border-accent/20 bg-[linear-gradient(145deg,rgba(139,125,251,0.16),rgba(75,60,160,0.08))] text-accent-bright shadow-[0_0_44px_rgba(139,125,251,0.12)]"
          >
            <Sparkles className="size-5.5" />
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.06 }}
            className="mt-5 text-center text-[27px] font-semibold tracking-[-0.04em] text-foreground sm:text-[32px]"
          >
            Ask Anything About Your Documents
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.12 }}
            className="mt-3 max-w-lg text-balance text-center text-[11.5px] leading-5.5 text-muted sm:text-[12.5px]"
          >
            Select your knowledge sources and ask questions. DocuMind AI will retrieve relevant
            evidence and generate grounded responses.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.18 }}
            className="mt-5 flex flex-wrap items-center justify-center gap-1.5"
          >
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-white/[0.025] px-2.5 py-1 text-[8.5px] text-subtle">
              <span className="size-1.5 rounded-full bg-success" />
              {allSourcesSelected
                ? `All ${selectedDocumentCount} indexed sources`
                : `${selectedDocumentCount} source${selectedDocumentCount === 1 ? "" : "s"} selected`}
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-white/[0.025] px-2.5 py-1 text-[8.5px] text-subtle">
              {formatNumber(totalChunks)} indexed chunks
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-warning/15 bg-warning/[0.04] px-2.5 py-1 text-[8.5px] text-warning/80">
              <Info className="size-2.5" />
              Grounded answers
            </span>
          </motion.div>

          <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
            {QUERY_EXAMPLES.map((prompt, index) => {
              const Icon = exampleIcons[index];
              return (
                <motion.button
                  key={prompt}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.22 + index * 0.035 }}
                  onClick={() => onExampleClick(prompt)}
                  className={`group flex items-center gap-3 rounded-xl border border-line bg-white/[0.018] px-3.5 py-3 text-left transition hover:border-accent/20 hover:bg-accent/[0.03] ${
                    index === 4 ? "sm:col-span-2" : ""
                  }`}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-line bg-white/[0.035] text-accent-bright/70 transition group-hover:border-accent/20 group-hover:text-accent-bright">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="flex-1 text-[10.5px] leading-4 text-muted transition group-hover:text-foreground">
                    {prompt}
                  </span>
                  <ArrowUpRight className="size-3 text-subtle/40 transition group-hover:text-accent-bright" />
                </motion.button>
              );
            })}
          </div>
          <p className="mt-5 text-center text-[8.5px] leading-4 text-subtle/70">
            Example prompts populate the input. Answers are generated by the LangGraph agent from
            indexed document evidence only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-7 px-4 py-6 sm:px-6">
        <div className="flex items-center gap-2 rounded-lg border border-warning/12 bg-warning/[0.035] px-3 py-2">
          <Info className="size-3 shrink-0 text-warning/70" />
          <p className="text-[9px] leading-4 text-warning/70">
            Answers are grounded in indexed document evidence, validated for citations, and
            abstain when the retrieved context is insufficient.
          </p>
        </div>
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onRegenerate={onRegenerate}
            onRetry={onRetry}
          />
        ))}
        <div ref={bottomRef} className="h-1" />
      </div>
    </div>
  );
}
