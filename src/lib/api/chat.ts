import { apiRequest } from "@/lib/api/client";
import type {
  AgentMeta,
  ChatMessage,
  Conversation,
  RetrievalMeta,
  Source,
} from "@/types/chat";

export interface ApiChatSource {
  id: string;
  document_id: string;
  document_name: string;
  page: number | null;
  chunk_id: string;
  chunk_index: number;
  section_title: string | null;
  similarity: number;
  excerpt: string;
}

export interface ApiChatMessageMetadata {
  integration_status?: string | null;
  model?: string | null;
  sources_count: number;
  latency_ms?: number | null;
  evidence_status?: string | null;
  validation_status?: string | null;
  query_rewritten?: boolean | null;
  groundedness_status?: string | null;
  groundedness_score?: number | null;
  evidence_coverage_status?: string | null;
  evidence_coverage_score?: number | null;
  document_ids?: string[];
  citations: ApiChatSource[];
}

export interface ApiChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  metadata: ApiChatMessageMetadata;
}

export interface ApiRetrievedChunk {
  id: string;
  document_id: string;
  document_name: string;
  page: number | null;
  chunk_index: number;
  section_title: string | null;
  similarity: number;
  rerank_position: number;
  content: string;
}

export interface ApiRetrievalMetadata {
  rewritten_query: string;
  retrieval_queries: string[];
  duration_ms: number;
  chunks: ApiRetrievedChunk[];
  strategy: string;
}

export interface ApiAgentMetadata {
  query_intent: string;
  evidence_status: string;
  validation_status: string;
  query_rewritten: boolean;
  rewritten_query: string;
  retrieval_queries: string[];
  retrieved_chunk_count: number;
  filtered_chunk_count: number;
  citation_count: number;
  context_token_count: number;
  retry_count: number;
  generation_model: string | null;
  groundedness_status?: string | null;
  groundedness_score?: number | null;
  groundedness_claim_count?: number;
  groundedness_unsupported_claims?: number;
  evidence_coverage_status?: string | null;
  evidence_coverage_score?: number | null;
  latency_ms: number;
}

export interface ApiChatQueryResponse {
  success: true;
  status: string;
  conversation_id: string;
  user_message: ApiChatMessage;
  assistant_message: ApiChatMessage;
  answer: string;
  sources: ApiChatSource[];
  retrieval: ApiRetrievalMetadata;
  agent: ApiAgentMetadata;
  detail: string;
  regenerated_message_id?: string | null;
}

export interface ApiConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  document_ids?: string[];
  messages: ApiChatMessage[];
}

interface ApiConversationList {
  success: true;
  items: ApiConversation[];
  total: number;
  limit: number;
  offset: number;
}

export interface ChatQueryResult {
  conversationId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  sources: Source[];
  retrieval: RetrievalMeta;
  agent: AgentMeta;
  detail: string;
  regeneratedMessageId?: string | null;
}

export function mapSource(source: ApiChatSource): Source {
  return {
    id: source.id,
    documentId: source.document_id,
    documentName: source.document_name,
    page: source.page,
    chunkId: source.chunk_id,
    chunkIndex: source.chunk_index,
    sectionTitle: source.section_title,
    similarity: source.similarity,
    excerpt: source.excerpt,
  };
}

export function mapChatMessage(message: ApiChatMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
    createdAt: message.created_at,
    status: "complete",
    provisional: false,
    sources: (message.metadata.citations ?? []).map(mapSource),
    processingMs: message.metadata.latency_ms ?? undefined,
    evidenceStatus: message.metadata.evidence_status ?? undefined,
    validationStatus: message.metadata.validation_status ?? undefined,
    queryRewritten: message.metadata.query_rewritten ?? undefined,
    isDemo: false,
  };
}

