import { apiRequest } from "@/lib/api/client";

export type EmbeddingState =
  | "NOT_CONFIGURED"
  | "PENDING"
  | "PROCESSING"
  | "READY"
  | "DEGRADED"
  | "UNAVAILABLE"
  | "FAILED";

export type VectorIndexState =
  | "INITIALIZING"
  | "READY"
  | "DEGRADED"
  | "UNAVAILABLE"
  | "FAILED";

export type ModelStatus =
  | "OPERATIONAL"
  | "NOT_CONFIGURED"
  | "PROCESSING"
  | "AWAITING_INTEGRATION"
  | "NOT_IMPLEMENTED"
  | "DEGRADED"
  | "UNAVAILABLE";

interface ApiEmbeddingStatus {
  success: true;
  status: EmbeddingState;
  configured: boolean;
  model: string;
  dimension: number;
  batch_size: number;
  total_chunks: number;
  embedded_chunks: number;
  pending_chunks: number;
  failed_chunks: number;
  documents_indexed: number;
  last_embedded_at?: string | null;
  detail: string;
}

interface ApiVectorIndexStatus {
  success: true;
  status: VectorIndexState;
  model: string;
  dimension: number;
  metric: "cosine";
  vector_count: number;
  indexed_documents: number;
  storage_path: string;
  version?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  recovered: boolean;
  detail: string;
}

interface ApiVectorSearchResult {
  chunk_id: string;
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
  page_number?: number | null;
  section_title?: string | null;
  section_hierarchy: string[];
  score: number;
  rank: number;
}

interface ApiVectorSearchResponse {
  success: true;
  query: string;
  embedding_model: string;
  embedding_dimension: number;
  top_k: number;
  threshold: number;
  document_ids: string[];
  results: ApiVectorSearchResult[];
  result_count: number;
  index_version?: string | null;
  processing_time_ms: number;
}

interface ApiVectorStatistics {
  success: true;
  total_documents: number;
  documents_with_chunks: number;
  documents_indexed: number;
  total_chunks: number;
  embedded_chunks: number;
  pending_chunks: number;
  failed_chunks: number;
  vector_count: number;
  embedding_model: string;
  embedding_dimension: number;
  index_status: VectorIndexState;
  index_version?: string | null;
  index_updated_at?: string | null;
  storage_bytes: number;
  model_status: ModelStatus;
}

interface ApiVectorIndexRebuild {
  success: true;
  status: VectorIndexState;
  documents_processed: number;
  documents_failed: number;
  embedded_chunks: number;
  vector_count: number;
  index_version?: string | null;
  duration_ms: number;
  errors: Record<string, unknown>[];
}

export interface EmbeddingStatus {
  status: EmbeddingState;
  configured: boolean;
  model: string;
  dimension: number;
  batchSize: number;
  totalChunks: number;
  embeddedChunks: number;
  pendingChunks: number;
  failedChunks: number;
  documentsIndexed: number;
  lastEmbeddedAt?: string;
  detail: string;
}

export interface VectorIndexStatus {
  status: VectorIndexState;
  model: string;
  dimension: number;
  metric: "cosine";
  vectorCount: number;
  indexedDocuments: number;
  storagePath: string;
  version?: string;
  createdAt?: string;
  updatedAt?: string;
  recovered: boolean;
  detail: string;
}

export interface VectorSearchResult {
  chunkId: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  pageNumber?: number;
  sectionTitle?: string;
  sectionHierarchy: string[];
  score: number;
  rank: number;
}

export interface VectorSearchResponse {
  query: string;
  embeddingModel: string;
  embeddingDimension: number;
  topK: number;
  threshold: number;
  documentIds: string[];
  results: VectorSearchResult[];
  resultCount: number;
  indexVersion?: string;
  processingTimeMs: number;
}

