"use client";

import { AlertCircle, FileSearch, Filter, Plus, RefreshCw, Search, Upload, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { DocumentDetails } from "@/components/documents/DocumentDetails";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { UploadZone } from "@/components/documents/UploadZone";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState, PageHeading } from "@/components/ui/PageHeading";
import { Skeleton } from "@/components/ui/Skeleton";
import { filterDocuments } from "@/hooks/useDocuments";
import { cn, downloadTextFile, formatNumber } from "@/lib/utils";
import type { Document, DocumentFilter } from "@/types/document";

const filters: { value: DocumentFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "PDF", label: "PDF" },
  { value: "TXT", label: "TXT" },
  { value: "MD", label: "Markdown" },
  { value: "indexed", label: "Indexed" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
];

function DocumentsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-3.5 w-80" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-[420px] w-full" />
    </div>
  );
}

function DocumentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    documents,
    documentsLoading,
    documentsError,
    refreshDocuments,
    deleteDocument,
    reprocessDocument,
    indexDocument,
    deleteDocumentIndex,
    getDocumentContent,
  } = useAppData();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DocumentFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedDocument = documents.find((document) => document.id === selectedId) ?? null;
  const filtered = filterDocuments(documents, filter, query);
  const loading = documentsLoading;

  useEffect(() => {
    const documentId = searchParams.get("doc");
    if (documentId) setSelectedId(documentId);
    if (searchParams.get("upload") === "1") {
      const timer = setTimeout(() => {
        document.getElementById("upload-zone")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTyping = ["INPUT", "TEXTAREA"].includes(target.tagName);
      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const countForFilter = (value: DocumentFilter) => {
    if (value === "all") return documents.length;
    if (value === "PDF" || value === "TXT" || value === "MD") {
      return documents.filter((document) => document.format === value).length;
    }
    if (value === "processing") {
      return documents.filter(
        (document) => document.status === "processing" || document.status === "queued",
      ).length;
    }
    return documents.filter((document) => document.status === value).length;
  };

  const closeDrawer = () => {
    setSelectedId(null);
    if (searchParams.get("doc")) {
      router.replace("/dashboard/documents", { scroll: false });
    }
  };

  const handleDelete = async (document: Document) => {
    try {
      await deleteDocument(document.id);
      if (selectedId === document.id) {
        setSelectedId(null);
      }
      toast({
        title: "Document deleted",
        description: `${document.name} was removed from the knowledge base.`,
        tone: "success",
      });
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "The document could not be deleted.",
        tone: "error",
      });
    }
  };

  const handleReindex = async (document: Document) => {
    toast({
      title: "Re-index started",
      description: `${document.name} is being processed again.`,
      tone: "info",
    });
    try {
      const updated = await reprocessDocument(document.id);
      if (updated.status === "failed") {
        toast({
          title: "Re-index failed",
          description: updated.error ?? "The document could not be processed.",
          tone: "error",
        });
        return;
      }
      toast({
        title: "Re-index complete",
        description: `${document.name} is indexed with ${updated.chunks} chunks.`,
        tone: "success",
      });
    } catch (error) {
      toast({
        title: "Re-index failed",
        description: error instanceof Error ? error.message : "The document could not be processed.",
        tone: "error",
      });
    }
  };

  const handleIndex = async (document: Document) => {
    const alreadyIndexed = (document.indexing?.vectorCount ?? 0) > 0;
    toast({
      title: alreadyIndexed ? "Vector reindex started" : "Vector index started",
      description: `Generating embeddings for ${document.name}.`,
      tone: "info",
    });
    try {
      const updated = await indexDocument(
        document.id,
        alreadyIndexed || document.indexing?.state === "STALE",
      );
      const vectorCount = updated.indexing?.vectorCount ?? 0;
      if (updated.indexing?.state === "FAILED") {
        toast({
          title: "Vector indexing failed",
          description:
            updated.indexing.error?.message ?? "The embedding pipeline could not complete.",
          tone: "error",
        });
        return;
      }
      toast({
        title: alreadyIndexed ? "Vector index rebuilt" : "Vector index ready",
        description: `${formatNumber(vectorCount)} vectors are available for ${document.name}.`,
        tone: "success",
      });
    } catch (error) {
      toast({
        title: "Vector indexing failed",
        description:
          error instanceof Error ? error.message : "The document could not be indexed.",
        tone: "error",
      });
    }
  };

  const handleRemoveIndex = async (document: Document) => {
    try {
      await deleteDocumentIndex(document.id);
      toast({
        title: "Vectors removed",
        description: `${document.name} was removed from the vector index.`,
        tone: "success",
      });
    } catch (error) {
      toast({
        title: "Could not remove vectors",
        description:
          error instanceof Error ? error.message : "The document index could not be cleared.",
        tone: "error",
      });
    }
  };

  const handleDownload = async (document: Document) => {
    try {
      const content = await getDocumentContent(document.id);
      const text = `DocuMind AI — Extracted Document Text\n\nName: ${content.filename}\nDocument ID: ${content.document_id}\nCharacters: ${content.total_characters}\nPages: ${content.page_count ?? "—"}\nChunking strategy: ${content.chunking_strategy ?? "—"}\n\n--- EXTRACTED CONTENT ---\n\n${content.content}`;
      downloadTextFile(`${document.name.replace(/\.[^.]+$/, "")}-extracted.txt`, text);
      toast({
        title: "Extracted text downloaded",
        description: content.truncated
          ? "The exported text was truncated at the backend content limit."
          : "The extracted document text has been saved to your device.",
        tone: "success",
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Extracted text is not available.",
        tone: "error",
      });
    }
  };

  const clearFilters = () => {
    setQuery("");
    setFilter("all");
  };

  const hasFilters = query.length > 0 || filter !== "all";

  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="Knowledge base"
        title="Documents"
        description="Upload, inspect and manage the sources that power grounded retrieval. Documents are parsed and chunked by the backend pipeline."
        actions={
          <>
            <button
              type="button"
              onClick={() => {
                searchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                window.setTimeout(() => searchRef.current?.focus(), 250);
              }}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-white/[0.04] px-3.5 text-[12px] font-medium text-foreground transition hover:bg-white/[0.07]"
            >
              <Search className="size-3.5" />
              Find document
            </button>
            <button
              type="button"
              onClick={() =>
                document.getElementById("upload-zone")?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-[12px] font-medium text-white shadow-[0_8px_22px_-8px_rgba(139,125,251,0.65)] transition hover:bg-[#9b8eff]"
            >
              <Plus className="size-3.5" />
              Upload documents
            </button>
          </>
        }
      />

      {documentsError ? (
        <div className="flex flex-col gap-2 rounded-lg border border-danger/20 bg-danger/[0.06] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-[#ff9aaa]" />
            <p className="text-[10.5px] leading-5 text-muted">
              Could not reach the document API. {documentsError}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshDocuments().catch(() => undefined)}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-lg border border-line-strong bg-white/[0.04] px-3 text-[10.5px] font-medium text-foreground transition hover:bg-white/[0.07] sm:self-auto"
          >
            <RefreshCw className="size-3" />
            Retry
          </button>
        </div>
      ) : null}

      <UploadZone />

      <section className="overflow-hidden rounded-xl border border-line bg-surface/75">
        <div className="border-b border-line p-3.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search documents by name or content..."
                className="h-8.5 w-full rounded-lg border border-line bg-[#090b13] pl-9 pr-8 text-[11.5px] text-foreground outline-none transition placeholder:text-subtle focus:border-accent/35 focus:ring-2 focus:ring-accent/10"
                aria-label="Search documents"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-subtle hover:text-foreground"
                  aria-label="Clear document search"
                >
                  <X className="size-3" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1 font-mono text-[8px] text-subtle sm:block">
                  /
                </kbd>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[9.5px] text-subtle">
                <Filter className="size-3" />
                {formatNumber(filtered.length)} of {formatNumber(documents.length)} documents
              </span>
              <span className="hidden h-3 w-px bg-line sm:block" />
              <span className="text-[9.5px] text-subtle">
                {formatNumber(documents.reduce((sum, document) => sum + document.chunks, 0))} chunks
              </span>
            </div>
          </div>

          <div className="mt-3 flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            {filters.map((item) => {
              const active = filter === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10.5px] font-medium transition",
                    active
                      ? "border-accent/25 bg-accent-soft text-accent-bright"
                      : "border-transparent text-subtle hover:bg-white/[0.035] hover:text-foreground",
                  )}
                >
                  {item.label}
                  <span
                    className={cn(
                      "rounded px-1 py-px font-mono text-[8px]",
                      active ? "bg-accent/15 text-accent-bright" : "bg-white/[0.04] text-subtle",
                    )}
                  >
                    {countForFilter(item.value)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {!loading && filtered.length === 0 ? (
          <EmptyState
            icon={<FileSearch />}
            title={hasFilters ? "No matching documents" : "Your library is empty"}
            description={
              hasFilters
                ? "Try a different search term or clear the active filters to see the full library."
                : documentsError
                  ? "The document API is unavailable. Retry the connection above to load your library."
                  : "Upload your first PDF, TXT or Markdown document to start building the knowledge base."
            }
            action={
              hasFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-line-strong bg-white/[0.04] px-3 text-[11px] font-medium text-foreground transition hover:bg-white/[0.07]"
                >
                  <X className="size-3" />
                  Clear filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    document.getElementById("upload-zone")?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                  className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-accent px-3 text-[11px] font-medium text-white"
                >
                  <Upload className="size-3" />
                  Upload documents
                </button>
              )
            }
          />
        ) : (
          <DocumentTable
            documents={filtered}
            loading={loading}
            onView={(document) => setSelectedId(document.id)}
            onDelete={setDeleteTarget}
            onReindex={handleReindex}
            onDownload={handleDownload}
          />
        )}
      </section>

      <DocumentDetails
        document={selectedDocument}
        onClose={closeDrawer}
        onDelete={setDeleteTarget}
        onReindex={handleReindex}
        onIndex={(document) => void handleIndex(document)}
        onRemoveIndex={(document) => void handleRemoveIndex(document)}
        onDownload={handleDownload}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void handleDelete(deleteTarget);
        }}
        title="Delete this document?"
        description={`${
          deleteTarget?.name ?? "This document"
        } will be removed from the knowledge base and its document context will be cleared from conversations. This action cannot be undone.`}
        confirmLabel="Delete document"
      />
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<DocumentsSkeleton />}>
      <DocumentsContent />
    </Suspense>
  );
}
