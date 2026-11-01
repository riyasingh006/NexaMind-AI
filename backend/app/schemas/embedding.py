from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.schemas.common import (
    APIModel,
    DocumentIndexState,
    EmbeddingState,
    IntegrationStatus,
    VectorIndexState,
)
from app.schemas.document import (
    DocumentIndexingInfo,
    DocumentResponse,
    ProcessingFailureResponse,
)


class EmbeddingGenerateRequest(APIModel):
    document_id: UUID
    force: bool = False


class EmbeddingStatusResponse(APIModel):
    success: Literal[True] = True
    status: EmbeddingState
    configured: bool
    model: str
    dimension: int
    batch_size: int
    total_chunks: int
    embedded_chunks: int
    pending_chunks: int
    failed_chunks: int
    documents_indexed: int
    last_embedded_at: datetime | None = None
    detail: str


class VectorIndexStatusResponse(APIModel):
    success: Literal[True] = True
    status: VectorIndexState
    model: str
    dimension: int
    metric: Literal["cosine"] = "cosine"
    vector_count: int
    indexed_documents: int
    storage_path: str
    version: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    recovered: bool = False
    detail: str


class VectorSearchRequest(APIModel):
    query: str = Field(min_length=1, max_length=4000)
    document_ids: list[UUID] = Field(default_factory=list, max_length=100)
    top_k: int | None = Field(default=None, ge=1, le=100)
    threshold: float | None = Field(default=None, ge=-1.0, le=1.0)

    @field_validator("query")
    @classmethod
    def normalize_query(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("query must not be blank")
        return normalized

    @field_validator("document_ids")
    @classmethod
    def unique_document_ids(cls, value: list[UUID]) -> list[UUID]:
        return list(dict.fromkeys(value))


class VectorSearchResult(APIModel):
    chunk_id: UUID
    document_id: UUID
    document_name: str
    chunk_index: int
    content: str
    page_number: int | None = None
    section_title: str | None = None
    section_hierarchy: list[str] = Field(default_factory=list)
    score: float
    rank: int


class VectorSearchResponse(APIModel):
    success: Literal[True] = True
    query: str
    embedding_model: str
    embedding_dimension: int
    top_k: int
    threshold: float
    document_ids: list[UUID] = Field(default_factory=list)
    results: list[VectorSearchResult] = Field(default_factory=list)
    result_count: int
    index_version: str | None = None
    processing_time_ms: float


class VectorIndexRebuildRequest(APIModel):
    document_ids: list[UUID] = Field(default_factory=list, max_length=500)

    @field_validator("document_ids")
    @classmethod
    def unique_document_ids(cls, value: list[UUID]) -> list[UUID]:
        return list(dict.fromkeys(value))


class VectorIndexRebuildResponse(APIModel):
    success: Literal[True] = True
    status: VectorIndexState
    documents_processed: int
    documents_failed: int
    embedded_chunks: int
    vector_count: int
    index_version: str | None = None
    duration_ms: float
    errors: list[dict[str, Any]] = Field(default_factory=list)


class VectorStatisticsResponse(APIModel):
    success: Literal[True] = True
    total_documents: int
    documents_with_chunks: int
    documents_indexed: int
    total_chunks: int
    embedded_chunks: int
    pending_chunks: int
    failed_chunks: int
    vector_count: int
    embedding_model: str
    embedding_dimension: int
    index_status: VectorIndexState
    index_version: str | None = None
    index_updated_at: datetime | None = None
    storage_bytes: int
    model_status: IntegrationStatus


class DocumentIndexStatusResponse(APIModel):
    success: Literal[True] = True
    document_id: UUID
    status: DocumentIndexState
    stage: str | None = None
    total_chunks: int
    embedded_chunks: int
    vector_count: int
    embedding_model: str | None = None
    embedding_dimension: int | None = None
    indexed_at: datetime | None = None
    duration_ms: float | None = None
    index_version: str | None = None
    error: ProcessingFailureResponse | None = None


class DocumentIndexResponse(APIModel):
    success: Literal[True] = True
    document: DocumentResponse
    indexing: DocumentIndexingInfo


class DocumentIndexDeleteResponse(APIModel):
    success: Literal[True] = True
    message: str
    document_id: UUID
    vector_count: int
    index_version: str | None = None


class EmbeddingChunkStatus(APIModel):
    embedded: int
    pending: int
    failed: int

    @model_validator(mode="after")
    def validate_total(self) -> "EmbeddingChunkStatus":
        if min(self.embedded, self.pending, self.failed) < 0:
            raise ValueError("Embedding counts must not be negative")
        return self
