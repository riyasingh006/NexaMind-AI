"use client";

import { Check, ChevronDown, FileText, Files, Layers3 } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { cn, formatNumber } from "@/lib/utils";
import type { Document } from "@/types/document";

interface DocumentSelectorProps {
  documents: Document[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function DocumentSelector({ documents, selectedIds, onChange }: DocumentSelectorProps) {
  const indexedDocuments = documents.filter((document) => document.status === "indexed");
  const selectedIndexed = selectedIds.filter((id) =>
    indexedDocuments.some((document) => document.id === id),
  );
  const allSelected =
    indexedDocuments.length > 0 && selectedIndexed.length === indexedDocuments.length;
  const selectedNames = documents
    .filter((document) => selectedIds.includes(document.id))
    .map((document) => document.name);

  const triggerLabel = allSelected
    ? "All documents"
    : selectedNames.length === 0
      ? "Select sources"
      : selectedNames.length === 1
        ? selectedNames[0].replace(/\.[^.]+$/, "")
        : `${selectedNames.length} documents`;

  const toggleAll = () => {
    onChange(allSelected ? [] : indexedDocuments.map((document) => document.id));
  };

  const toggleDocument = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((selectedId) => selectedId !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <Dropdown
      trigger={
        <div
          className={cn(
            "flex h-8.5 max-w-[280px] items-center gap-2 rounded-lg border px-2.5 text-[10.5px] transition",
            allSelected
              ? "border-accent/20 bg-accent-soft text-accent-bright"
              : "border-line-strong bg-white/[0.035] text-muted hover:bg-white/[0.06]",
          )}
        >
          <Layers3 className="size-3.5 shrink-0" />
          <span className="truncate">{triggerLabel}</span>
          {!allSelected && selectedNames.length > 0 ? (
            <span className="rounded bg-white/[0.06] px-1 font-mono text-[8px] text-subtle">
              {selectedNames.length}
            </span>
          ) : null}
          <ChevronDown className="ml-auto size-3 shrink-0 text-subtle" />
        </div>
      }
      align="left"
      label="Select knowledge sources"
      contentClassName="w-[min(340px,calc(100vw-2rem))] p-0"
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <div>
              <p className="text-[11px] font-medium text-foreground">Knowledge sources</p>
              <p className="mt-0.5 text-[9px] text-subtle">
                {selectedIndexed.length} of {indexedDocuments.length} indexed selected
              </p>
            </div>
            <button
              type="button"
              onClick={() => close()}
              className="rounded-md border border-line px-2 py-1 text-[9px] font-medium text-muted transition hover:bg-white/5 hover:text-foreground"
            >
              Done
            </button>
          </div>
          <div className="max-h-[300px] overflow-y-auto p-1.5">
            <button
              type="button"
              onClick={toggleAll}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.04]"
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded border transition",
                  allSelected
                    ? "border-accent bg-accent text-white"
                    : "border-line-strong bg-transparent text-transparent",
                )}
              >
                <Check className="size-2.5" />
              </span>
              <Files className="size-3.5 text-subtle" />
              <span className="flex-1">
                <span className="block text-[10.5px] font-medium text-foreground">All documents</span>
                <span className="block text-[8.5px] text-subtle">
                  Query every indexed source
                </span>
              </span>
              <span className="font-mono text-[8px] text-subtle">{indexedDocuments.length}</span>
            </button>

            <div className="my-1 h-px bg-line" />

            {documents.map((document) => {
              const selected = selectedIds.includes(document.id);
              const disabled = document.status !== "indexed";
              return (
                <button
                  key={document.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleDocument(document.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border transition",
                      selected
                        ? "border-accent bg-accent text-white"
                        : "border-line-strong bg-transparent text-transparent",
                    )}
                  >
                    <Check className="size-2.5" />
                  </span>
                  <FileText className="size-3.5 shrink-0 text-subtle" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10.5px] text-foreground/90">
                      {document.name}
                    </span>
                    <span className="block font-mono text-[8px] text-subtle">
                      {document.format} · {formatNumber(document.chunks)} chunks
                      {disabled ? " · unavailable" : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-line px-3 py-2 text-[8px] leading-4 text-subtle">
            Select one, several, or all indexed documents. Demo retrieval uses local mock chunks.
          </div>
        </>
      )}
    </Dropdown>
  );
}