export interface VectorStatistics {
  totalDocuments: number;
  documentsWithChunks: number;
  documentsIndexed: number;
  totalChunks: number;
  embeddedChunks: number;
  pendingChunks: number;
  failedChunks: number;
  vectorCount: number;
  embeddingModel: string;
  embeddingDimension: number;
  indexStatus: VectorIndexState;
  indexVersion?: string;
  indexUpdatedAt?: string;
  storageBytes: number;
  modelStatus: ModelStatus;
}

export interface VectorIndexRebuildResult {
  status: VectorIndexState;
  documentsProcessed: number;
  documentsFailed: number;
  embeddedChunks: number;
  vectorCount: number;
  indexVersion?: string;
  durationMs: number;
  errors: Record<string, unknown>[];
}

export interface VectorSearchInput {
  query: string;
  documentIds?: string[];
  topK?: number;
  threshold?: number;
}

export async function getEmbeddingStatus(): Promise<EmbeddingStatus> {
  const response = await apiRequest<ApiEmbeddingStatus>("/embeddings/status");
  return {
    status: response.status,
    configured: response.configured,
    model: response.model,
    dimension: response.dimension,
    batchSize: response.batch_size,
    totalChunks: response.total_chunks,
    embeddedChunks: response.embedded_chunks,
    pendingChunks: response.pending_chunks,
    failedChunks: response.failed_chunks,
    documentsIndexed: response.documents_indexed,
    lastEmbeddedAt: response.last_embedded_at ?? undefined,
    detail: response.detail,
  };
}

export async function getVectorIndexStatus(): Promise<VectorIndexStatus> {
  const response = await apiRequest<ApiVectorIndexStatus>("/vectors/index/status");
  return {
    status: response.status,
    model: response.model,
    dimension: response.dimension,
    metric: response.metric,
    vectorCount: response.vector_count,
    indexedDocuments: response.indexed_documents,
    storagePath: response.storage_path,
    version: response.version ?? undefined,
    createdAt: response.created_at ?? undefined,
    updatedAt: response.updated_at ?? undefined,
    recovered: response.recovered,
    detail: response.detail,
  };
}

export async function getVectorStatistics(): Promise<VectorStatistics> {
  const response = await apiRequest<ApiVectorStatistics>("/vectors/statistics");
  return {
    totalDocuments: response.total_documents,
    documentsWithChunks: response.documents_with_chunks,
    documentsIndexed: response.documents_indexed,
    totalChunks: response.total_chunks,
    embeddedChunks: response.embedded_chunks,
    pendingChunks: response.pending_chunks,
    failedChunks: response.failed_chunks,
    vectorCount: response.vector_count,
    embeddingModel: response.embedding_model,
    embeddingDimension: response.embedding_dimension,
    indexStatus: response.index_status,
    indexVersion: response.index_version ?? undefined,
    indexUpdatedAt: response.index_updated_at ?? undefined,
    storageBytes: response.storage_bytes,
    modelStatus: response.model_status,
  };
}

export async function searchVectors(
  input: VectorSearchInput,
): Promise<VectorSearchResponse> {
  const response = await apiRequest<ApiVectorSearchResponse>("/vectors/search", {
    method: "POST",
    body: JSON.stringify({
      query: input.query,
      document_ids: input.documentIds ?? [],
      top_k: input.topK,
      threshold: input.threshold,
    }),
  });
  return {
    query: response.query,
    embeddingModel: response.embedding_model,
    embeddingDimension: response.embedding_dimension,
    topK: response.top_k,
    threshold: response.threshold,
    documentIds: response.document_ids,
    results: response.results.map((result) => ({
      chunkId: result.chunk_id,
      documentId: result.document_id,
      documentName: result.document_name,
      chunkIndex: result.chunk_index,
      content: result.content,
      pageNumber: result.page_number ?? undefined,
      sectionTitle: result.section_title ?? undefined,
      sectionHierarchy: result.section_hierarchy,
      score: result.score,
      rank: result.rank,
    })),
    resultCount: response.result_count,
    indexVersion: response.index_version ?? undefined,
    processingTimeMs: response.processing_time_ms,
  };
}

