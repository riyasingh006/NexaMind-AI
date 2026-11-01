from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import AliasChoices, Field, field_validator

from app.schemas.common import (
    APIModel,
    IntegrationStatus,
    MessageRole,
)


class ChatSource(APIModel):
    id: str
    document_id: UUID
    document_name: str
    page: int | None = None
    chunk_id: str
    chunk_index: int = 0
    section_title: str | None = None
    similarity: float
    excerpt: str


class ChatMessageMetadata(APIModel):
    integration_status: IntegrationStatus | None = None
    model: str | None = None
    sources_count: int = 0
    latency_ms: float | None = None
    evidence_status: str | None = None
    validation_status: str | None = None
    query_rewritten: bool | None = None
    groundedness_status: str | None = None
    groundedness_score: float | None = None
    evidence_coverage_status: str | None = None
    evidence_coverage_score: float | None = None
    document_ids: list[UUID] = Field(default_factory=list)
    citations: list[ChatSource] = Field(default_factory=list)


class ChatMessageResponse(APIModel):
    id: UUID
    conversation_id: UUID
    role: MessageRole
    content: str
    created_at: datetime
    metadata: ChatMessageMetadata = Field(validation_alias="message_metadata")


class RetrievedChunk(APIModel):
    id: str
    document_id: UUID
    document_name: str
    page: int | None = None
    chunk_index: int = 0
    section_title: str | None = None
    similarity: float
    rerank_position: int
    content: str


class RetrievalMetadata(APIModel):
    rewritten_query: str
    retrieval_queries: list[str] = Field(default_factory=list)
    duration_ms: float
    chunks: list[RetrievedChunk] = Field(default_factory=list)
    strategy: str


class AgentWorkflowMetadata(APIModel):
    query_intent: str
    evidence_status: str
    validation_status: str
    query_rewritten: bool
    rewritten_query: str
    retrieval_queries: list[str] = Field(default_factory=list)
    retrieved_chunk_count: int = 0
    filtered_chunk_count: int = 0
    citation_count: int = 0
    context_token_count: int = 0
    retry_count: int = 0
    generation_model: str | None = None
    groundedness_status: str | None = None
    groundedness_score: float | None = None
    groundedness_claim_count: int = 0
    groundedness_unsupported_claims: int = 0
    evidence_coverage_status: str | None = None
    evidence_coverage_score: float | None = None
    latency_ms: float


class ChatQueryRequest(APIModel):
    prompt: str = Field(
        min_length=1,
        max_length=8000,
        validation_alias=AliasChoices("prompt", "query"),
    )
    conversation_id: UUID | None = None
    document_ids: list[UUID] = Field(default_factory=list, max_length=20)
    top_k: int | None = Field(default=None, ge=1, le=50)
    similarity_threshold: float | None = Field(default=None, ge=-1.0, le=1.0)
    temperature: float = Field(default=0.2, ge=0, le=1)

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Prompt must not be blank")
        return stripped

    @field_validator("document_ids")
    @classmethod
    def validate_document_ids(cls, value: list[UUID]) -> list[UUID]:
        return list(dict.fromkeys(value))


class ChatQueryResponse(APIModel):
    success: Literal[True] = True
    status: IntegrationStatus
    conversation_id: UUID
    user_message: ChatMessageResponse
    assistant_message: ChatMessageResponse
    answer: str
    sources: list[ChatSource] = Field(default_factory=list)
    retrieval: RetrievalMetadata
    agent: AgentWorkflowMetadata
    detail: str
    regenerated_message_id: UUID | None = None


class ConversationResponse(APIModel):
    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int
    document_ids: list[UUID] = Field(default_factory=list)
    messages: list[ChatMessageResponse]


class ConversationListResponse(APIModel):
    success: Literal[True] = True
    items: list[ConversationResponse]
    total: int
    limit: int
    offset: int


class ConversationDeleteResponse(APIModel):
    success: Literal[True] = True
    message: str
    conversation_id: UUID

