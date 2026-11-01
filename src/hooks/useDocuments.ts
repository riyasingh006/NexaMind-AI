"use client";

import { useMemo } from "react";
import { useAppData } from "@/components/providers/AppDataProvider";
import type { Document, DocumentFilter } from "@/types/document";

export function useDocuments() {
  const {
    documents,
    documentsLoading,
    documentsError,
    refreshDocuments,
    uploadDocument,
    reprocessDocument,
    indexDocument,
    deleteDocumentIndex,
    deleteDocument,
  } = useAppData();

  const stats = useMemo(
    () => ({
      total: documents.length,
      indexed: documents.filter((document) => document.status === "indexed").length,
      processing: documents.filter((document) => document.status === "processing").length,
      failed: documents.filter((document) => document.status === "failed").length,
      chunks: documents.reduce((sum, document) => sum + document.chunks, 0),
    }),
    [documents],
  );

  return {
    documents,
    documentsLoading,
    documentsError,
    stats,
    refreshDocuments,
    uploadDocument,
    reprocessDocument,
    indexDocument,
    deleteDocumentIndex,
    deleteDocument,
  };
}

export function filterDocuments(
  documents: Document[],
  filter: DocumentFilter,
  query: string,
): Document[] {
  const normalizedQuery = query.trim().toLowerCase();
  return documents.filter((document) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      document.name.toLowerCase().includes(normalizedQuery) ||
      document.preview.toLowerCase().includes(normalizedQuery);
    if (!matchesQuery) return false;
    if (filter === "all") return true;
    if (filter === "PDF" || filter === "TXT" || filter === "MD") {
      return document.format === filter;
    }
    if (filter === "indexed") return document.status === "indexed";
    if (filter === "processing") {
      return document.status === "processing" || document.status === "queued";
    }
    if (filter === "failed") return document.status === "failed";
    return true;
  });
}