export async function rebuildVectorIndex(
  documentIds: string[] = [],
): Promise<VectorIndexRebuildResult> {
  const response = await apiRequest<ApiVectorIndexRebuild>("/vectors/index/rebuild", {
    method: "POST",
    body: JSON.stringify({ document_ids: documentIds }),
  });
  return {
    status: response.status,
    documentsProcessed: response.documents_processed,
    documentsFailed: response.documents_failed,
    embeddedChunks: response.embedded_chunks,
    vectorCount: response.vector_count,
    indexVersion: response.index_version ?? undefined,
    durationMs: response.duration_ms,
    errors: response.errors,
  };
}

export interface RetrievalInspectInput {
  query: string;
  queries?: string[];
  documentIds?: string[];
  topK?: number;
  threshold?: number;
  rerankTopK?: number;
  finalTopK?: number;
}

export interface RetrievalInspectorSettings {
  topK: number;
  similarityThreshold: number;
  hybridSearchEnabled: boolean;
  semanticWeight: number;
  lexicalWeight: number;
  rrfWeight: number;
  rrfK: number;
  rerankingEnabled: boolean;
  rerankTopK: number;
  finalTopK: number;
  neighborExpansionEnabled: boolean;
  embeddingModel: string;
  embeddingDimension: number;
}

export interface QueryRetrievalTrace {
  query: string;
  semanticCount: number;
  lexicalCount: number;
  semanticChunkIds: string[];
  lexicalChunkIds: string[];
  durationMs: number;
}

export interface InspectorCandidate {
  chunkId: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  pageNumber?: number;
  sectionTitle?: string;
  semanticScore: number;
  lexicalScore: number;
  rrfScore: number;
  fusionScore: number;
  rerankScore?: number;
  relevanceScore: number;
  semanticRank?: number;
  lexicalRank?: number;
  fusionRank?: number;
  rerankRank?: number;
  retrievalSources: string[];
  content: string;
}

export interface InspectorNeighbor {
  chunkId: string;
  chunkIndex: number;
  content: string;
  pageNumber?: number;
  sectionTitle?: string;
}

export interface InspectorChunk extends InspectorCandidate {
  citationId: string;
  expandedContent?: string;
  neighbors: InspectorNeighbor[];
}

export interface CoverageTerm {
  term: string;
  covered: boolean;
  citationIds: string[];
}

export interface EvidenceCoverage {
  status: string;
  score: number;
  coveredTerms: number;
  totalTerms: number;
  terms: CoverageTerm[];
}

export interface RetrievalInspectResult {
  query: string;
  queries: string[];
  strategy: string;
  durationMs: number;
  hybridSearchEnabled: boolean;
  rerankingEnabled: boolean;
  neighborExpansionEnabled: boolean;
  settings: RetrievalInspectorSettings;
  perQuery: QueryRetrievalTrace[];
  candidates: InspectorCandidate[];
  chunks: InspectorChunk[];
  coverage: EvidenceCoverage;
  warnings: string[];
  metadata: Record<string, unknown>;
}

export interface GroundednessEvaluationInput {
  question: string;
  answer: string;
  documentIds?: string[];
  topK?: number;
  threshold?: number;
}

export interface GroundednessClaim {
  claimId: string;
  claim: string;
  status: string;
  evidenceIds: string[];
  reason: string;
}

export interface GroundednessEvaluationResult {
  question: string;
  answer: string;
  status: string;
  score?: number;
  threshold: number;
  totalClaims: number;
  supportedClaims: number;
  partialClaims: number;
  unsupportedClaims: number;
  claims: GroundednessClaim[];
  issues: string[];
  evidenceCitations: string[];
  coverage: EvidenceCoverage;
  durationMs: number;
}

interface ApiCoverageTerm {
  term: string;
  covered: boolean;
  citation_ids: string[];
}

