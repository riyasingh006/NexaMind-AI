"use client";

import { Blocks, Database, FileStack, Layers3, Plus, Sparkles, Info } from "lucide-react";
import Link from "next/link";
import { RecentConversations } from "@/components/dashboard/RecentConversations";
import { RecentDocuments } from "@/components/dashboard/RecentDocuments";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { StatCard } from "@/components/dashboard/StatCard";
import { SystemStatus } from "@/components/dashboard/SystemStatus";
import { useAppData } from "@/components/providers/AppDataProvider";
import { PageHeading } from "@/components/ui/PageHeading";
import { formatNumber } from "@/lib/utils";

export default function DashboardPage() {
  const { documents } = useAppData();
  const indexedChunks = documents
    .filter((document) => document.status === "indexed")
    .reduce((sum, document) => sum + document.chunks, 0);
  const embeddedChunks = documents.reduce(
    (sum, document) => sum + (document.indexing?.embeddedChunks ?? 0),
    0,
  );
  const vectors = documents.reduce(
    (sum, document) => sum + (document.indexing?.vectorCount ?? 0),
    0,
  );
  const pendingChunks = documents.reduce(
    (sum, document) =>
      sum +
      Math.max(
        0,
        (document.indexing?.totalChunks ?? document.chunks) -
          (document.indexing?.embeddedChunks ?? 0),
      ),
    0,
  );
  const liveSparkline = (value: number) => Array.from({ length: 8 }, () => value);

  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="Workspace overview"
        title="Welcome to DocuMind AI"
        description="Your intelligent document knowledge workspace."
        actions={
          <>
            <Link
              href="/dashboard/chat"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-white/[0.04] px-3.5 text-[12px] font-medium text-foreground transition hover:bg-white/[0.07]"
            >
              <Sparkles className="size-3.5 text-accent-bright" />
              Open AI Workspace
            </Link>
            <Link
              href="/dashboard/documents?upload=1"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-[12px] font-medium text-white shadow-[0_8px_22px_-8px_rgba(139,125,251,0.65)] transition hover:bg-[#9b8eff]"
            >
              <Plus className="size-3.5" />
              Upload documents
            </Link>
          </>
        }
      />

      <div className="flex flex-col items-start justify-between gap-2 rounded-lg border border-accent/10 bg-accent/[0.035] px-3.5 py-2.5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-2 sm:items-center">
          <Info className="mt-0.5 size-3.5 shrink-0 text-accent-bright/70 sm:mt-0" />
          <p className="text-[10.5px] leading-5 text-muted">
            Documents, Gemini embeddings, the persistent FAISS index, retrieval, grounded chat
            and conversation persistence are connected to the Phase 5 backend API. Answer
            generation requires a configured Gemini key.
          </p>
        </div>
        <Link
          href="/dashboard/health"
          className="shrink-0 text-[10px] font-medium text-accent-bright transition hover:text-foreground"
        >
          Integration status
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total documents"
          value={String(documents.length)}
          change="Live workspace count"
          trend="neutral"
          icon={FileStack}
          sparkline={liveSparkline(documents.length)}
          accent="violet"
          badge="Live"
        />
        <StatCard
          label="Persisted chunks"
          value={formatNumber(indexedChunks)}
          change="From processed documents"
          trend="neutral"
          icon={Blocks}
          sparkline={liveSparkline(indexedChunks)}
          accent="cyan"
          badge="Live"
        />
        <StatCard
          label="Embedded chunks"
          value={formatNumber(embeddedChunks)}
          change={`${formatNumber(pendingChunks)} pending embeddings`}
          trend="neutral"
          icon={Layers3}
          sparkline={liveSparkline(embeddedChunks)}
          accent="green"
          badge="Live"
        />
        <StatCard
          label="Stored vectors"
          value={formatNumber(vectors)}
          change="In the FAISS index"
          trend="neutral"
          icon={Database}
          sparkline={liveSparkline(vectors)}
          accent="amber"
          badge="Live"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(290px,0.85fr)]">
        <RecentDocuments />
        <QuickActions />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <RecentConversations />
        <SystemStatus />
      </div>
    </div>
  );
}
