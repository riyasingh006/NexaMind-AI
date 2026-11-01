export type DocumentStatus = "indexed" | "processing" | "queued" | "failed";
export type DocumentFormat = "PDF" | "TXT" | "MD";
export type DocumentProcessingState =
  | "UPLOADED"
  | "VALIDATING"
  | "EXTRACTING"
  | "PREPROCESSING"
  | "CHUNKING"
  | "EMBEDDING"
  | "VECTOR_INDEXING"
  | "COMPLETED"
  | "FAILED"
  | "REQUIRES_OCR";

export type DocumentIndexState =
  | "NOT_CONFIGURED"
  | "NOT_INDEXED"
  | "EMBEDDING"
  | "VECTOR_INDEXING"
  | "INDEXED"
  | "FAILED"
  | "STALE";

export interface DocumentIndexingInfo {
  state: DocumentIndexState;
  stage: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  totalChunks: number;
  embeddedChunks: number;
  vectorCount: number;
  embeddingModel?: string;
  embeddingDimension?: number;
  indexVersion?: string;
  error?: { code: string; message: string; retryable?: boolean };
}

export interface DocumentWarning {
  code: string;
  message: string;
  pageNumber?: number;
}

export interface Document {
  id: string;
  name: string;
  format: DocumentFormat;
  sizeBytes: number;
  uploadedAt: string;
  status: DocumentStatus;
  chunks: number;
  preview: string;
  pages?: number;
  indexedAt?: string;
  error?: string;
  errorCode?: string;
  isDemo?: boolean;
  processingState?: DocumentProcessingState;
  processingStage?: string;
  totalCharacters?: number;
  processingDurationMs?: number;
  chunkingStrategy?: string;
  indexing?: DocumentIndexingInfo;
  warnings?: DocumentWarning[];
}

export type DocumentFilter =
  | "all"
  | "PDF"
  | "TXT"
  | "MD"
  | "indexed"
  | "processing"
  | "failed";

export interface UploadTask {
  id: string;
  name: string;
  sizeBytes: number;
  format: DocumentFormat;
  progress: number;
  status: "uploading" | "processing" | "complete" | "error";
  error?: string;
}