export function mapConversation(conversation: ApiConversation): Conversation {
  const messages = conversation.messages
    .filter((message) => message.role !== "system")
    .map(mapChatMessage);
  const documentIds =
    conversation.document_ids && conversation.document_ids.length > 0
      ? conversation.document_ids
      : Array.from(
          new Set(
            messages.flatMap((message) =>
              (message.sources ?? []).map((source) => source.documentId),
            ),
          ),
        );
  return {
    id: conversation.id,
    title: conversation.title,
    lastActivity: conversation.updated_at,
    documentIds,
    messages,
    isDemo: false,
  };
}

export function mapRetrieval(retrieval: ApiRetrievalMetadata): RetrievalMeta {
  return {
    rewrittenQuery: retrieval.rewritten_query,
    retrievalQueries: retrieval.retrieval_queries,
    durationMs: retrieval.duration_ms,
    strategy: retrieval.strategy,
    chunks: retrieval.chunks.map((chunk) => ({
      id: chunk.id,
      documentId: chunk.document_id,
      documentName: chunk.document_name,
      page: chunk.page,
      chunkIndex: chunk.chunk_index,
      sectionTitle: chunk.section_title,
      similarity: chunk.similarity,
      rerankPosition: chunk.rerank_position,
      content: chunk.content,
    })),
  };
}

export function mapAgent(agent: ApiAgentMetadata): AgentMeta {
  return {
    queryIntent: agent.query_intent,
    evidenceStatus: agent.evidence_status,
    validationStatus: agent.validation_status,
    queryRewritten: agent.query_rewritten,
    rewrittenQuery: agent.rewritten_query,
    retrievalQueries: agent.retrieval_queries,
    retrievedChunkCount: agent.retrieved_chunk_count,
    filteredChunkCount: agent.filtered_chunk_count,
    citationCount: agent.citation_count,
    contextTokenCount: agent.context_token_count,
    retryCount: agent.retry_count,
    generationModel: agent.generation_model,
    groundednessStatus: agent.groundedness_status ?? undefined,
    groundednessScore: agent.groundedness_score ?? undefined,
    groundednessClaimCount: agent.groundedness_claim_count,
    groundednessUnsupportedClaims: agent.groundedness_unsupported_claims,
    evidenceCoverageStatus: agent.evidence_coverage_status ?? undefined,
    evidenceCoverageScore: agent.evidence_coverage_score ?? undefined,
    latencyMs: agent.latency_ms,
  };
}

export async function sendChatQuery(
  prompt: string,
  documentIds: string[],
  conversationId?: string | null,
): Promise<ChatQueryResult> {
  const response = await apiRequest<ApiChatQueryResponse>("/chat/query", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      document_ids: documentIds,
      conversation_id: conversationId ?? undefined,
    }),
  });
  const assistantMessage = {
    ...mapChatMessage(response.assistant_message),
    sources: response.sources.map(mapSource),
    retrieval: mapRetrieval(response.retrieval),
    agent: mapAgent(response.agent),
  };
  return {
    conversationId: response.conversation_id,
    userMessage: mapChatMessage(response.user_message),
    assistantMessage,
    sources: response.sources.map(mapSource),
    retrieval: mapRetrieval(response.retrieval),
    agent: mapAgent(response.agent),
    detail: response.detail,
    regeneratedMessageId: response.regenerated_message_id ?? null,
  };
}

export async function listChatConversations(): Promise<Conversation[]> {
  const response = await apiRequest<ApiConversationList>(
    "/chat/conversations?limit=50&offset=0",
  );
  return response.items.map(mapConversation);
}

export async function renameChatConversation(
  conversationId: string,
  title: string,
): Promise<Conversation> {
  const response = await apiRequest<ApiConversation>(
    `/chat/conversations/${conversationId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ title }),
    },
  );
  return mapConversation(response);
}

export async function clearChatConversation(
  conversationId: string,
): Promise<Conversation> {
  const response = await apiRequest<ApiConversation>(
    `/chat/conversations/${conversationId}/messages`,
    { method: "DELETE" },
  );
  return mapConversation(response);
}

export async function deleteChatConversation(
  conversationId: string,
): Promise<void> {
  await apiRequest<{ success: true }>(
    `/chat/conversations/${conversationId}`,
    { method: "DELETE" },
  );
}