interface ApiEvidenceCoverage {
  status: string;
  score: number;
  covered_terms: number;
  total_terms: number;
  terms: ApiCoverageTerm[];
}

interface ApiInspectorCandidate {
  chunk_id: string;
  document_id: string;
  document_name: string;
  chunk_index: number;
  page_number?: number | null;
  section_title?: string | null;
  semantic_score: number;
  lexical_score: number;
  rrf_score: number;
  fusion_score: number;
  rerank_score?: number | null;
  relevance_score: number;
  semantic_rank?: number | null;
  lexical_rank?: number | null;
  fusion_rank?: number | null;
  rerank_rank?: number | null;
  retrieval_sources: string[];
  content: string;
}

interface ApiInspectorChunk extends ApiInspectorCandidate {
  citation_id: string;
  expanded_content?: string | null;
  neighbors: {
    chunk_id: string;
    chunk_index: number;
    content: string;
    page_number?: number | null;
    section_title?: string | null;
  }[];
}

interface ApiRetrievalInspectResult {
  success: true;
  query: string;
  queries: string[];
  strategy: string;
  duration_ms: number;
  hybrid_search_enabled: boolean;
  reranking_enabled: boolean;
  neighbor_expansion_enabled: boolean;
  settings: {
    top_k: number;
    similarity_threshold: number;
    hybrid_search_enabled: boolean;
    semantic_weight: number;
    lexical_weight: number;
    rrf_weight: number;
    rrf_k: number;
    reranking_enabled: boolean;
    rerank_top_k: number;
    final_top_k: number;
    neighbor_expansion_enabled: boolean;
    embedding_model: string;
    embedding_dimension: number;
  };
  per_query: {
    query: string;
    semantic_count: number;
    lexical_count: number;
    semantic_chunk_ids: string[];
    lexical_chunk_ids: string[];
    duration_ms: number;
  }[];
  candidates: ApiInspectorCandidate[];
  chunks: ApiInspectorChunk[];
  coverage: ApiEvidenceCoverage;
  warnings: string[];
  metadata: Record<string, unknown>;
}

interface ApiGroundednessEvaluation {
  success: true;
  question: string;
  answer: string;
  status: string;
  score?: number | null;
  threshold: number;
  total_claims: number;
  supported_claims: number;
  partial_claims: number;
  unsupported_claims: number;
  claims: {
    claim_id: string;
    claim: string;
    status: string;
    evidence_ids: string[];
    reason: string;
  }[];
  issues: string[];
  evidence_citations: string[];
  coverage: ApiEvidenceCoverage;
  duration_ms: number;
}

function mapCoverage(coverage: ApiEvidenceCoverage): EvidenceCoverage {
  return {
    status: coverage.status,
    score: coverage.score,
    coveredTerms: coverage.covered_terms,
    totalTerms: coverage.total_terms,
    terms: coverage.terms.map((term) => ({
      term: term.term,
      covered: term.covered,
      citationIds: term.citation_ids,
    })),
  };
}

function mapCandidate(candidate: ApiInspectorCandidate): InspectorCandidate {
  return {
    chunkId: candidate.chunk_id,
    documentId: candidate.document_id,
    documentName: candidate.document_name,
    chunkIndex: candidate.chunk_index,
    pageNumber: candidate.page_number ?? undefined,
    sectionTitle: candidate.section_title ?? undefined,
    semanticScore: candidate.semantic_score,
    lexicalScore: candidate.lexical_score,
    rrfScore: candidate.rrf_score,
    fusionScore: candidate.fusion_score,
    rerankScore: candidate.rerank_score ?? undefined,
    relevanceScore: candidate.relevance_score,
    semanticRank: candidate.semantic_rank ?? undefined,
    lexicalRank: candidate.lexical_rank ?? undefined,
    fusionRank: candidate.fusion_rank ?? undefined,
    rerankRank: candidate.rerank_rank ?? undefined,
    retrievalSources: candidate.retrieval_sources,
    content: candidate.content,
  };
}

