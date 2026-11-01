from typing import Any, Literal
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.common import APIModel


class RetrievalInspectRequest(APIModel):
    query: str = Field(min_length=1, max_length=4000)
    queries: list[str] = Field(default_factory=list, max_length=8)
    document_ids: list[UUID] = Field(default_factory=list, max_length=100)
    top_k: int | None = Field(default=None, ge=1, le=50)
    threshold: float | None = Field(default=None, ge=-1.0, le=1.0)
    rerank_top_k: int | None = Field(default=None, ge=1, le=50)
    final_top_k: int | None = Field(default=None, ge=1, le=50)

    @field_validator("query")
    @classmethod
    def normalize_query(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("query must not be blank")
        return normalized

    @field_validator("queries")
    @classmethod
    def normalize_queries(cls, value: list[str]) -> list[str]:
        return list(
            dict.fromkeys(
                query.strip()[:1000] for query in value if query.strip()
            )
        )

    @field_validator("document_ids")
    @classmethod
    def unique_document_ids(cls, value: list[UUID]) -> list[UUID]:
        return list(dict.fromkeys(value))


class RetrievalSettingsSummary(APIModel):
    top_k: int
    similarity_threshold: float
    hybrid_search_enabled: bool
    semantic_weight: float
    lexical_weight: float
    rrf_weight: float
    rrf_k: int
    reranking_enabled: bool
    rerank_top_k: int
    final_top_k: int
    neighbor_expansion_enabled: bool
    embedding_model: str
    embedding_dimension: int


class QueryRetrievalTrace(APIModel):
    query: str
    semantic_count: int
    lexical_count: int
    semantic_chunk_ids: list[str] = Field(default_factory=list)
    lexical_chunk_ids: list[str] = Field(default_factory=list)
    duration_ms: float


class InspectorCandidate(APIModel):
    chunk_id: str
    document_id: str
    document_name: str
    chunk_index: int
    page_number: int | None = None
    section_title: str | None = None
    semantic_score: float
    lexical_score: float
    rrf_score: float
    fusion_score: float
    rerank_score: float | None = None
    relevance_score: float
    semantic_rank: int | None = None
    lexical_rank: int | None = None
    fusion_rank: int | None = None
    rerank_rank: int | None = None
    retrieval_sources: list[str] = Field(default_factory=list)
    content: str


class InspectorNeighbor(APIModel):
    chunk_id: str
    chunk_index: int
    content: str
    page_number: int | None = None
    section_title: str | None = None


class InspectorChunk(APIModel):
    citation_id: str
    chunk_id: str
    document_id: str
    document_name: str
    chunk_index: int
    page_number: int | None = None
    section_title: str | None = None
    semantic_score: float
    lexical_score: float
    fusion_score: float
    rerank_score: float | None = None
    relevance_score: float
    rerank_rank: int | None = None
    retrieval_sources: list[str] = Field(default_factory=list)
    content: str
    expanded_content: str | None = None
    neighbors: list[InspectorNeighbor] = Field(default_factory=list)


class CoverageTerm(APIModel):
    term: str
    covered: bool
    citation_ids: list[str] = Field(default_factory=list)


class EvidenceCoverageResponse(APIModel):
    status: str
    score: float
    covered_terms: int
    total_terms: int
    terms: list[CoverageTerm] = Field(default_factory=list)


class RetrievalInspectResponse(APIModel):
    success: Literal[True] = True
    query: str
    queries: list[str]
    strategy: str
    duration_ms: float
    hybrid_search_enabled: bool
    reranking_enabled: bool
    neighbor_expansion_enabled: bool
    settings: RetrievalSettingsSummary
    per_query: list[QueryRetrievalTrace] = Field(default_factory=list)
    candidates: list[InspectorCandidate] = Field(default_factory=list)
    chunks: list[InspectorChunk] = Field(default_factory=list)
    coverage: EvidenceCoverageResponse
    warnings: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class GroundednessEvaluationRequest(APIModel):
    question: str = Field(min_length=1, max_length=8000)
    answer: str = Field(min_length=1, max_length=20000)
    document_ids: list[UUID] = Field(default_factory=list, max_length=100)
    top_k: int | None = Field(default=None, ge=1, le=50)
    threshold: float | None = Field(default=None, ge=-1.0, le=1.0)

    @field_validator("question", "answer")
    @classmethod
    def strip_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value must not be blank")
        return normalized

    @field_validator("document_ids")
    @classmethod
    def unique_document_ids(cls, value: list[UUID]) -> list[UUID]:
        return list(dict.fromkeys(value))


class GroundednessClaimResponse(APIModel):
    claim_id: str
    claim: str
    status: str
    evidence_ids: list[str] = Field(default_factory=list)
    reason: str


class GroundednessEvaluationResponse(APIModel):
    success: Literal[True] = True
    question: str
    answer: str
    status: str
    score: float | None
    threshold: float
    total_claims: int
    supported_claims: int
    partial_claims: int
    unsupported_claims: int
    claims: list[GroundednessClaimResponse] = Field(default_factory=list)
    issues: list[str] = Field(default_factory=list)
    evidence_citations: list[str] = Field(default_factory=list)
    coverage: EvidenceCoverageResponse
    duration_ms: float
