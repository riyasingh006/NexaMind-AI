export interface Source {
  id: string;
  documentId: string;
  documentName: string;
  page: number | null;
  chunkId: string;
  chunkIndex?: number;
  sectionTitle?: string | null;
  similarity: number;
  excerpt: string;
}

export interface RetrievedChunk {
  id: string;
  documentId?: string;
  documentName: string;
  page: number | null;
  chunkIndex?: number;
  sectionTitle?: string | null;
  similarity: number;
  rerankPosition: number;
  content: string;
}

export interface RetrievalMeta {
  rewrittenQuery: string;
  retrievalQueries?: string[];
  durationMs: number;
  chunks: RetrievedChunk[];
  strategy: string;
}

export interface AgentMeta {
  queryIntent: string;
  evidenceStatus: string;
  validationStatus: string;
  queryRewritten: boolean;
  rewrittenQuery: string;
  retrievalQueries: string[];
  retrievedChunkCount: number;
  filteredChunkCount: number;
  citationCount: number;
  contextTokenCount: number;
  retryCount: number;
  generationModel: string | null;
  groundednessStatus?: string;
  groundednessScore?: number;
  groundednessClaimCount?: number;
  groundednessUnsupportedClaims?: number;
  evidenceCoverageStatus?: string;
  evidenceCoverageScore?: number;
  latencyMs: number;
}

export type ChatMessageStatus = "streaming" | "complete" | "error" | "cancelled";

export type ChatWorkflowState =
  | "IDLE"
  | "CONNECTING"
  | "ANALYZING"
  | "RETRIEVING"
  | "RERANKING"
  | "GENERATING"
  | "VERIFYING"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export interface ChatStage {
  state: ChatWorkflowState;
  label: string;
  detail?: string;
  retrievalChunkCount?: number;
  rerankEnabled?: boolean;
  rerankMethod?: string;
  coverageStatus?: string;
  coverageScore?: number;
  groundednessStatus?: string;
  groundednessScore?: number;
  retryCount?: number;
}

export interface ChatAttachment {
  name: string;
  size: number;
  format: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  status?: ChatMessageStatus;
  provisional?: boolean;
  stage?: ChatStage;
  sources?: Source[];
  retrieval?: RetrievalMeta;
  agent?: AgentMeta;
  processingMs?: number;
  evidenceStatus?: string;
  validationStatus?: string;
  queryRewritten?: boolean;
  isDemo?: boolean;
  attachments?: ChatAttachment[];
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface Conversation {
  id: string;
  title: string;
  lastActivity: string;
  documentIds: string[];
  messages: ChatMessage[];
  isDemo?: boolean;
}

export interface ChatRequest {
  prompt: string;
  documentIds: string[];
}