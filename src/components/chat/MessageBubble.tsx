"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Copy,
  FileText,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { LogoMark } from "@/components/ui/Logo";
import { formatDuration, formatTime } from "@/lib/utils";
import { MarkdownContent } from "@/components/chat/MarkdownContent";
import { RetrievedContext } from "@/components/chat/RetrievedContext";
import { SourceCitation } from "@/components/chat/SourceCitation";
import type { ChatMessage, ChatStage } from "@/types/chat";

function ThinkingState({ stage }: { stage?: ChatStage }) {
  return (
    <div className="rounded-xl border border-line bg-white/[0.018] p-3.5">
      <div className="flex items-center gap-2">
        <Loader2 className="size-3.5 animate-spin text-accent-bright" />
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-medium text-foreground">
            {stage?.label ?? "Building a grounded response"}
          </p>
          <p className="mt-0.5 truncate text-[8.5px] text-subtle">
            {stage?.detail ?? "Connecting to the LangGraph workflow"}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[8px] text-subtle">
          {stage?.state ?? "CONNECTING"}
        </span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.05]">
        <div className="streaming-progress h-full rounded-full bg-accent" />
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  onRegenerate,
  onRetry,
}: {
  message: ChatMessage;
  onRegenerate?: (message: ChatMessage) => void;
  onRetry?: (message: ChatMessage) => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const isAssistant = message.role === "assistant";
  const evidenceStatus = message.evidenceStatus ?? message.agent?.evidenceStatus;
  const groundednessStatus = message.groundednessStatus ?? message.agent?.groundednessStatus;
  const groundednessErrorCode =
    message.groundednessErrorCode ?? message.agent?.groundednessErrorCode;
  const groundednessFailed = groundednessStatus === "NOT_GROUNDED" || groundednessStatus === "FAILED";

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      toast({ title: "Answer copied", tone: "success" });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({
        title: "Clipboard unavailable",
        description: "Select the answer manually to copy it.",
        tone: "error",
      });
    }
  };

  if (!isAssistant) {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end sm:max-w-[76%]">
          <div className="mb-1.5 flex items-center gap-1.5 text-[9px] text-subtle">
            <span>You</span>
            <span className="size-0.5 rounded-full bg-white/20" />
            <span>{formatTime(message.createdAt)}</span>
          </div>
          <div className="rounded-2xl rounded-tr-md border border-accent/15 bg-[linear-gradient(145deg,rgba(122,104,240,0.16),rgba(79,65,154,0.12))] px-4 py-3">
            <p className="whitespace-pre-wrap text-[12.5px] leading-6 text-[#e7e4ff]">
              {message.content}
            </p>
            {message.attachments && message.attachments.length > 0 ? (
              <div className="mt-2.5 space-y-1.5 border-t border-white/10 pt-2.5">
                {message.attachments.map((attachment) => (
                  <div
                    key={attachment.name}
                    className="flex items-center gap-2 rounded-md border border-white/10 bg-black/15 px-2 py-1.5"
                  >
                    <FileText className="size-3 text-[#b4a9ff]" />
                    <span className="min-w-0 flex-1 truncate text-[9.5px] text-[#d8d3ff]">
                      {attachment.name}
                    </span>
                    <span className="font-mono text-[8px] text-[#b4a9ff]/60">{attachment.format}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="mt-1 flex items-center gap-1 pr-1 text-[8.5px] text-subtle/60">
            <UserRound className="size-2.5" />
            You
          </div>
        </div>
      </div>
    );
  }

  const isStreaming = message.status === "streaming";
  const isThinking = isStreaming && message.content.length === 0;
  const isFailed = message.status === "error";
  const isCancelled = message.status === "cancelled";
  const canRetry = (isFailed || isCancelled) && Boolean(onRetry);
  const canRegenerate =
    message.status === "complete" && message.content.length > 0 && Boolean(onRegenerate);

  return (
    <div className="flex items-start gap-3">
      <div className="relative mt-0.5 shrink-0">
        <LogoMark className="size-7 rounded-lg" />
        <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-[#0b0d18] bg-success" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[10.5px] font-semibold text-foreground">DocuMind AI</span>
          <span className="rounded-full border border-warning/15 bg-warning/[0.055] px-1.5 py-0.5 text-[7.5px] font-medium text-warning/90">
            {isFailed
              ? "Agent error"
              : isCancelled
                ? "Stopped"
                : groundednessFailed
                  ? "Review groundedness"
                  : evidenceStatus === "PARTIAL"
                    ? "Partial evidence"
                    : "Grounded agent"}
          </span>
          {isStreaming ? (
            <span className="flex items-center gap-1 text-[8.5px] text-accent-bright">
              <span className="size-1 animate-pulse rounded-full bg-accent-bright" />
              Generating
            </span>
          ) : (
            <span className="text-[8.5px] text-subtle">{formatTime(message.createdAt)}</span>
          )}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {isThinking ? (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
            >
              <ThinkingState stage={message.stage} />
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl border border-line bg-white/[0.012] px-4 py-3.5"
            >
              {isStreaming && message.stage ? (
                <div className="mb-2.5 flex items-center gap-2 rounded-lg border border-accent/10 bg-accent/[0.035] px-2.5 py-1.5">
                  <Loader2 className="size-3 animate-spin text-accent-bright" />
                  <span className="text-[8.5px] font-medium text-accent-bright">
                    {message.stage.label}
                  </span>
                  {message.stage.detail ? (
                    <span className="min-w-0 truncate text-[8px] text-subtle">
                      {message.stage.detail}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {isFailed || isCancelled ? (
                <div className="mb-3 rounded-lg border border-danger/20 bg-danger/[0.055] px-2.5 py-2">
                  <p className="text-[9px] font-medium text-[#ff9aaa]">
                    {isCancelled ? "Response stopped" : "Answer not completed"}
                  </p>
                  <p className="mt-0.5 text-[8.5px] leading-4 text-[#ffc0c9]/75">
                    {message.error?.message ??
                      "This answer was not verified and was not saved to conversation history."}
                  </p>
                </div>
              ) : null}
              <MarkdownContent content={message.content} />
              {isStreaming ? <span className="streaming-cursor ml-0.5" /> : null}

              {!isStreaming && message.sources && message.sources.length > 0 ? (
                <SourceCitation sources={message.sources} />
              ) : null}
              {message.status === "complete" ? (
                <>
                  {message.retrieval ? <RetrievedContext retrieval={message.retrieval} /> : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-[8.5px] text-subtle">
                      <span className="flex items-center gap-1">
                        <Sparkles className="size-2.5 text-accent-bright/70" />
                        {evidenceStatus
                          ? `${evidenceStatus.toLowerCase()} evidence`
                          : "Evidence-grounded response"}
                      </span>
                      {message.agent?.groundednessScore !== undefined ? (
                        <>
                          <span className="size-0.5 rounded-full bg-white/15" />
                          <span className="flex items-center gap-1">
                            <ShieldCheck className="size-2.5 text-success/80" />
                            {message.agent.groundednessScore.toFixed(2)} grounded
                          </span>
                        </>
                      ) : null}
                      {groundednessFailed && groundednessErrorCode ? (
                        <>
                          <span className="size-0.5 rounded-full bg-white/15" />
                          <span>verification error: {groundednessErrorCode}</span>
                        </>
                      ) : null}
                      {message.agent?.evidenceCoverageScore !== undefined ? (
                        <>
                          <span className="size-0.5 rounded-full bg-white/15" />
                          <span>
                            {Math.round(message.agent.evidenceCoverageScore * 100)}% coverage
                          </span>
                        </>
                      ) : null}
                      {message.retrieval ? (
                        <>
                          <span className="size-0.5 rounded-full bg-white/15" />
                          <span>{formatDuration(message.retrieval.durationMs)} retrieval</span>
                        </>
                      ) : null}
                      {message.processingMs ? (
                        <>
                          <span className="size-0.5 rounded-full bg-white/15" />
                          <span>{formatDuration(message.processingMs)} total</span>
                        </>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      {canRegenerate ? (
                        <button
                          type="button"
                          onClick={() => onRegenerate?.(message)}
                          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[8.5px] text-subtle transition hover:bg-white/5 hover:text-foreground"
                        >
                          <RotateCcw className="size-2.5" />
                          Regenerate
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={copyAnswer}
                        className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[8.5px] text-subtle transition hover:bg-white/5 hover:text-foreground"
                      >
                        {copied ? (
                          <Check className="size-2.5 text-success" />
                        ) : (
                          <Copy className="size-2.5" />
                        )}
                        {copied ? "Copied" : "Copy answer"}
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
              {canRetry ? (
                <div className="mt-3 flex items-center gap-2 border-t border-line pt-2.5">
                  {message.content.length > 0 ? (
                    <button
                      type="button"
                      onClick={copyAnswer}
                      className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[8.5px] text-subtle transition hover:bg-white/5 hover:text-foreground"
                    >
                      {copied ? (
                        <Check className="size-2.5 text-success" />
                      ) : (
                        <Copy className="size-2.5" />
                      )}
                      {copied ? "Copied" : "Copy partial answer"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onRetry?.(message)}
                    className="ml-auto flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[8.5px] text-muted transition hover:border-accent/25 hover:bg-accent/[0.05] hover:text-foreground"
                  >
                    <RotateCcw className="size-2.5" />
                    Retry
                  </button>
                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>

        {!isStreaming ? (
          <p className="mt-1.5 text-[8.5px] leading-4 text-subtle/65">
            {isFailed
              ? "The request failed before a validated, grounded answer could be produced. Partial text was not saved."
              : isCancelled
                ? "You stopped generation. Partial text is shown for reference but was not saved."
                : "Grounded in indexed document evidence with inline citation validation."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

