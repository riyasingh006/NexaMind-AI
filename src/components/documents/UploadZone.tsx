"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { ApiError } from "@/lib/api/client";
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE } from "@/lib/constants";
import { cn, formatBytes, generateId, getFileFormat } from "@/lib/utils";
import type { UploadTask } from "@/types/document";

export function UploadZone() {
  const { uploadDocument } = useAppData();
  const { toast } = useToast();
  const [dragActive, setDragActive] = useState(false);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const updateTask = (id: string, updates: Partial<UploadTask>) => {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...updates } : task)));
  };

  const processFile = async (file: File) => {
    const format = getFileFormat(file.name);
    if (!format) {
      toast({
        title: "Unsupported file type",
        description: `${file.name} was skipped. Upload PDF, TXT or Markdown files only.`,
        tone: "error",
      });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File is too large",
        description: `${file.name} exceeds the 25 MB limit.`,
        tone: "error",
      });
      return;
    }

    const taskId = generateId("upload");
    const task: UploadTask = {
      id: taskId,
      name: file.name,
      sizeBytes: file.size,
      format,
      progress: 0,
      status: "uploading",
    };
    setTasks((current) => [task, ...current]);

    try {
      const document = await uploadDocument(file, (progress) => {
        updateTask(taskId, {
          progress,
          status: progress >= 100 ? "processing" : "uploading",
        });
      });

      updateTask(taskId, { progress: 100 });

      if (document.status === "failed") {
        const message = document.error ?? "The document could not be processed.";
        updateTask(taskId, { status: "error", error: message });
        toast({
          title: document.processingState === "REQUIRES_OCR" ? "OCR required" : "Processing failed",
          description: message,
          tone: "error",
        });
        return;
      }

      updateTask(taskId, { status: "complete" });
      const warning = document.warnings?.find((item) => item.code === "OCR_REQUIRED");
      toast({
        title: "Document indexed",
        description: warning
          ? `${file.name} was indexed, but ${warning.message}`
          : `${file.name} is ready with ${document.chunks} chunks.`,
        tone: warning ? "info" : "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      updateTask(taskId, { status: "error", error: message });
      toast({
        title:
          error instanceof ApiError && error.code === "DUPLICATE_DOCUMENT"
            ? "Document already exists"
            : "Upload failed",
        description: message,
        tone: "error",
      });
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => void processFile(file));
  };

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragActive(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    handleFiles(event.dataTransfer.files);
  };

  const completedCount = tasks.filter((task) => task.status === "complete").length;

  return (
    <div id="upload-zone" className="rounded-xl border border-line bg-surface/70 p-3">
      <div
        onDragEnter={handleDragEnter}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative overflow-hidden rounded-lg border border-dashed p-5 transition-all duration-200 sm:p-6",
          dragActive
            ? "border-accent/60 bg-accent/[0.075]"
            : "border-line-strong bg-white/[0.012] hover:border-white/20 hover:bg-white/[0.02]",
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,125,251,0.055),transparent_70%)]" />
        <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl border transition",
              dragActive
                ? "border-accent/40 bg-accent/15 text-accent-bright"
                : "border-line bg-white/[0.035] text-muted",
            )}
          >
            <UploadCloud className={cn("size-5 transition", dragActive && "scale-110")} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <p className="text-[13px] font-medium text-foreground">
                {dragActive ? "Release to add documents" : "Drop documents here to index them"}
              </p>
              <span className="rounded-full border border-success/15 bg-success/[0.06] px-1.5 py-0.5 font-mono text-[7.5px] uppercase tracking-wide text-success/80">
                Live API
              </span>
            </div>
            <p className="mt-1 text-[10.5px] text-muted">
              PDF, TXT and Markdown · multiple files · up to 25 MB each
            </p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-8.5 shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-white/[0.045] px-3.5 text-[11px] font-medium text-foreground transition hover:border-accent/30 hover:bg-accent-soft"
          >
            Browse files
          </button>
          <input
            ref={inputRef}
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
      </div>

      <AnimatePresence initial={false}>
        {tasks.length > 0 ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2.5 flex items-center justify-between px-1 pt-1">
              <p className="text-[9.5px] text-subtle">
                Upload activity · {completedCount}/{tasks.length} complete
              </p>
              <button
                type="button"
                onClick={() => setTasks([])}
                className="text-[9.5px] text-subtle transition hover:text-foreground"
              >
                Clear activity
              </button>
            </div>
            <div className="mt-2 space-y-1.5">
              {tasks.map((task) => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-3 rounded-lg border border-line bg-[#0b0e18] px-3 py-2"
                >
                  <FileText className="size-3.5 shrink-0 text-accent-bright/60" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[10.5px] font-medium text-foreground/90">{task.name}</p>
                      <span className="shrink-0 font-mono text-[8.5px] text-subtle">
                        {formatBytes(task.sizeBytes)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-200",
                            task.status === "complete"
                              ? "bg-success"
                              : task.status === "processing"
                                ? "bg-accent-bright"
                                : "bg-accent",
                          )}
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                      <span className="flex w-24 items-center justify-end gap-1 text-[8.5px] text-subtle">
                        {task.status === "uploading" ? (
                          <>
                            <Loader2 className="size-2.5 animate-spin" />
                            {task.progress}%
                          </>
                        ) : task.status === "processing" ? (
                          <>
                            <Loader2 className="size-2.5 animate-spin text-accent-bright" />
                            Processing
                          </>
                        ) : task.status === "complete" ? (
                          <>
                            <CheckCircle2 className="size-2.5 text-success" />
                            Indexed
                          </>
                        ) : (
                          <>
                            <AlertCircle className="size-2.5 text-danger" />
                            Failed
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTasks((current) => current.filter((item) => item.id !== task.id))}
                    className="rounded p-1 text-subtle transition hover:bg-white/5 hover:text-foreground"
                    aria-label={`Dismiss ${task.name} upload activity`}
                  >
                    <X className="size-3" />
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
