from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing_extensions import TypedDict


class QueryIntent(str, Enum):
    FACTUAL_LOOKUP = "FACTUAL_LOOKUP"
    SUMMARY = "SUMMARY"
    COMPARISON = "COMPARISON"
    EXPLANATION = "EXPLANATION"
    MULTI_HOP_QUESTION = "MULTI_HOP_QUESTION"
    DOCUMENT_ANALYSIS = "DOCUMENT_ANALYSIS"
    FOLLOW_UP = "FOLLOW_UP"
    OUT_OF_SCOPE = "OUT_OF_SCOPE"
    AMBIGUOUS = "AMBIGUOUS"


class EvidenceStatus(str, Enum):
    SUFFICIENT = "SUFFICIENT"
    PARTIAL = "PARTIAL"
    INSUFFICIENT = "INSUFFICIENT"
    NO_RESULTS = "NO_RESULTS"
    RETRIEVAL_UNAVAILABLE = "RETRIEVAL_UNAVAILABLE"


class ValidationStatus(str, Enum):
    PENDING = "PENDING"
    VALID = "VALID"
    INVALID = "INVALID"
    FAILED = "FAILED"
    ABSTAINED = "ABSTAINED"


class ConversationTurn(TypedDict):
    role: str
    content: str


class RetrievedChunkData(TypedDict, total=False):
    chunk_id: str
    document_id: str
    filename: str
    content: str
    expanded_content: str
    page_number: int | None
    section_title: str | None
    section_hierarchy: list[str]
    chunk_index: int
    similarity_score: float
    embedding_model: str
    retrieval_query: str
    retrieval_queries: list[str]
    citation_id: str
    semantic_score: float
    lexical_score: float
    rrf_score: float
    fusion_score: float
    rerank_score: float
    relevance_score: float
    semantic_rank: int | None
    lexical_rank: int | None
    fusion_rank: int | None
    rerank_rank: int | None
    retrieval_sources: list[str]
    neighbor_chunks: list[dict[str, Any]]


class GroundednessClaimData(TypedDict, total=False):
    claim_id: str
    claim: str
    status: str
    evidence_ids: list[str]
    reason: str


class GroundednessReportData(TypedDict, total=False):
    status: str
    score: float | None
    threshold: float
    total_claims: int
    supported_claims: int
    partial_claims: int
    unsupported_claims: int
    claims: list[GroundednessClaimData]
    issues: list[str]
    duration_ms: float
    error: str | None


class CitationData(TypedDict, total=False):
    citation_id: str
    chunk_id: str
    document_id: str
    filename: str
    page_number: int | None
    section_title: str | None
    relevant_excerpt: str
    similarity_score: float
    chunk_index: int


class AgentErrorData(TypedDict, total=False):
    code: str
    category: str
    message: str
    retryable: bool


class AgentState(TypedDict, total=False):
    request_id: str
    user_query: str
    original_query: str
    analyzed_query: str
    rewritten_query: str
    document_ids: list[str]
    scope_document_ids: list[str]
    scope_document_names: list[str]
    scope_status: str
    conversation_id: str | None
    conversation_history: list[ConversationTurn]
    query_intent: str
    top_k: int
    similarity_threshold: float
    retrieval_queries: list[str]
    retrieved_chunks: list[RetrievedChunkData]
    retrieval_error: AgentErrorData | None
    filtered_chunks: list[RetrievedChunkData]
    context: str
    citations: list[CitationData]
    evidence_status: str
    generation_result: dict[str, Any] | None
    final_answer: str
    validation_status: str
    error: AgentErrorData | None
    processing_metadata: dict[str, Any]
    retry_count: int
    requires_retrieval: bool
    needs_rewrite: bool
    validation_issues: list[str]
    groundedness_report: GroundednessReportData
    groundedness_retry_count: int
    groundedness_issues: list[str]
    groundedness_action: str
    evidence_coverage: dict[str, Any]
    out_of_scope: bool


class AgentRunInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    request_id: str = Field(default="-", max_length=128)
    user_query: str = Field(min_length=1, max_length=8000)
    document_ids: list[UUID] = Field(default_factory=list, max_length=20)
    conversation_id: UUID | None = None
    conversation_history: list[ConversationTurn] = Field(
        default_factory=list, max_length=12
    )
    top_k: int | None = Field(default=None, ge=1, le=50)
    similarity_threshold: float | None = Field(default=None, ge=-1.0, le=1.0)
    temperature: float = Field(default=0.2, ge=0.0, le=1.0)

    @field_validator("document_ids")
    @classmethod
    def unique_document_ids(cls, value: list[UUID]) -> list[UUID]:
        return list(dict.fromkeys(value))

    @field_validator("conversation_history")
    @classmethod
    def trim_conversation_history(
        cls, value: list[ConversationTurn]
    ) -> list[ConversationTurn]:
        trimmed: list[ConversationTurn] = []
        for turn in value[-8:]:
            content = str(turn.get("content", "")).strip()
            if not content:
                continue
            trimmed.append(
                ConversationTurn(
                    role=str(turn.get("role", "user"))[:16],
                    content=content[:1200],
                )
            )
        return trimmed


class AgentRunResult(BaseModel):
    answer: str
    evidence_status: EvidenceStatus
    citations: list[CitationData] = Field(default_factory=list)
    rewritten_query: str
    query_intent: QueryIntent
    query_rewritten: bool
    retrieval_queries: list[str] = Field(default_factory=list)
    retrieved_chunks: list[RetrievedChunkData] = Field(default_factory=list)
    filtered_chunks: list[RetrievedChunkData] = Field(default_factory=list)
    context_token_count: int = 0
    validation_status: ValidationStatus
    groundedness: GroundednessReportData | None = None
    evidence_coverage: dict[str, Any] = Field(default_factory=dict)
    retry_count: int = 0
    processing_metadata: dict[str, Any] = Field(default_factory=dict)
    generation_model: str | None = None
    processing_time_ms: float = 0.0
