from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import (
    APIModel,
    DocumentFormat,
    DocumentIndexState,
    DocumentProcessingState,
    DocumentStatus,
    IntegrationStatus,
)


class ProcessingWarningResponse(APIModel):
    code: str
    message: str
    page_number: int | None = None


class ProcessingFailureResponse(APIModel):
    code: str
    message: str
    stage: str
    details: dict[str, Any] = Field(default_factory=dict)
    retryable: bool = False


class DocumentProcessingInfo(APIModel):
    state: DocumentProcessingState = DocumentProcessingState.UPLOADED
    stage: str = "upload"
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: float | None = None
    page_count: int | None = None
    total_characters: int = 0
    total_chunks: int = 0
    chunking_strategy: str | None = None
    warnings: list[ProcessingWarningResponse] = Field(default_factory=list)
    error: ProcessingFailureResponse | None = None


class DocumentIndexingInfo(APIModel):
    state: DocumentIndexState = DocumentIndexState.NOT_INDEXED
    stage: str = "pending"
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: float | None = None
    total_chunks: int = 0
    embedded_chunks: int = 0
    vector_count: int = 0
    embedding_model: str | None = None
    embedding_dimension: int | None = None
    index_version: str | None = None
    error: ProcessingFailureResponse | None = None


class DocumentMetadata(APIModel):
    content_type: str | None = None
    extension: str
    storage_backend: Literal["local"] = "local"
    checksum_sha256: str | None = None
    page_count: int | None = None
    total_characters: int = 0
    preview: str | None = None
    processing: DocumentProcessingInfo | None = None


class DocumentResponse(APIModel):
    id: UUID
    filename: str
    original_filename: str
    file_type: DocumentFormat
    file_size: int
    status: DocumentStatus
    upload_timestamp: datetime
    updated_timestamp: datetime
    total_chunks: int
    metadata: DocumentMetadata = Field(validation_alias="document_metadata")
    processing_state: DocumentProcessingState | None = None
    processing_stage: str | None = None
    page_count: int | None = None
    total_characters: int = 0
    processing_duration_ms: float | None = None
    chunking_strategy: str | None = None
    indexing: DocumentIndexingInfo | None = Field(
        default=None,
        validation_alias="indexing_info",
    )
    warnings: list[ProcessingWarningResponse] = Field(
        default_factory=list,
        validation_alias="processing_warnings",
    )
    error: ProcessingFailureResponse | None = Field(
        default=None,
        validation_alias="processing_failure",
    )


class DocumentProcessingStatus(APIModel):
    document_id: UUID
    status: DocumentStatus
    processing_state: DocumentProcessingState | None = None
    processing_stage: str | None = None
    total_chunks: int
    page_count: int | None = None
    total_characters: int = 0
    processing_duration_ms: float | None = None
    chunking_strategy: str | None = None
    indexing: DocumentIndexingInfo | None = None
    warnings: list[ProcessingWarningResponse] = Field(default_factory=list)
    error: ProcessingFailureResponse | None = None
    pipeline_status: IntegrationStatus
    detail: str
    updated_timestamp: datetime


class DocumentListResponse(APIModel):
    success: Literal[True] = True
    items: list[DocumentResponse]
    total: int
    limit: int
    offset: int


class DocumentUploadResponse(APIModel):
    success: Literal[True] = True
    document: DocumentResponse
    processing: DocumentProcessingStatus
    processing_state: DocumentProcessingState | None = None
    page_count: int | None = None
    total_characters: int = 0
    total_chunks: int = 0
    processing_duration_ms: float | None = None
    chunking_strategy: str | None = None
    warnings: list[ProcessingWarningResponse] = Field(default_factory=list)
    error: ProcessingFailureResponse | None = None


class DocumentReprocessResponse(APIModel):
    success: Literal[True] = True
    document: DocumentResponse
    processing: DocumentProcessingStatus


class DocumentReindexResponse(APIModel):
    success: Literal[True] = True
    processing: DocumentProcessingStatus


class DocumentDeleteResponse(APIModel):
    success: Literal[True] = True
    message: str
    document_id: UUID


class DocumentChunkResponse(APIModel):
    id: UUID
    document_id: UUID
    chunk_index: int
    content: str
    content_hash: str
    character_count: int
    token_count_estimate: int
    page_number: int | None = None
    section_title: str | None = None
    section_hierarchy: list[str] = Field(default_factory=list)
    start_offset: int
    end_offset: int
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias="chunk_metadata",
    )
    created_at: datetime


class DocumentChunkListResponse(APIModel):
    success: Literal[True] = True
    document_id: UUID
    items: list[DocumentChunkResponse]
    total: int
    limit: int
    offset: int


class DocumentContentResponse(APIModel):
    success: Literal[True] = True
    document_id: UUID
    filename: str
    content_type: Literal["text/plain"] = "text/plain"
    content: str
    truncated: bool
    total_characters: int
    page_count: int | None = None
    chunking_strategy: str | None = None
    warnings: list[ProcessingWarningResponse] = Field(default_factory=list)


class DocumentProcessingStatistics(APIModel):
    success: Literal[True] = True
    total_documents: int
    state_counts: dict[str, int]
    legacy_status_counts: dict[str, int]
    total_chunks: int
    documents_with_chunks: int
    documents_requiring_ocr: int
    total_extracted_characters: int
    average_chunks_per_document: float
    average_characters_per_chunk: float
    pipeline_status: IntegrationStatus
