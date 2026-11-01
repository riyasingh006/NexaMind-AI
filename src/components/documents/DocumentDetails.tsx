"use client";

import {
  AlertTriangle,
  CalendarDays,
  Check,
  Copy,
  Database,
  Download,
  Eraser,
  FileText,
  Hash,
  Layers3,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import type { ApiDocumentContent } from "@/lib/api/documents";
import {
  DOCUMENT_INDEX_STATE_META,
  DOCUMENT_PROCESSING_STATE_META,
  DOCUMENT_STATUS_META,
} from "@/lib/constants";
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatNumber,
} from "@/lib/utils";
import type { Document } from "@/types/document";

const statusTone = {
  success: "success",
  accent: "accent",
  neutral: "neutral",
  danger: "danger",
} as const;

interface DocumentDetailsProps {
  document: Document | null;
  onClose: () => void;
  onDelete: (document: Document) => void;
  onReindex: (document: Document) => void;
  onIndex: (document: Document) => void;
  onRemoveIndex: (document: Document) => void;
  onDownload: (document: Document) => void;
}

export function DocumentDetails({
  document,
  onClose,
  onDelete,
  onReindex,
  onIndex,
  onRemoveIndex,
  onDownload,
}: DocumentDetailsProps) {
  const { getDocumentContent } = useAppData();
  const [copied, setCopied] = useState(false);
  const [content, setContent] = useState<ApiDocumentContent | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const documentId = document?.id;
  const documentStatus = document?.status;

  useEffect(() => {
    if (!documentId || documentStatus !== "indexed") {
      setContent(null);
      setContentError(null);
      setContentLoading(false);
      return;
    }

    let cancelled = false;
    setContentLoading(true);
    setContentError(null);

    getDocumentContent(documentId)
      .then((result) => {
        if (!cancelled) setContent(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setContentError(
            error instanceof Error ? error.message : "Extracted content is unavailable.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId, documentStatus, getDocumentContent]);

  if (!document) return null;
  const meta = DOCUMENT_STATUS_META[document.status];
  const stateMeta = document.processingState
    ? DOCUMENT_PROCESSING_STATE_META[document.processingState]
    : null;
  const indexing = document.indexing;
  const indexMeta = indexing ? DOCUMENT_INDEX_STATE_META[indexing.state] : null;
  const indexBusy =
    indexing?.state === "EMBEDDING" || indexing?.state === "VECTOR_INDEXING";
  const canIndex = document.status === "indexed" && document.chunks > 0;
  const hasVectors = (indexing?.vectorCount ?? 0) > 0;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(document.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Drawer
      open={Boolean(document)}
      onClose={onClose}
      title={document.name}
      description={`${document.format} document · ${formatBytes(document.sizeBytes)}`}
    >
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone[meta.tone as keyof typeof statusTone]} dot>
            {meta.label}
          </Badge>
          <span className="rounded border border-line bg-white/[0.025] px-1.5 py-0.5 font-mono text-[8.5px] text-muted">
            {document.format}
          </span>
          {stateMeta ? (
            <span className="rounded-full border border-line bg-white/[0.025] px-1.5 py-0.5 text-[8.5px] text-muted">
              {stateMeta.label}
            </span>
          ) : null}
          {indexMeta ? (
            <Badge
              tone={statusTone[indexMeta.tone as keyof typeof statusTone]}
              dot
              className={indexBusy ? "animate-pulse" : ""}
            >
              {indexMeta.label}
            </Badge>
          ) : null}
        </div>

        {document.status === "failed" && document.error ? (
          <div className="mt-4 rounded-lg border border-danger/20 bg-danger/[0.06] p-3">
            <p className="text-[10.5px] font-medium text-[#ff9aaa]">
              {document.processingState === "REQUIRES_OCR"
                ? "OCR required"
                : "Processing failed"}
            </p>
            <p className="mt-1 text-[10px] leading-4.5 text-muted">{document.error}</p>
          </div>
        ) : null}

        {indexing?.error ? (
          <div className="mt-4 rounded-lg border border-danger/20 bg-danger/[0.06] p-3">
            <p className="text-[10.5px] font-medium text-[#ff9aaa]">
              {indexing.state === "NOT_CONFIGURED"
                ? "Embeddings unavailable"
                : "Vector indexing failed"}
            </p>
            <p className="mt-1 text-[10px] leading-4.5 text-muted">
              {indexing.error.message}
            </p>
          </div>
        ) : null}

        {document.warnings && document.warnings.length > 0 ? (
          <div className="mt-3 rounded-lg border border-warning/20 bg-warning/[0.05] p-3">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="size-3 text-warning" />
              <p className="text-[10.5px] font-medium text-warning">Processing warnings</p>
            </div>
            <ul className="mt-1.5 space-y-1">
              {document.warnings.map((warning) => (
                <li
                  key={`${warning.code}-${warning.pageNumber ?? "document"}-${warning.message}`}
                  className="text-[10px] leading-4 text-muted"
                >
                  {warning.pageNumber ? `Page ${warning.pageNumber}: ` : ""}
                  {warning.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-line bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-subtle">
              <Layers3 className="size-3" />
              <span className="text-[8.5px] uppercase tracking-[0.1em]">Chunks</span>
            </div>
            <p className="mt-1.5 font-mono text-[15px] text-foreground">{formatNumber(document.chunks)}</p>
          </div>
          <div className="rounded-lg border border-line bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-subtle">
              <FileText className="size-3" />
              <span className="text-[8.5px] uppercase tracking-[0.1em]">Pages</span>
            </div>
            <p className="mt-1.5 font-mono text-[15px] text-foreground">
              {document.pages ?? "—"}
            </p>
          </div>
          <div className="rounded-lg border border-line bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-subtle">
              <CalendarDays className="size-3" />
              <span className="text-[8.5px] uppercase tracking-[0.1em]">Uploaded</span>
            </div>
            <p className="mt-1.5 text-[10.5px] text-foreground">
              {formatDateTime(document.uploadedAt)}
            </p>
          </div>
          <div className="rounded-lg border border-line bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-subtle">
              <Hash className="size-3" />
              <span className="text-[8.5px] uppercase tracking-[0.1em]">File size</span>
            </div>
            <p className="mt-1.5 font-mono text-[10.5px] text-foreground">
              {formatBytes(document.sizeBytes)}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-line bg-white/[0.02] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-subtle">
              <Database className="size-3" />
              <span className="text-[8.5px] uppercase tracking-[0.1em]">Vector index</span>
            </div>
            <span className="font-mono text-[8.5px] text-muted">
              {formatNumber(indexing?.vectorCount ?? 0)} vectors
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <p className="text-[8px] uppercase tracking-wide text-subtle">Chunks</p>
              <p className="mt-0.5 font-mono text-[10px] text-foreground">
                {formatNumber(indexing?.totalChunks ?? document.chunks)}
              </p>
            </div>
            <div>
              <p className="text-[8px] uppercase tracking-wide text-subtle">Embedded</p>
              <p className="mt-0.5 font-mono text-[10px] text-foreground">
                {formatNumber(indexing?.embeddedChunks ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-[8px] uppercase tracking-wide text-subtle">Indexed</p>
              <p className="mt-0.5 font-mono text-[10px] text-foreground">
                {formatNumber(indexing?.vectorCount ?? 0)}
              </p>
            </div>
          </div>
          <p className="mt-2 break-all text-[8.5px] leading-4 text-subtle">
            {indexing?.embeddingModel
              ? `${indexing.embeddingModel} / ${indexing.embeddingDimension ?? "?"} dimensions`
              : "No embedding model has processed this document yet."}
            {indexing?.indexVersion ? ` / index ${indexing.indexVersion}` : ""}
          </p>
        </div>

        <div className="mt-3 rounded-lg border border-line bg-white/[0.02] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8.5px] uppercase tracking-[0.1em] text-subtle">Document ID</span>
            <button
              type="button"
              onClick={copyId}
              className="flex items-center gap-1 text-[8.5px] text-subtle transition hover:text-foreground"
            >
              {copied ? <Check className="size-2.5 text-success" /> : <Copy className="size-2.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-1.5 break-all font-mono text-[10px] text-muted">{document.id}</p>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-subtle">
          {document.indexedAt ? (
            <span>Processed {formatDateTime(document.indexedAt)}</span>
          ) : null}
          {stateMeta ? <span>State: {stateMeta.label}</span> : null}
          {document.chunkingStrategy ? (
            <span>Strategy: {document.chunkingStrategy}</span>
          ) : null}
          {typeof document.totalCharacters === "number" ? (
            <span>{formatNumber(document.totalCharacters)} characters</span>
          ) : null}
          {typeof document.processingDurationMs === "number" ? (
            <span>{formatDuration(document.processingDurationMs)}</span>
          ) : null}
          {indexing?.completedAt ? (
            <span>Vectors {formatDateTime(indexing.completedAt)}</span>
          ) : null}
          {typeof indexing?.durationMs === "number" ? (
            <span>Embedding {formatDuration(indexing.durationMs)}</span>
          ) : null}
          {indexing?.stage ? <span>Vector stage: {indexing.stage}</span> : null}
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-[11px] font-medium text-foreground">Extracted content preview</h3>
            <span className="rounded border border-line bg-white/[0.02] px-1.5 py-0.5 font-mono text-[7.5px] uppercase tracking-wide text-subtle">
              Backend extraction
            </span>
          </div>
          <div className="max-h-[300px] overflow-y-auto rounded-xl border border-line bg-[#090b13] p-4">
            {contentLoading ? (
              <span className="flex items-center gap-2 text-[10.5px] text-subtle">
                <Loader2 className="size-3 animate-spin" />
                Loading extracted content...
              </span>
            ) : contentError ? (
              <p className="text-[10.5px] leading-5 text-[#ff9aaa]">{contentError}</p>
            ) : (
              <p className="whitespace-pre-wrap text-[11px] leading-[1.85] text-muted">
                {content?.content || document.preview || "No extracted text is available."}
              </p>
            )}
          </div>
          {content?.truncated ? (
            <p className="mt-2 text-[9px] leading-4 text-warning">
              Preview truncated at the backend content limit. Download the extracted text for the
              full available content.
            </p>
          ) : (
            <p className="mt-2 text-[9px] leading-4 text-subtle">
              Text is extracted from the stored source file by the backend processing pipeline.
            </p>
          )}
        </div>

        <div className="mt-6 space-y-2">
          <Link
            href={`/dashboard/chat?document=${document.id}`}
            className="flex h-9.5 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[11.5px] font-medium text-white transition hover:bg-[#9b8eff]"
          >
            <Sparkles className="size-3.5" />
            Ask questions about this document
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onDownload(document)}
              className="h-9.5"
            >
              <Download className="size-3.5" />
              Download
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onReindex(document)}
              disabled={document.status === "processing"}
              className="h-9.5"
            >
              <RefreshCw className="size-3.5" />
              Reprocess chunks
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="soft"
              size="sm"
              onClick={() => onIndex(document)}
              disabled={!canIndex || indexBusy}
              loading={indexBusy}
              className="h-9.5"
            >
              <Database className="size-3.5" />
              {hasVectors ? "Reindex vectors" : "Index vectors"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onRemoveIndex(document)}
              disabled={!hasVectors || indexBusy}
              className="h-9.5"
            >
              <Eraser className="size-3.5" />
              Remove vectors
            </Button>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onDelete(document)}
            className="h-9.5 w-full"
          >
            <Trash2 className="size-3.5" />
            Delete document
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
