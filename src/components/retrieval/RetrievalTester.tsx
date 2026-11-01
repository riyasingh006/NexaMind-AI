"use client";

import {
  AlertCircle,
  Check,
  Database,
  FileSearch,
  Layers3,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Timer,
  AlertTriangle,
  GitMerge,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, PageHeading } from "@/components/ui/PageHeading";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  getEmbeddingStatus,
  getVectorIndexStatus,
  getVectorStatistics,
  rebuildVectorIndex,
  searchVectors,
  inspectRetrieval,
  evaluateGroundedness,
  type EmbeddingStatus,
  type VectorIndexStatus,
  type VectorSearchResponse,
  type VectorStatistics,
  type RetrievalInspectResult,
  type GroundednessEvaluationResult,
} from "@/lib/api/retrieval";
import { DOCUMENT_INDEX_STATE_META } from "@/lib/constants";
import { cn, formatBytes, formatDateTime, formatDuration, formatNumber } from "@/lib/utils";

const selectionLimit = 100;

function embeddingTone(status: EmbeddingStatus | null) {
  if (!status) return "neutral" as const;
  if (status.status === "READY") return "success" as const;
  if (status.status === "PROCESSING" || status.status === "PENDING") return "accent" as const;
  if (status.status === "DEGRADED" || status.status === "UNAVAILABLE") return "warning" as const;
  return "danger" as const;
}

function indexTone(status: VectorIndexStatus | null) {
  if (!status) return "neutral" as const;
  if (status.status === "READY") return "success" as const;
  if (status.status === "INITIALIZING") return "accent" as const;
  if (status.status === "DEGRADED" || status.status === "UNAVAILABLE") return "warning" as const;
  return "danger" as const;
}

function statusLabel(value: string | undefined) {
  if (!value) return "Unknown";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-white/[0.02] px-3 py-2.5">
      <p className="text-[8px] uppercase tracking-[0.1em] text-subtle">{label}</p>
      <p className="mt-1 font-mono text-[13px] text-foreground">{value}</p>
      {detail ? <p className="mt-0.5 truncate text-[8.5px] text-subtle">{detail}</p> : null}
    </div>
  );
}

function StatusCards({
  embedding,
  index,
  statistics,
  loading,
}: {
  embedding: EmbeddingStatus | null;
  index: VectorIndexStatus | null;
  statistics: VectorStatistics | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, item) => (
          <Skeleton key={item} className="h-[186px]" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <section className="rounded-xl border border-line bg-surface/75 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent-bright" />
            <div>
              <p className="text-[11px] font-medium text-foreground">Embedding service</p>
              <p className="text-[9px] text-subtle">
                {embedding?.model ?? "gemini-embedding-001"} / {embedding?.dimension ?? 768}d
              </p>
            </div>
          </div>
          <Badge tone={embeddingTone(embedding)} dot>
            {statusLabel(embedding?.status)}
          </Badge>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="Embedded" value={formatNumber(embedding?.embeddedChunks ?? 0)} />
          <Metric label="Pending" value={formatNumber(embedding?.pendingChunks ?? 0)} />
          <Metric label="Failed" value={formatNumber(embedding?.failedChunks ?? 0)} />
        </div>
        <p className="mt-2.5 text-[9.5px] leading-4.5 text-muted">
          {embedding?.detail ?? "Embedding status is unavailable."}
        </p>
      </section>

      <section className="rounded-xl border border-line bg-surface/75 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-accent-bright" />
            <div>
              <p className="text-[11px] font-medium text-foreground">FAISS index</p>
              <p className="text-[9px] text-subtle">
                {index?.metric ?? "cosine"} similarity / flat IP
              </p>
            </div>
          </div>
          <Badge tone={indexTone(index)} dot>
            {statusLabel(index?.status)}
          </Badge>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="Vectors" value={formatNumber(index?.vectorCount ?? 0)} />
          <Metric label="Documents" value={formatNumber(index?.indexedDocuments ?? 0)} />
          <Metric
            label="Storage"
            value={formatBytes(statistics?.storageBytes ?? 0)}
            detail={statistics?.indexVersion ?? undefined}
          />
        </div>
        <p className="mt-2.5 text-[9.5px] leading-4.5 text-muted">
          {index?.detail ?? "Vector index status is unavailable."}
        </p>
      </section>

      <section className="rounded-xl border border-line bg-surface/75 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers3 className="size-4 text-accent-bright" />
            <div>
              <p className="text-[11px] font-medium text-foreground">Indexed corpus</p>
              <p className="text-[9px] text-subtle">
                {statistics?.indexUpdatedAt
                  ? `Updated ${formatDateTime(statistics.indexUpdatedAt)}`
                  : "No index build recorded"}
              </p>
            </div>
          </div>
          <Badge tone={indexTone(index)} dot>
            {statistics?.documentsIndexed ?? 0} docs
          </Badge>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="Documents" value={formatNumber(statistics?.totalDocuments ?? 0)} />
          <Metric label="Chunks" value={formatNumber(statistics?.totalChunks ?? 0)} />
          <Metric label="Vectors" value={formatNumber(statistics?.vectorCount ?? 0)} />
        </div>
        <p className="mt-2.5 text-[9.5px] leading-4.5 text-muted">
          {statistics?.pendingChunks
            ? `${formatNumber(statistics.pendingChunks)} chunks still require embeddings.`
            : "Every persisted chunk has a current embedding when the index is ready."}
        </p>
      </section>
    </div>
  );
}

