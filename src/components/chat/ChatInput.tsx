"use client";

import { ArrowUp, FileText, Paperclip, Square, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE } from "@/lib/constants";
import { cn, formatBytes, getFileFormat } from "@/lib/utils";
import type { ChatAttachment } from "@/types/chat";
import type { Document } from "@/types/document";
import { DocumentSelector } from "@/components/chat/DocumentSelector";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isGenerating: boolean;
  documents: Document[];
  selectedDocumentIds: string[];
  onSelectionChange: (ids: string[]) => void;
  attachments: ChatAttachment[];
  onAttachmentsChange: (attachments: ChatAttachment[]) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isGenerating,
  documents,
  selectedDocumentIds,
  onSelectionChange,
  attachments,
  onAttachmentsChange,
  textareaRef,
}: ChatInputProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 156)}px`;
  }, [value, textareaRef]);

  const canSend =
    value.trim().length > 0 && selectedDocumentIds.length > 0 && !isGenerating;

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const next: ChatAttachment[] = [];
    Array.from(files).forEach((file) => {
      const format = getFileFormat(file.name);
      if (!format) {
        toast({
          title: "Unsupported attachment",
          description: `${file.name} was skipped. Attach PDF, TXT or Markdown files only.`,
          tone: "error",
        });
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "Attachment is too large",
          description: `${file.name} exceeds the 25 MB demo limit.`,
          tone: "error",
        });
        return;
      }
      next.push({ name: file.name, size: file.size, format });
    });
    if (next.length > 0) {
      onAttachmentsChange([...attachments, ...next].slice(0, 3));
      toast({
        title: "Attachment staged",
        description: "Attachments are illustrative in Phase 1 and are not parsed.",
        tone: "info",
      });
    }
  };

  return (
    <div className="border-t border-line bg-[#090b14]/85 p-3 backdrop-blur-xl sm:px-5 sm:pb-4">
      <div className="mx-auto max-w-4xl">
        {attachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((attachment) => (
              <span
                key={attachment.name}
                className="flex max-w-[240px] items-center gap-1.5 rounded-md border border-line bg-white/[0.035] px-2 py-1 text-[9px] text-muted"
              >
                <FileText className="size-2.5 shrink-0 text-accent-bright/70" />
                <span className="truncate">{attachment.name}</span>
                <span className="font-mono text-[7.5px] text-subtle">
                  {formatBytes(attachment.size)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onAttachmentsChange(attachments.filter((item) => item.name !== attachment.name))
                  }
                  className="rounded p-0.5 text-subtle hover:bg-white/5 hover:text-foreground"
                  aria-label={`Remove ${attachment.name}`}
                >
                  <X className="size-2.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div
          className={cn(
            "rounded-xl border bg-[#0b0e19] shadow-[0_10px_40px_-20px_rgba(0,0,0,0.7)] transition-colors",
            "border-line-strong focus-within:border-accent/35",
          )}
        >
          <div className="flex items-center gap-2 border-b border-line/70 px-2.5 py-1.5">
            <DocumentSelector
              documents={documents}
              selectedIds={selectedDocumentIds}
              onChange={onSelectionChange}
            />
            <span className="hidden h-3 w-px bg-line sm:block" />
            <span className="hidden items-center gap-1 text-[8.5px] text-subtle sm:flex">
              <span className="size-1 rounded-full bg-warning" />
              Demo retrieval
            </span>
            <span className="ml-auto hidden font-mono text-[7.5px] uppercase tracking-[0.1em] text-subtle/60 sm:block">
              Grounded chat
            </span>
          </div>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (canSend) onSend();
              }
            }}
            rows={1}
            placeholder={
              selectedDocumentIds.length === 0
                ? "Select at least one document source..."
                : "Ask anything about your documents..."
            }
            aria-label="Message DocuMind AI"
            className="block max-h-[156px] min-h-[52px] w-full resize-none bg-transparent px-3.5 py-3 text-[12.5px] leading-5.5 text-foreground outline-none placeholder:text-subtle"
          />

          <div className="flex items-center justify-between gap-2 px-2.5 pb-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex size-7 items-center justify-center rounded-md text-subtle transition hover:bg-white/5 hover:text-foreground"
                aria-label="Attach a file"
              >
                <Paperclip className="size-3.5" />
              </button>
              {value.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onChange("")}
                  className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[8.5px] text-subtle transition hover:bg-white/5 hover:text-foreground"
                >
                  <X className="size-2.5" />
                  Clear
                </button>
              ) : (
                <span className="hidden pl-1 text-[8px] text-subtle/65 sm:block">
                  Enter to send · Shift + Enter for a new line
                </span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_FILE_TYPES}
                className="hidden"
                onChange={(event) => {
                  handleFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              {selectedDocumentIds.length > 0 ? (
                <span className="hidden text-[8px] text-subtle sm:block">
                  {selectedDocumentIds.length === documents.filter((document) => document.status === "indexed").length
                    ? "All sources"
                    : `${selectedDocumentIds.length} source${selectedDocumentIds.length === 1 ? "" : "s"}`}
                </span>
              ) : (
                <span className="hidden text-[8px] text-warning/80 sm:block">No sources selected</span>
              )}
              {isGenerating ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex h-7.5 items-center gap-1.5 rounded-lg border border-danger/25 bg-danger/10 px-2 text-[8.5px] font-medium text-[#ff9aaa] transition hover:bg-danger/15"
                  aria-label="Stop generating"
                >
                  <Square className="size-2.5 fill-current" />
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!canSend}
                  className="flex size-7.5 items-center justify-center rounded-lg bg-accent text-white shadow-[0_6px_16px_-6px_rgba(139,125,251,0.7)] transition hover:bg-[#9b8eff] disabled:bg-white/[0.06] disabled:text-subtle disabled:shadow-none"
                  aria-label="Send message"
                >
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-2 text-center text-[8px] leading-4 text-subtle/60">
          Answers are generated by the LangGraph agent from indexed document evidence. A configured Gemini key is required.
        </p>
      </div>
    </div>
  );
}
