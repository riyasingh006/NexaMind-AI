import { API_BASE_URL, ApiError, apiErrorFromPayload, apiRequest } from "@/lib/api/client";
import type {
  Document,
  DocumentIndexState,
  DocumentIndexingInfo,
  DocumentProcessingState,
  DocumentWarning,
} from "@/types/document";

export interface ApiProcessingWarning {
  code: string;
  message: string;
  page_number?: number | null;
}

export interface ApiProcessingFailure {
  code: string;
  message: string;
  stage: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
}

export interface ApiDocumentMetadata {
  content_type?: string | null;
  extension: string;
  storage_backend: "local";
  checksum_sha256?: string | null;
  page_count?: number | null;
  total_characters: number;
  preview?: string | null;
}

export interface ApiDocumentIndexing {
  state: DocumentIndexState;
  stage: string;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number | null;
  total_chunks: number;
  embedded_chunks: number;
  vector_count: number;
  embedding_model?: string | null;
  embedding_dimension?: number | null;
  index_version?: string | null;
  error?: ApiProcessingFailure | null;
}

export interface ApiDocument {
  id: string;
  filename: string;
  original_filename: string;
  file_type: Document["format"];
  file_size: number;
  status: Document["status"];
  upload_timestamp: string;
  updated_timestamp: string;
  total_chunks: number;
  metadata: ApiDocumentMetadata;
  processing_state?: DocumentProcessingState | null;
  processing_stage?: string | null;
  page_count?: number | null;
  total_characters: number;
  processing_duration_ms?: number | null;
  chunking_strategy?: string | null;
  indexing?: ApiDocumentIndexing | null;
  warnings: ApiProcessingWarning[];
  error?: ApiProcessingFailure | null;
}

export interface ApiDocumentIndexStatus {
  success: true;
  document_id: string;
  status: DocumentIndexState;
  stage?: string | null;
  total_chunks: number;
  embedded_chunks: number;
  vector_count: number;
  embedding_model?: string | null;
  embedding_dimension?: number | null;
  indexed_at?: string | null;
  duration_ms?: number | null;
  index_version?: string | null;
  error?: ApiProcessingFailure | null;
}

interface ApiDocumentList {
  success: true;
  items: ApiDocument[];
  total: number;
  limit: number;
  offset: number;
}

interface ApiDocumentUpload {
  success: true;
  document: ApiDocument;
  processing_state?: DocumentProcessingState | null;
  warnings: ApiProcessingWarning[];
  error?: ApiProcessingFailure | null;
}

interface ApiDocumentReprocess {
  success: true;
  document: ApiDocument;
}

interface ApiDocumentIndex {
  success: true;
  document: ApiDocument;
  indexing: ApiDocumentIndexing;
}

interface ApiDocumentIndexDelete {
  success: true;
  message: string;
  document_id: string;
  vector_count: number;
  index_version?: string | null;
}

export interface ApiDocumentContent {
  success: true;
  document_id: string;
  filename: string;
  content_type: "text/plain";
  content: string;
  truncated: boolean;
  total_characters: number;
  page_count?: number | null;
  chunking_strategy?: string | null;
  warnings: ApiProcessingWarning[];
}

interface ApiDocumentDelete {
  success: true;
  message: string;
  document_id: string;
}

function mapWarning(warning: ApiProcessingWarning): DocumentWarning {
  return {
    code: warning.code,
    message: warning.message,
    pageNumber: warning.page_number ?? undefined,
  };
}

function mapIndexing(raw: ApiDocumentIndexing): DocumentIndexingInfo {
  return {
    state: raw.state,
    stage: raw.stage,
    startedAt: raw.started_at ?? undefined,
    completedAt: raw.completed_at ?? undefined,
    durationMs: raw.duration_ms ?? undefined,
    totalChunks: raw.total_chunks,
    embeddedChunks: raw.embedded_chunks,
    vectorCount: raw.vector_count,
    embeddingModel: raw.embedding_model ?? undefined,
    embeddingDimension: raw.embedding_dimension ?? undefined,
    indexVersion: raw.index_version ?? undefined,
    error: raw.error
      ? {
          code: raw.error.code,
          message: raw.error.message,
          retryable: raw.error.retryable,
        }
      : undefined,
  };
}

