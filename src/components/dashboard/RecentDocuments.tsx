"use client";

import { Eye, FileText, MoreHorizontal, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/PageHeading";
import { DOCUMENT_STATUS_META } from "@/lib/constants";
import { formatDate, formatNumber } from "@/lib/utils";

const statusTones = {
  success: "success",
  accent: "accent",
  neutral: "neutral",
  danger: "danger",
} as const;

export function RecentDocuments() {
  const { documents, documentsLoading, reprocessDocument } = useAppData();
  const { toast } = useToast();
  const router = useRouter();
  const recent = [...documents]
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    .slice(0, 5);

  const reindex = async (id: string, name: string) => {
    toast({
      title: "Re-index started",
      description: `${name} is being processed again.`,
      tone: "info",
    });
    try {
      const document = await reprocessDocument(id);
      if (document.status === "failed") {
        toast({
          title: "Re-index failed",
          description: document.error ?? "The document could not be processed.",
          tone: "error",
        });
        return;
      }
      toast({
        title: "Re-index complete",
        description: `${name} is indexed with ${document.chunks} chunks.`,
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

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface/75">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <div>
          <h2 className="text-[12.5px] font-semibold text-foreground">Recent documents</h2>
          <p className="mt-0.5 text-[10px] text-subtle">Latest additions to the knowledge base</p>
        </div>
        <Link
          href="/dashboard/documents"
          className="rounded-md px-2 py-1 text-[10.5px] font-medium text-accent-bright transition hover:bg-accent-soft"
        >
          View library
        </Link>
      </div>

      {documentsLoading ? (
        <div className="flex items-center gap-2 px-4 py-8 text-[10.5px] text-subtle">
          <RefreshCw className="size-3 animate-spin" />
          Loading documents...
        </div>
      ) : recent.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No documents yet"
          description="Upload a PDF, TXT or Markdown file to start building the knowledge base."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-line text-[9px] uppercase tracking-[0.1em] text-subtle">
                <th className="px-4 py-2.5 font-medium">Document</th>
                <th className="px-3 py-2.5 font-medium">Format</th>
                <th className="px-3 py-2.5 font-medium">Uploaded</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 text-right font-medium">Chunks</th>
                <th className="w-10 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {recent.map((document) => {
                const meta = DOCUMENT_STATUS_META[document.status];
                return (
                  <tr
                    key={document.id}
                    className="group border-b border-line/60 text-[11px] transition last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="max-w-[260px] px-4 py-3">
                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/documents?doc=${document.id}`)}
                        className="flex max-w-full items-center gap-2.5 text-left"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-white/[0.03] text-accent-bright/65">
                          <FileText className="size-3" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground/90 transition group-hover:text-foreground">
                            {document.name}
                          </span>
                          <span className="block text-[9px] text-subtle">
                            {document.pages ? `${document.pages} pages` : "Metadata only"}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-3 text-[10px] text-muted">{document.format}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[10px] text-muted">
                      {formatDate(document.uploadedAt, { month: "short", day: "numeric" })}
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        tone={statusTones[meta.tone as keyof typeof statusTones]}
                        dot
                        className={document.status === "processing" ? "animate-pulse" : ""}
                      >
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[10px] text-muted">
                      {formatNumber(document.chunks)}
                    </td>
                    <td className="px-2 py-3">
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
                                router.push(`/dashboard/documents?doc=${document.id}`);
                              }}
                            >
                              View details
                            </DropdownItem>
                            <DropdownItem
                              icon={<Sparkles />}
                              onClick={() => {
                                close();
                                router.push(`/dashboard/chat?document=${document.id}`);
                              }}
                            >
                              Ask in workspace
                            </DropdownItem>
                            <DropdownItem
                              icon={<RefreshCw />}
                              disabled={document.status === "processing"}
                              onClick={() => {
                                close();
                                void reindex(document.id, document.name);
                              }}
                            >
                              Re-index
                            </DropdownItem>
                          </>
                        )}
                      </Dropdown>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