export function RetrievalTester() {
  const { documents, documentsLoading, refreshDocuments } = useAppData();
  const { toast } = useToast();
  const [embedding, setEmbedding] = useState<EmbeddingStatus | null>(null);
  const [index, setIndex] = useState<VectorIndexStatus | null>(null);
  const [statistics, setStatistics] = useState<VectorStatistics | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [topK, setTopK] = useState(5);
  const [threshold, setThreshold] = useState(0);
  const [searching, setSearching] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [result, setResult] = useState<VectorSearchResponse | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspection, setInspection] = useState<RetrievalInspectResult | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [groundedness, setGroundedness] = useState<GroundednessEvaluationResult | null>(null);
  const [groundednessError, setGroundednessError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const [embeddingStatus, indexStatus, stats] = await Promise.all([
        getEmbeddingStatus(),
        getVectorIndexStatus(),
        getVectorStatistics(),
      ]);
      setEmbedding(embeddingStatus);
      setIndex(indexStatus);
      setStatistics(stats);
      setStatusError(null);
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Unable to load retrieval status.",
      );
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const indexedDocuments = useMemo(
    () => documents.filter((document) => document.status === "indexed"),
    [documents],
  );

  const activeDocumentIds = scope === "selected" ? selectedIds : [];

  const toggleDocument = (documentId: string) => {
    setSelectedIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : current.length >= selectionLimit
          ? current
          : [...current, documentId],
    );
  };

  const runSearch = async () => {
    const normalized = query.trim();
    if (!normalized) {
      setSearchError("Enter a query to search the vector index.");
      return;
    }
    if (scope === "selected" && selectedIds.length === 0) {
      setSearchError("Select at least one document, or search the full index.");
      return;
    }

    setSearching(true);
    setSearchError(null);
    try {
      const response = await searchVectors({
        query: normalized,
        documentIds: activeDocumentIds,
        topK,
        threshold,
      });
      setResult(response);
    } catch (error) {
      setResult(null);
      setSearchError(
        error instanceof Error ? error.message : "The retrieval request failed.",
      );
    } finally {
      setSearching(false);
    }
  };

  const runInspection = async () => {
    const normalized = query.trim();
    if (!normalized) {
      setInspectionError("Enter a query to inspect the retrieval pipeline.");
      return;
    }
    if (scope === "selected" && selectedIds.length === 0) {
      setInspectionError("Select at least one document, or inspect the full index.");
      return;
    }

    setInspecting(true);
    setInspectionError(null);
    try {
      const response = await inspectRetrieval({
        query: normalized,
        documentIds: activeDocumentIds,
        topK,
        threshold,
      });
      setInspection(response);
    } catch (error) {
      setInspection(null);
      setInspectionError(
        error instanceof Error ? error.message : "The retrieval inspection failed.",
      );
    } finally {
      setInspecting(false);
    }
  };

  const runGroundedness = async () => {
    const normalizedQuery = query.trim();
    const normalizedAnswer = answerDraft.trim();
    if (!normalizedQuery || !normalizedAnswer) {
      setGroundednessError("Provide both a question and an answer to verify.");
      return;
    }
    if (scope === "selected" && selectedIds.length === 0) {
      setGroundednessError("Select at least one document, or verify against the full index.");
      return;
    }
    setEvaluating(true);
    setGroundednessError(null);
    try {
      const response = await evaluateGroundedness({
        question: normalizedQuery,
        answer: normalizedAnswer,
        documentIds: activeDocumentIds,
        topK,
        threshold,
      });
      setGroundedness(response);
    } catch (error) {
      setGroundedness(null);
      setGroundednessError(
        error instanceof Error ? error.message : "Groundedness verification failed.",
      );
    } finally {
      setEvaluating(false);
    }
  };

  const handleRebuild = async () => {
    if (scope === "selected" && selectedIds.length === 0) {
      toast({
        title: "Select documents first",
        description: "Choose at least one document or rebuild the full index.",
        tone: "error",
      });
      return;
    }
    setRebuilding(true);
    try {
      const response = await rebuildVectorIndex(activeDocumentIds);
      toast({
        title:
          response.documentsFailed > 0 ? "Index rebuilt with errors" : "Vector index rebuilt",
        description: `${formatNumber(response.vectorCount)} vectors from ${formatNumber(
          response.documentsProcessed,
        )} documents in ${formatDuration(response.durationMs)}.`,
        tone: response.documentsFailed > 0 ? "error" : "success",
      });
      await Promise.all([refreshStatus(), refreshDocuments()]);
    } catch (error) {
      toast({
        title: "Index rebuild failed",
        description:
          error instanceof Error ? error.message : "The vector index could not be rebuilt.",
        tone: "error",
      });
    } finally {
      setRebuilding(false);
    }
  };

  const configurationWarning =
    embedding && !embedding.configured
      ? "Gemini embeddings are not configured. Set DOCUMIND_GEMINI_API_KEY in the backend environment to enable indexing and semantic search."
      : null;

  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="Phase 6 / Retrieval"
        title="Vector retrieval"
        description="Run real Gemini query embeddings against the persistent FAISS index. Filter by document, tune top-K and score threshold, and inspect ranked evidence."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refreshStatus()}
            loading={statusLoading}
          >
            <RefreshCw className="size-3.5" />
            Refresh status
          </Button>
        }
      />

      {configurationWarning ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/[0.06] px-3.5 py-3">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <p className="text-[10.5px] leading-5 text-muted">{configurationWarning}</p>
        </div>
      ) : null}

      {statusError ? (
        <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/[0.06] px-3.5 py-3">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-[#ff9aaa]" />
          <p className="text-[10.5px] leading-5 text-muted">{statusError}</p>
        </div>
      ) : null}

      <StatusCards
        embedding={embedding}
        index={index}
        statistics={statistics}
        loading={statusLoading}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-xl border border-line bg-surface/75">
          <div className="border-b border-line px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[12px] font-semibold text-foreground">Query the index</h2>
                <p className="mt-0.5 text-[9.5px] text-subtle">
                  Queries use RETRIEVAL_QUERY; documents use RETRIEVAL_DOCUMENT.
                </p>
              </div>
              <Badge tone={embedding?.configured ? "success" : "warning"} dot>
                {embedding?.configured ? "Live embeddings" : "API key required"}
              </Badge>
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch();
            }}
            className="p-4"
          >
            <label htmlFor="retrieval-query" className="text-[9px] uppercase tracking-[0.1em] text-subtle">
              Search query
            </label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-3 top-3 size-3.5 text-subtle" />
              <textarea
                id="retrieval-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void runSearch();
                  }
                }}
                rows={3}
                maxLength={4000}
                placeholder="What evidence supports the main conclusions?"
                className="w-full resize-none rounded-lg border border-line bg-[#090b13] py-2.5 pl-9 pr-3 text-[11.5px] leading-5 text-foreground outline-none transition placeholder:text-subtle focus:border-accent/35 focus:ring-2 focus:ring-accent/10"
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_90px_110px]">
              <div>
                <label className="text-[9px] uppercase tracking-[0.1em] text-subtle">
                  Document scope
                </label>
                <div className="mt-1.5 flex h-8.5 rounded-lg border border-line bg-[#090b13] p-0.5">
                  {(["all", "selected"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setScope(value)}
                      className={cn(
                        "flex-1 rounded-md px-2 text-[10px] font-medium transition",
                        scope === value
                          ? "bg-accent-soft text-accent-bright"
                          : "text-subtle hover:text-foreground",
                      )}
                    >
                      {value === "all" ? "All documents" : "Selected only"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label
                  htmlFor="retrieval-top-k"
                  className="text-[9px] uppercase tracking-[0.1em] text-subtle"
                >
                  Top K
                </label>
                <input
                  id="retrieval-top-k"
                  type="number"
                  min={1}
                  max={100}
                  value={topK}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setTopK(Number.isFinite(next) ? Math.min(100, Math.max(1, next)) : 1);
                  }}
                  className="mt-1.5 h-8.5 w-full rounded-lg border border-line bg-[#090b13] px-2.5 font-mono text-[11px] text-foreground outline-none focus:border-accent/35"
                />
              </div>
              <div>
                <label
                  htmlFor="retrieval-threshold"
                  className="text-[9px] uppercase tracking-[0.1em] text-subtle"
                >
                  Min score
                </label>
                <input
                  id="retrieval-threshold"
                  type="number"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={threshold}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setThreshold(Number.isFinite(next) ? Math.min(1, Math.max(-1, next)) : 0);
                  }}
                  className="mt-1.5 h-8.5 w-full rounded-lg border border-line bg-[#090b13] px-2.5 font-mono text-[11px] text-foreground outline-none focus:border-accent/35"
                />
              </div>
            </div>

            {scope === "selected" ? (
              <div className="mt-3 rounded-lg border border-line bg-white/[0.015]">
                <div className="flex items-center justify-between border-b border-line px-3 py-2">
                  <span className="text-[9px] uppercase tracking-[0.1em] text-subtle">
                    Filter documents
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedIds(
                        selectedIds.length === indexedDocuments.length
                          ? []
                          : indexedDocuments.slice(0, selectionLimit).map((item) => item.id),
                      )
                    }
                    className="text-[9px] font-medium text-accent-bright hover:text-foreground"
                  >
                    {selectedIds.length === indexedDocuments.length ? "Clear" : "Select all"}
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto p-2">
                  {documentsLoading ? (
                    <div className="space-y-1.5 p-1">
                      <Skeleton className="h-7 w-full" />
                      <Skeleton className="h-7 w-full" />
                    </div>
                  ) : indexedDocuments.length === 0 ? (
                    <p className="px-2 py-3 text-[10px] text-subtle">
                      No processed documents are available yet.
                    </p>
                  ) : (
                    indexedDocuments.map((document) => {
                      const selected = selectedIds.includes(document.id);
                      const indexMeta = document.indexing
                        ? DOCUMENT_INDEX_STATE_META[document.indexing.state]
                        : null;
                      return (
                        <button
                          key={document.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleDocument(document.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition",
                            selected ? "bg-accent-soft" : "hover:bg-white/[0.035]",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-3.5 shrink-0 items-center justify-center rounded border",
                              selected
                                ? "border-accent bg-accent text-white"
                                : "border-line-strong bg-white/[0.02]",
                            )}
                          >
                            {selected ? <Check className="size-2.5" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[10px] text-foreground">
                              {document.name}
                            </span>
                            <span className="block text-[8.5px] text-subtle">
                              {formatNumber(document.chunks)} chunks /{" "}
                              {formatNumber(document.indexing?.vectorCount ?? 0)} vectors
                            </span>
                          </span>
                          {indexMeta ? (
                            <span className="shrink-0 text-[8px] text-subtle">
                              {indexMeta.label}
                            </span>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[9px] text-subtle">
                {scope === "all"
                  ? "Searching every document in the index."
                  : `${formatNumber(selectedIds.length)} document${
                      selectedIds.length === 1 ? "" : "s"
                    } selected.`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void runInspection()}
                  loading={inspecting}
                >
                  <GitMerge className="size-3.5" />
                  Advanced inspect
                </Button>
                <Button type="submit" size="sm" loading={searching}>
                  <Search className="size-3.5" />
                  Search vectors
                </Button>
              </div>
            </div>
          </form>
        </section>

        <aside className="space-y-3">
          <section className="rounded-xl border border-line bg-surface/75 p-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="size-3.5 text-accent-bright" />
              <h2 className="text-[11px] font-medium text-foreground">Index operations</h2>
            </div>
            <p className="mt-1.5 text-[9.5px] leading-4.5 text-muted">
              Rebuild embeddings and the FAISS index for the current scope. Indexing runs
              synchronously and may take several Gemini requests.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              onClick={() => void handleRebuild()}
              loading={rebuilding}
              disabled={documents.length === 0}
            >
              <Database className="size-3.5" />
              {scope === "all" ? "Rebuild full index" : "Rebuild selected"}
            </Button>
            <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-[9px] text-subtle">
              <p className="flex items-center justify-between gap-2">
                <span>Storage</span>
                <span className="truncate font-mono text-[8px]">{index?.storagePath ?? "-"}</span>
              </p>
              <p className="flex items-center justify-between gap-2">
                <span>Index version</span>
                <span className="font-mono text-[8px]">{index?.version ?? "-"}</span>
              </p>
              <p className="flex items-center justify-between gap-2">
                <span>Last updated</span>
                <span>{index?.updatedAt ? formatDateTime(index.updatedAt) : "-"}</span>
              </p>
              <p className="flex items-center justify-between gap-2">
                <span>Recovered backup</span>
                <span>{index?.recovered ? "Yes" : "No"}</span>
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-white/[0.018] p-4">
            <div className="flex items-center gap-2">
              <Timer className="size-3.5 text-accent-bright" />
              <h2 className="text-[11px] font-medium text-foreground">Last search</h2>
            </div>
            {result ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Metric label="Latency" value={formatDuration(result.processingTimeMs)} />
                <Metric label="Results" value={formatNumber(result.resultCount)} />
                <Metric label="Top K" value={String(result.topK)} />
                <Metric label="Threshold" value={result.threshold.toFixed(2)} />
              </div>
            ) : (
              <p className="mt-1.5 text-[9.5px] leading-4.5 text-muted">
                Run a query to record retrieval latency and scores.
              </p>
            )}
          </section>
        </aside>
      </div>

      <section className="overflow-hidden rounded-xl border border-line bg-surface/75">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3.5">
          <div>
            <h2 className="text-[12px] font-semibold text-foreground">Ranked evidence</h2>
            <p className="mt-0.5 text-[9.5px] text-subtle">
              {result
                ? `${formatNumber(result.resultCount)} result${
                    result.resultCount === 1 ? "" : "s"
                  } for "${result.query}"`
                : "Results are produced from the current FAISS index."}
            </p>
          </div>
          {result ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="accent">{result.embeddingModel}</Badge>
              <Badge tone="muted">{result.embeddingDimension}d</Badge>
              <Badge tone="success">{formatDuration(result.processingTimeMs)}</Badge>
              {result.indexVersion ? (
                <Badge tone="muted">index {result.indexVersion}</Badge>
              ) : null}
            </div>
          ) : null}
        </div>

        {searchError ? (
          <div className="m-4 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/[0.06] px-3 py-2.5">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-[#ff9aaa]" />
            <p className="text-[10px] leading-4.5 text-muted">{searchError}</p>
          </div>
        ) : null}

        {!result ? (
          <EmptyState
            icon={<FileSearch />}
            title="No search run yet"
            description="Enter a query above to retrieve ranked chunks with cosine-similarity scores and source metadata."
          />
        ) : result.results.length === 0 ? (
          <EmptyState
            icon={<FileSearch />}
            title="No results matched"
            description="No indexed chunks passed the current threshold. Lower the minimum score or rebuild the index for a wider corpus."
          />
        ) : (
          <div className="divide-y divide-line/70">
            {result.results.map((item) => (
              <article key={`${item.rank}-${item.chunkId}`} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-accent/20 bg-accent-soft font-mono text-[10px] text-accent-bright">
                      {item.rank}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[11.5px] font-medium text-foreground">
                        {item.documentName}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[8.5px] text-subtle">
                        <span>Chunk {item.chunkIndex + 1}</span>
                        {item.pageNumber ? <span>Page {item.pageNumber}</span> : null}
                        {item.sectionTitle ? <span>{item.sectionTitle}</span> : null}
                        {item.sectionHierarchy.length > 0 ? (
                          <span>{item.sectionHierarchy.join(" / ")}</span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <Badge tone="success">score {item.score.toFixed(4)}</Badge>
                </div>
                <p className="mt-2.5 whitespace-pre-wrap text-[10.5px] leading-5 text-muted">
                  {item.content}
                </p>
                <p className="mt-2 font-mono text-[8px] text-subtle">{item.chunkId}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {inspectionError ? (
        <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/[0.06] px-3.5 py-3">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-[#ff9aaa]" />
          <p className="text-[10.5px] leading-5 text-muted">{inspectionError}</p>
        </div>
      ) : null}

      {inspection ? (
        <section className="overflow-hidden rounded-xl border border-line bg-surface/75">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5">
            <div>
              <div className="flex items-center gap-2">
                <GitMerge className="size-4 text-accent-bright" />
                <h2 className="text-[12px] font-semibold text-foreground">
                  Advanced retrieval trace
                </h2>
              </div>
              <p className="mt-1 text-[9.5px] leading-4.5 text-subtle">
                {inspection.strategy} / semantic {inspection.settings.semanticWeight.toFixed(2)} / lexical{" "}
                {inspection.settings.lexicalWeight.toFixed(2)} / RRF{" "}
                {inspection.settings.rrfWeight.toFixed(2)} (k={inspection.settings.rrfK})
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="accent">{formatDuration(inspection.durationMs)}</Badge>
              <Badge tone={inspection.coverage.status === "COVERED" ? "success" : "warning"}>
                coverage {(inspection.coverage.score * 100).toFixed(0)}%
              </Badge>
              <Badge tone="muted">{inspection.candidates.length} fused</Badge>
              <Badge tone="muted">{inspection.chunks.length} final</Badge>
            </div>
          </div>

          {inspection.warnings.length > 0 ? (
            <div className="border-b border-line bg-warning/[0.035] px-4 py-2.5">
              {inspection.warnings.map((warning) => (
                <p key={warning} className="text-[9.5px] leading-4.5 text-warning">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}

          <div className="grid gap-2 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Hybrid" value={inspection.hybridSearchEnabled ? "Enabled" : "Disabled"} />
            <Metric
              label="Reranker"
              value={String(inspection.metadata.retrieval_rerank_method ?? "-")}
              detail={inspection.rerankingEnabled ? "Gemini rerank enabled" : "Disabled"}
            />
            <Metric
              label="Coverage terms"
              value={`${inspection.coverage.coveredTerms}/${inspection.coverage.totalTerms}`}
              detail={inspection.coverage.status}
            />
            <Metric
              label="Neighbors"
              value={formatNumber(Number(inspection.metadata.retrieval_neighbor_chunks ?? 0))}
              detail={inspection.neighborExpansionEnabled ? "Expansion enabled" : "Expansion disabled"}
            />
          </div>

          <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-2">
              <h3 className="text-[9px] uppercase tracking-[0.1em] text-subtle">
                Per-query retrieval lanes
              </h3>
              {inspection.perQuery.map((trace) => (
                <div key={trace.query} className="rounded-lg border border-line bg-white/[0.015] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[10.5px] text-foreground">{trace.query}</p>
                    <span className="font-mono text-[8.5px] text-subtle">
                      {formatDuration(trace.durationMs)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <Badge tone="muted">semantic {trace.semanticCount}</Badge>
                    <Badge tone="muted">lexical {trace.lexicalCount}</Badge>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <h3 className="text-[9px] uppercase tracking-[0.1em] text-subtle">
                Coverage map
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {inspection.coverage.terms.slice(0, 28).map((term) => (
                  <span
                    key={term.term}
                    className={cn(
                      "rounded border px-1.5 py-0.5 font-mono text-[8px]",
                      term.covered
                        ? "border-success/20 bg-success/[0.06] text-success"
                        : "border-line bg-white/[0.02] text-subtle",
                    )}
                    title={term.citationIds.join(", ") || "Not covered"}
                  >
                    {term.term}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-line px-4 py-3">
            <h3 className="text-[9px] uppercase tracking-[0.1em] text-subtle">
              Fused candidates
            </h3>
            <div className="mt-2 space-y-1.5">
              {inspection.candidates.slice(0, 10).map((candidate) => (
                <div
                  key={candidate.chunkId}
                  className="grid gap-2 rounded-lg border border-line bg-white/[0.015] px-3 py-2 sm:grid-cols-[28px_minmax(0,1fr)_repeat(4,70px)] sm:items-center"
                >
                  <span className="font-mono text-[9px] text-accent-bright">
                    F{candidate.fusionRank ?? "-"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[10px] text-foreground">{candidate.documentName}</p>
                    <p className="text-[8px] text-subtle">
                      chunk {candidate.chunkIndex + 1} / {candidate.retrievalSources.join(" + ")}
                    </p>
                  </div>
                  <span className="font-mono text-[8.5px] text-subtle">sem {candidate.semanticScore.toFixed(3)}</span>
                  <span className="font-mono text-[8.5px] text-subtle">lex {candidate.lexicalScore.toFixed(3)}</span>
                  <span className="font-mono text-[8.5px] text-subtle">fuse {candidate.fusionScore.toFixed(3)}</span>
                  <span className="font-mono text-[8.5px] text-accent-bright">
                    rank {candidate.rerankScore !== undefined ? candidate.rerankScore.toFixed(3) : "-"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-line bg-surface/75">
        <div className="flex items-start gap-2 border-b border-line px-4 py-3.5">
          <ShieldCheck className="mt-0.5 size-4 text-accent-bright" />
          <div>
            <h2 className="text-[12px] font-semibold text-foreground">Groundedness lab</h2>
            <p className="mt-0.5 text-[9.5px] text-subtle">
              Verify an answer claim by claim against retrieved evidence. Unsupported claims fail verification.
            </p>
          </div>
        </div>
        <div className="p-4">
          <label htmlFor="groundedness-answer" className="text-[9px] uppercase tracking-[0.1em] text-subtle">
            Candidate answer
          </label>
          <textarea
            id="groundedness-answer"
            value={answerDraft}
            onChange={(event) => setAnswerDraft(event.target.value)}
            rows={4}
            maxLength={20000}
            placeholder="Paste an answer with inline [S1] evidence labels..."
            className="mt-1.5 w-full resize-none rounded-lg border border-line bg-[#090b13] px-3 py-2.5 text-[11px] leading-5 text-foreground outline-none transition placeholder:text-subtle focus:border-accent/35 focus:ring-2 focus:ring-accent/10"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[9px] text-subtle">
              Uses the query and document scope above as retrieval evidence.
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void runGroundedness()}
              loading={evaluating}
            >
              <ShieldCheck className="size-3.5" />
              Verify groundedness
            </Button>
          </div>

          {groundednessError ? (
            <p className="mt-3 rounded-lg border border-danger/20 bg-danger/[0.06] px-3 py-2 text-[10px] text-muted">
              {groundednessError}
            </p>
          ) : null}

          {groundedness ? (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={groundedness.status === "GROUNDED" ? "success" : "danger"}>
                  {groundedness.status}
                </Badge>
                <Badge tone="muted">
                  score {groundedness.score !== undefined ? groundedness.score.toFixed(2) : "-"}
                </Badge>
                <Badge tone="muted">
                  {groundedness.supportedClaims} supported / {groundedness.unsupportedClaims} unsupported
                </Badge>
                <Badge tone="muted">{formatDuration(groundedness.durationMs)}</Badge>
              </div>
              {groundedness.claims.map((claim) => (
                <div
                  key={claim.claimId}
                  className="rounded-lg border border-line bg-white/[0.015] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[8px] text-subtle">{claim.claimId}</span>
                    <Badge tone={claim.status === "SUPPORTED" ? "success" : claim.status === "PARTIAL" ? "warning" : "danger"}>
                      {claim.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[10px] leading-4.5 text-muted">{claim.claim}</p>
                  <p className="mt-1 text-[8.5px] text-subtle">
                    {claim.evidenceIds.join(", ") || "No supporting evidence"} / {claim.reason}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {searching ? (
        <div className="flex items-center gap-2 text-[10px] text-subtle">
          <Loader2 className="size-3 animate-spin" />
          Embedding the query and searching FAISS...
        </div>
      ) : null}
    </div>
  );
}




