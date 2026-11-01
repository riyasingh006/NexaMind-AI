"use client";

import { ArrowUpRight, MessageSquare, Sparkles } from "lucide-react";
import Link from "next/link";
import { useAppData } from "@/components/providers/AppDataProvider";
import { EmptyState } from "@/components/ui/PageHeading";
import { formatRelativeTime } from "@/lib/utils";

export function RecentConversations() {
  const { conversations, documents } = useAppData();
  const recent = [...conversations]
    .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
    .slice(0, 4);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface/75">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <div>
          <h2 className="text-[12.5px] font-semibold text-foreground">Recent conversations</h2>
          <p className="mt-0.5 text-[10px] text-subtle">Continue an evidence-backed inquiry</p>
        </div>
        <Link
          href="/dashboard/chat"
          className="rounded-md px-2 py-1 text-[10.5px] font-medium text-accent-bright transition hover:bg-accent-soft"
        >
          Open workspace
        </Link>
      </div>

      {recent.length === 0 ? (
        <EmptyState
          icon={<MessageSquare />}
          title="No conversations yet"
          description="Ask your first question in the AI workspace to start a grounded research thread."
          action={
            <Link
              href="/dashboard/chat"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[11px] font-medium text-white"
            >
              <Sparkles className="size-3" />
              Start a conversation
            </Link>
          }
        />
      ) : (
        <div className="divide-y divide-line/60">
          {recent.map((conversation) => {
            const contextNames = conversation.documentIds
              .map((id) => documents.find((document) => document.id === id)?.name)
              .filter(Boolean);
            return (
              <Link
                key={conversation.id}
                href={`/dashboard/chat?conversation=${conversation.id}`}
                className="group flex items-start gap-3 px-4 py-3.5 transition hover:bg-white/[0.022]"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-line bg-white/[0.03] text-accent-bright/70">
                  <MessageSquare className="size-3" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[11.5px] font-medium text-foreground/90 transition group-hover:text-foreground">
                      {conversation.title}
                    </span>
                    <ArrowUpRight className="size-3 shrink-0 text-transparent transition group-hover:text-subtle" />
                  </span>
                  <span className="mt-1 block truncate text-[9.5px] text-subtle">
                    {contextNames.length > 0 ? contextNames.join(" · ") : "No document context"}
                  </span>
                  <span className="mt-1.5 flex items-center gap-2 text-[9px] text-subtle/80">
                    <span>{formatRelativeTime(conversation.lastActivity)}</span>
                    <span className="size-0.5 rounded-full bg-white/15" />
                    <span>{conversation.messages.length} messages</span>
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