export async function inspectRetrieval(
  input: RetrievalInspectInput,
): Promise<RetrievalInspectResult> {
  const response = await apiRequest<ApiRetrievalInspectResult>("/retrieval/inspect", {
    method: "POST",
    body: JSON.stringify({
      query: input.query,
      queries: input.queries ?? [],
      document_ids: input.documentIds ?? [],
      top_k: input.topK,
      threshold: input.threshold,
      rerank_top_k: input.rerankTopK,
      final_top_k: input.finalTopK,
    }),
  });
  return {
    query: response.query,
    queries: response.queries,
    strategy: response.strategy,
    durationMs: response.duration_ms,
    hybridSearchEnabled: response.hybrid_search_enabled,
    rerankingEnabled: response.reranking_enabled,
    neighborExpansionEnabled: response.neighbor_expansion_enabled,
    settings: {
      topK: response.settings.top_k,
      similarityThreshold: response.settings.similarity_threshold,
      hybridSearchEnabled: response.settings.hybrid_search_enabled,
      semanticWeight: response.settings.semantic_weight,
      lexicalWeight: response.settings.lexical_weight,
      rrfWeight: response.settings.rrf_weight,
      rrfK: response.settings.rrf_k,
      rerankingEnabled: response.settings.reranking_enabled,
      rerankTopK: response.settings.rerank_top_k,
      finalTopK: response.settings.final_top_k,
      neighborExpansionEnabled: response.settings.neighbor_expansion_enabled,
      embeddingModel: response.settings.embedding_model,
      embeddingDimension: response.settings.embedding_dimension,
    },
    perQuery: response.per_query.map((trace) => ({
      query: trace.query,
      semanticCount: trace.semantic_count,
      lexicalCount: trace.lexical_count,
      semanticChunkIds: trace.semantic_chunk_ids,
      lexicalChunkIds: trace.lexical_chunk_ids,
      durationMs: trace.duration_ms,
    })),
    candidates: response.candidates.map(mapCandidate),
    chunks: response.chunks.map((chunk) => ({
      ...mapCandidate(chunk),
      citationId: chunk.citation_id,
      expandedContent: chunk.expanded_content ?? undefined,
      neighbors: chunk.neighbors.map((neighbor) => ({
        chunkId: neighbor.chunk_id,
        chunkIndex: neighbor.chunk_index,
        content: neighbor.content,
        pageNumber: neighbor.page_number ?? undefined,
        sectionTitle: neighbor.section_title ?? undefined,
      })),
    })),
    coverage: mapCoverage(response.coverage),
    warnings: response.warnings,
    metadata: response.metadata,
  };
}

export async function evaluateGroundedness(
  input: GroundednessEvaluationInput,
): Promise<GroundednessEvaluationResult> {
  const response = await apiRequest<ApiGroundednessEvaluation>("/evaluation/groundedness", {
    method: "POST",
    body: JSON.stringify({
      question: input.question,
      answer: input.answer,
      document_ids: input.documentIds ?? [],
      top_k: input.topK,
      threshold: input.threshold,
    }),
  });
  return {
    question: response.question,
    answer: response.answer,
    status: response.status,
    score: response.score ?? undefined,
    threshold: response.threshold,
    totalClaims: response.total_claims,
    supportedClaims: response.supported_claims,
    partialClaims: response.partial_claims,
    unsupportedClaims: response.unsupported_claims,
    claims: response.claims.map((claim) => ({
      claimId: claim.claim_id,
      claim: claim.claim,
      status: claim.status,
      evidenceIds: claim.evidence_ids,
      reason: claim.reason,
    })),
    issues: response.issues,
    evidenceCitations: response.evidence_citations,
    coverage: mapCoverage(response.coverage),
    durationMs: response.duration_ms,
  };
}