export function mapDocument(raw: ApiDocument): Document {
  return {
    id: raw.id,
    name: raw.original_filename,
    format: raw.file_type,
    sizeBytes: raw.file_size,
    uploadedAt: raw.upload_timestamp,
    status: raw.status,
    chunks: raw.total_chunks,
    pages: raw.page_count ?? undefined,
    indexedAt: raw.status === "indexed" ? raw.updated_timestamp : undefined,
    error: raw.error?.message,
    errorCode: raw.error?.code,
    processingState: raw.processing_state ?? undefined,
    processingStage: raw.processing_stage ?? undefined,
    totalCharacters: raw.total_characters,
    processingDurationMs: raw.processing_duration_ms ?? undefined,
    chunkingStrategy: raw.chunking_strategy ?? undefined,
    indexing: raw.indexing ? mapIndexing(raw.indexing) : undefined,
    warnings: raw.warnings.map(mapWarning),
    preview: raw.metadata.preview ?? "",
  };
}

export async function listDocuments(limit = 100): Promise<Document[]> {
  const response = await apiRequest<ApiDocumentList>(
    `/documents?limit=${encodeURIComponent(limit)}&offset=0`,
  );
  return response.items.map(mapDocument);
}

export async function getDocument(id: string): Promise<Document> {
  return mapDocument(await apiRequest<ApiDocument>(`/documents/${id}`));
}

export function uploadDocumentFile(
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<Document> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    const abort = () => request.abort();
    signal?.addEventListener("abort", abort, { once: true });

    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
    };

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    });

    request.addEventListener("load", () => {
      cleanup();
      let payload: unknown;
      try {
        payload = request.responseText ? JSON.parse(request.responseText) : undefined;
      } catch {
        payload = undefined;
      }

      if (request.status < 200 || request.status >= 300) {
        reject(apiErrorFromPayload(payload, request.status, "Upload failed"));
        return;
      }

      const response = payload as ApiDocumentUpload | undefined;
      if (!response?.document) {
        reject(
          new ApiError("The upload response was invalid", {
            status: request.status,
            code: "INVALID_RESPONSE",
          }),
        );
        return;
      }

      resolve(mapDocument(response.document));
    });

    request.addEventListener("error", () => {
      cleanup();
      reject(
        new ApiError("Unable to reach the DocuMind API", {
          status: 0,
          code: "NETWORK_ERROR",
        }),
      );
    });

    request.addEventListener("abort", () => {
      cleanup();
      reject(new ApiError("Upload cancelled", { status: 0, code: "UPLOAD_CANCELLED" }));
    });

    request.open("POST", `${API_BASE_URL}/documents/upload`);
    request.send(formData);
  });
}

export async function reprocessDocument(id: string): Promise<Document> {
  const response = await apiRequest<ApiDocumentReprocess>(
    `/documents/${id}/reprocess`,
    { method: "POST" },
  );
  return mapDocument(response.document);
}

export async function indexDocument(id: string, force = false): Promise<Document> {
  const response = await apiRequest<ApiDocumentIndex>(
    `/documents/${id}/index${force ? "?force=true" : ""}`,
    { method: "POST" },
  );
  return mapDocument(response.document);
}

export async function getDocumentIndexStatus(id: string): Promise<ApiDocumentIndexStatus> {
  return apiRequest<ApiDocumentIndexStatus>(`/documents/${id}/index/status`);
}

export async function deleteDocumentIndex(id: string): Promise<void> {
  await apiRequest<ApiDocumentIndexDelete>(`/documents/${id}/index`, {
    method: "DELETE",
  });
}

export async function deleteDocument(id: string): Promise<void> {
  await apiRequest<ApiDocumentDelete>(`/documents/${id}`, { method: "DELETE" });
}

export async function getDocumentContent(id: string): Promise<ApiDocumentContent> {
  return apiRequest<ApiDocumentContent>(`/documents/${id}/content`);
}
