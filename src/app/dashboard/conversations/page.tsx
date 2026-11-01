"use client";

import {
  ArrowUpRight,
  BookMarked,
  FileText,
  MessageSquare,
  MessagesSquare,
  Plus,
  Quote,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState, PageHeading } from "@/components/ui/PageHeading";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Conversation } from "@/types/chat";

type ConversationFilter = "all" | "cited" | "empty";

const filters: { value: ConversationFilter; label: string }[] = [
  { value: "all", label: "All threads" },
  { value: "cited", label: "With citations" },
  { value: "empty", label: "Empty threads" },
];

function stripMarkdown(value: string) {
  return value
    .replace(/[#>*_`]/g, "")
    .replace(/\[(\d+)\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function ConversationsPage() {
  const { conversations, documents, deleteConversation } = useAppData();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);

  const sorted = useMemo(
    () =>
      [...conversations].sort(
        (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
      ),
    [conversations],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sorted.filter((conversation) => {
      const matchesQuery =
        normalized.length === 0 ||
        conversation.title.toLowerCase().includes(normalized) ||
        conversation.messages.some((message) =>
          message.content.toLowerCase().includes(normalized),
        );
      if (!matchesQuery) return false;
      if (filter === "cited") {
        return conversation.messages.some(
          (message) => message.role === "assistant" && (message.sources?.length ?? 0) > 0,
        );
      }
      if (filter === "empty") return conversation.messages.length === 0;
      return true;
    });
  }, [sorted, query, filter]);

  const totalMessages = conversations.reduce(
    (sum, conversation) => sum + conversation.messages.length,
    0,
  );
  const citedAnswers = conversations.reduce(
    (sum, conversation) =>
      sum +
      conversation.messages.filter(
        (message) => message.role === "assistant" && (message.sources?.length ?? 0) > 0,
      ).length,
    0,
  );
  const activeDocumentCount = new Set(conversations.flatMap((item) => item.documentIds)).size;

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteConversation(deleteTarget.id);
      toast({
        title: "Conversation deleted",
        description: `"${deleteTarget.title}" was removed from persisted history.`,
        tone: "success",
      });
    } catch (error) {
      toast({
        title: "Delete failed",
        description:
          error instanceof Error ? error.message : "Unable to delete conversation.",
        tone: "error",
      });
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="Knowledge threads"
        title="Conversations"
        description="Review previous investigations, revisit cited answers and continue any thread in the AI workspace."
        actions={
          <Link
            href="/dashboard/chat"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-[11.5px] font-medium text-white shadow-[0_8px_22px_-8px_rgba(139,125,251,0.65)] transition hover:bg-[#9b8eff]"
          >
            <Plus className="size-3.5" />
            New conversation
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Conversation threads",
            value: conversations.length,
            detail: "Persisted by the backend",
            icon: MessagesSquare,
            accent: "text-accent-bright",
          },
          {
            label: "Messages exchanged",
            value: totalMessages,
            detail: "User and assistant turns",
            icon: MessageSquare,
            accent: "text-cyan",
          },
          {
            label: "Cited answers",
            value: citedAnswers,
            detail: "With validated citations",
            icon: Quote,
            accent: "text-success",
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-xl border border-line bg-surface/75 p-4">
              <div className="flex items-center justify-between">
                <span className="flex size-7 items-center justify-center rounded-lg border border-line bg-white/[0.025]">
                  <Icon className={cn("size-3.5", stat.accent)} />
                </span>
                <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-subtle">
                  Live
                </span>
              </div>
              <p className="mt-3 text-[23px] font-semibold tracking-[-0.04em] text-foreground">
                {stat.value}
              </p>
              <p className="mt-0.5 text-[10px] font-medium text-muted">{stat.label}</p>
              <p className="mt-1 text-[8.5px] text-subtle">{stat.detail}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface/60 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles and message content..."
            className="h-9 w-full rounded-lg border border-line bg-[#0a0c16] pl-9 pr-8 text-[11px] text-foreground outline-none transition placeholder:text-subtle focus:border-accent/35"
            aria-label="Search conversations"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-subtle hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          {filters.map((item) => {
            const count =
              item.value === "all"
                ? conversations.length
                : item.value === "cited"
                  ? conversations.filter((conversation) =>
                      conversation.messages.some(
                        (message) =>
                          message.role === "assistant" && (message.sources?.length ?? 0) > 0,
                      ),
                    ).length
                  : conversations.filter((conversation) => conversation.messages.length === 0)
                      .length;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[9.5px] font-medium transition",
                  filter === item.value
                    ? "bg-white/[0.08] text-foreground"
                    : "text-subtle hover:bg-white/[0.035] hover:text-muted",
                )}
                aria-pressed={filter === item.value}
              >
                {item.label}
                <span className="font-mono text-[8px] text-subtle/70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface/60">
          <EmptyState
            icon={<MessageSquare />}
            title={query ? "No conversations match your search" : "No conversations in this view"}
            description={
              query
                ? "Try a different keyword or clear the active filter."
                : "Start a new thread in the AI workspace and it will appear here."
            }
            action={
              query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                  className="inline-flex h-8 items-center rounded-lg border border-line-strong bg-white/[0.04] px-3 text-[10px] font-medium text-foreground transition hover:bg-white/[0.07]"
                >
                  Clear filters
                </button>
              ) : (
                <Link
                  href="/dashboard/chat"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[10px] font-medium text-white transition hover:bg-[#9b8eff]"
                >
                  <Plus className="size-3" />
                  Start a conversation
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((conversation) => {
            const lastAssistant = [...conversation.messages]
              .reverse()
              .find((message) => message.role === "assistant" && message.content);
            const lastUser = [...conversation.messages]
              .reverse()
              .find((message) => message.role === "user");
            const sourceCount = conversation.messages.reduce(
              (sum, message) => sum + (message.sources?.length ?? 0),
              0,
            );
            const docNames = conversation.documentIds
              .map((id) => documents.find((document) => document.id === id)?.name)
              .filter(Boolean) as string[];

            return (
              <article
                key={conversation.id}
                className="group relative overflow-hidden rounded-xl border border-line bg-surface/70 transition hover:border-line-strong hover:bg-surface/90"
              >
                <Link
                  href={`/dashboard/chat?conversation=${conversation.id}`}
                  className="block p-4 pr-14 sm:p-5 sm:pr-16"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-accent/15 bg-accent-soft text-accent-bright">
                      <MessageSquare className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-[12px] font-semibold text-foreground">
                          {conversation.title}
                        </h2>
                        {conversation.messages.length === 0 ? (
                          <Badge tone="muted" className="text-[8px]">
                            Empty
                          </Badge>
                        ) : sourceCount > 0 ? (
                          <Badge tone="success" className="text-[8px]">
                            Cited
                          </Badge>
                        ) : (
                          <Badge tone="accent" className="text-[8px]">
                            Demo
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[10px] leading-5 text-muted">
                        {lastAssistant
                          ? stripMarkdown(lastAssistant.content).slice(0, 220)
                          : lastUser
                            ? `Question: ${lastUser.content}`
                            : "This thread has not been started yet. Open it to ask your first question."}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[8.5px] text-subtle">
                        <span>{formatRelativeTime(conversation.lastActivity)}</span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="size-2.5" />
                          {conversation.messages.length} messages
                        </span>
                        <span className="flex items-center gap-1">
                          <Quote className="size-2.5" />
                          {sourceCount} citations
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="size-2.5" />
                          {activeDocumentCount > 0 ? docNames.length : 0} sources
                        </span>
                        {docNames.length > 0 ? (
                          <span className="flex min-w-0 items-center gap-1 text-subtle/70">
                            <BookMarked className="size-2.5 shrink-0" />
                            <span className="truncate">{docNames.slice(0, 2).join(" · ")}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className="mt-1 hidden items-center gap-1 text-[8.5px] text-accent-bright opacity-0 transition group-hover:opacity-100 sm:flex">
                      Open
                      <ArrowUpRight className="size-3" />
                    </span>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(conversation)}
                  className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md text-subtle transition hover:bg-danger/10 hover:text-[#ff9aaa]"
                  aria-label={`Delete ${conversation.title}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </article>
            );
          })}
        </div>
      )}

      <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface/50 px-4 py-3">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 size-3 shrink-0 text-accent-bright/60" />
          <p className="text-[8.5px] leading-4 text-subtle">
            Conversation history and citation metadata are persisted by the backend. Sharing and
            cross-device collaboration are not implemented.
          </p>
        </div>
        <Link
          href="/dashboard/chat"
          className="shrink-0 text-[9px] font-medium text-accent-bright transition hover:text-foreground"
        >
          Open workspace
        </Link>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete this conversation?"
        description={`"${deleteTarget?.title ?? "This conversation"}" and its local message history will be removed. This cannot be undone.`}
        confirmLabel="Delete conversation"
      />
    </div>
  );
}
