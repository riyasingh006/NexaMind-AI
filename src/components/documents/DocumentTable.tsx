"use client";

import {
  Download,
  Eye,
  FileText,
  MoreHorizontal,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { Skeleton } from "@/components/ui/Skeleton";
import { DOCUMENT_INDEX_STATE_META, DOCUMENT_STATUS_META } from "@/lib/constants";
import { cn, formatBytes, formatDate, formatNumber } from "@/lib/utils";
import type { Document } from "@/types/document";

const statusTone = {
  success: "success",
  accent: "accent",
  neutral: "neutral",
  danger: "danger",
} as const;

const formatTone = {
  PDF: "text-[#ff9aaa] border-danger/15 bg-danger/[0.055]",
  TXT: "text-cyan border-cyan/15 bg-cyan/[0.055]",
  MD: "text-success border-success/15 bg-success/[0.055]",
};

interface DocumentTableProps {
  documents: Document[];
  loading?: boolean;
  onView: (document: Document) => void;
  onDelete: (document: Document) => void;
  onReindex: (document: Document) => void;
  onDownload: (document: Document) => void;
}

function ActionMenu({
  document,
  onView,
  onDelete,
  onReindex,
  onDownload,
}: {
  document: Document;
} & Omit<DocumentTableProps, "documents" | "loading">) {
  return (
    <Dropdown
      trigger={
        <span className="flex size-7 items-center justify-center rounded-md text-subtle transition hover:bg-white/5 hover:text-foreground">
          <MoreHorizontal className="size-3.5" />
        </span>
      }
      contentClassName="w-44"
      label={`Actions for ${document.name}`}
    >
      {(close) => (
        <>
          <DropdownItem
            icon={<Eye />}
            onClick={() => {
              close();
              onView(document);
            }}
          >
            View details
          </DropdownItem>
          <DropdownItem
            icon={<Download />}
            onClick={() => {
              close();
              onDownload(document);
            }}
          >
            Download extracted text
          </DropdownItem>
          <DropdownItem
            icon={<RefreshCw />}
            disabled={document.status === "processing"}
            onClick={() => {
              close();
              onReindex(document);
            }}
          >
            Re-index document
          </DropdownItem>
          <div className="my-1 h-px bg-line" />
          <DropdownItem
            icon={<Trash2 />}
            danger
            onClick={() => {
              close();
              onDelete(document);
            }}
          >
            Delete document
          </DropdownItem>
        </>
      )}
    </Dropdown>
  );
}

export function DocumentTable({
  documents,
  loading = false,
  onView,
  onDelete,
  onReindex,
  onDownload,
}: DocumentTableProps) {
  if (loading) {
    return (
      <div className="p-4">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-lg border border-line/60 p-3">
              <Skeleton className="size-8 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-2.5 w-1/3" />
                <Skeleton className="h-2 w-1/5" />
              </div>
              <Skeleton className="hidden h-5 w-16 sm:block" />
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[920px] text-left">
          <thead>
            <tr className="border-b border-line text-[9px] uppercase tracking-[0.1em] text-subtle">
              <th className="px-4 py-2.5 font-medium">Document name</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 font-medium">Upload date</th>
              <th className="px-3 py-2.5 font-medium">File size</th>
              <th className="px-3 py-2.5 font-medium">Pipeline</th>
              <th className="px-3 py-2.5 font-medium">Vector index</th>
              <th className="px-3 py-2.5 text-right font-medium">Chunks</th>
              <th className="w-12 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => {
              const meta = DOCUMENT_STATUS_META[document.status];
              const indexMeta = document.indexing
                ? DOCUMENT_INDEX_STATE_META[document.indexing.state]
                : null;
              return (
                <tr
                  key={document.id}
                  className="group border-b border-line/60 text-[11px] transition last:border-0 hover:bg-white/[0.022]"
                >
                  <td className="max-w-[320px] px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onView(document)}
                      className="flex max-w-full items-center gap-2.5 text-left"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-white/[0.03] text-accent-bright/65">
                        <FileText className="size-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[11.5px] font-medium text-foreground/90 transition group-hover:text-foreground">
                          {document.name}
                        </span>
                        <span className="block truncate text-[9px] text-subtle">
                          Uploaded source
                          {document.pages ? ` · ${document.pages} pages` : ""}
                          {document.processingState === "REQUIRES_OCR"
                            ? " · OCR required"
                            : ""}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded border px-1.5 py-0.5 font-mono text-[8.5px] font-medium",
                        formatTone[document.format],
                      )}
                    >
                      {document.format}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-[10px] text-muted">
                    {formatDate(document.uploadedAt, { month: "short", day: "numeric" })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-[9.5px] text-muted">
                    {formatBytes(document.sizeBytes)}
                  </td>
                  <td className="px-3 py-3">
                    <Badge
                      tone={statusTone[meta.tone as keyof typeof statusTone]}
                      dot
                      className={document.status === "processing" ? "animate-pulse" : ""}
                    >
                      {meta.label}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    {indexMeta ? (
                      <div className="flex flex-col gap-1">
                        <Badge
                          tone={statusTone[indexMeta.tone as keyof typeof statusTone]}
                          dot
                        >
                          {indexMeta.label}
                        </Badge>
                        <span className="font-mono text-[8px] text-subtle">
                          {formatNumber(document.indexing?.vectorCount ?? 0)} /{" "}
                          {formatNumber(document.indexing?.totalChunks ?? document.chunks)} vectors
                        </span>
                      </div>
                    ) : (
                      <span className="text-[9.5px] text-subtle">Not tracked</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[9.5px] text-muted">
                    {formatNumber(document.chunks)}
                  </td>
                  <td className="px-2 py-3">
                    <ActionMenu
                      document={document}
                      onView={onView}
                      onDelete={onDelete}
                      onReindex={onReindex}
                      onDownload={onDownload}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 p-3 md:hidden">
        {documents.map((document) => {
          const meta = DOCUMENT_STATUS_META[document.status];
          const indexMeta = document.indexing
            ? DOCUMENT_INDEX_STATE_META[document.indexing.state]
            : null;
          return (
            <div
              key={document.id}
              className="rounded-lg border border-line bg-white/[0.018] p-3"
            >
              <div className="flex items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => onView(document)}
                  className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-white/[0.03] text-accent-bright/65">
                    <FileText className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-medium leading-5 text-foreground">
                      {document.name}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className={cn("rounded border px-1 py-px font-mono text-[8px]", formatTone[document.format])}>
                        {document.format}
                      </span>
                      <Badge tone={statusTone[meta.tone as keyof typeof statusTone]} dot>
                        {meta.label}
                      </Badge>
                      {indexMeta ? (
                        <Badge tone={statusTone[indexMeta.tone as keyof typeof statusTone]} dot>
                          {indexMeta.label}
                        </Badge>
                      ) : null}
                    </span>
                  </span>
                </button>
                <ActionMenu
                  document={document}
                  onView={onView}
                  onDelete={onDelete}
                  onReindex={onReindex}
                  onDownload={onDownload}
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2.5">
                <div>
                  <p className="text-[8px] uppercase tracking-wide text-subtle">Size</p>
                  <p className="mt-0.5 font-mono text-[9px] text-muted">{formatBytes(document.sizeBytes)}</p>
                </div>
                <div>
                  <p className="text-[8px] uppercase tracking-wide text-subtle">Chunks / vectors</p>
                  <p className="mt-0.5 font-mono text-[9px] text-muted">
                    {formatNumber(document.chunks)} /{" "}
                    {formatNumber(document.indexing?.vectorCount ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-[8px] uppercase tracking-wide text-subtle">Uploaded</p>
                  <p className="mt-0.5 text-[9px] text-muted">
                    {formatDate(document.uploadedAt, { month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
