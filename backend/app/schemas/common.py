from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class IntegrationStatus(str, Enum):
    OPERATIONAL = "OPERATIONAL"
    PROCESSING = "PROCESSING"
    DEGRADED = "DEGRADED"
    UNAVAILABLE = "UNAVAILABLE"
    NOT_CONFIGURED = "NOT_CONFIGURED"
    AWAITING_INTEGRATION = "AWAITING_INTEGRATION"
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"


class DocumentStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    INDEXED = "indexed"
    FAILED = "failed"


class DocumentProcessingState(str, Enum):
    UPLOADED = "UPLOADED"
    VALIDATING = "VALIDATING"
    EXTRACTING = "EXTRACTING"
    PREPROCESSING = "PREPROCESSING"
    CHUNKING = "CHUNKING"
    EMBEDDING = "EMBEDDING"
    VECTOR_INDEXING = "VECTOR_INDEXING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    REQUIRES_OCR = "REQUIRES_OCR"


class EmbeddingState(str, Enum):
    NOT_CONFIGURED = "NOT_CONFIGURED"
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    READY = "READY"
    DEGRADED = "DEGRADED"
    UNAVAILABLE = "UNAVAILABLE"
    FAILED = "FAILED"


class VectorIndexState(str, Enum):
    INITIALIZING = "INITIALIZING"
    READY = "READY"
    DEGRADED = "DEGRADED"
    UNAVAILABLE = "UNAVAILABLE"
    FAILED = "FAILED"


class DocumentIndexState(str, Enum):
    NOT_CONFIGURED = "NOT_CONFIGURED"
    NOT_INDEXED = "NOT_INDEXED"
    EMBEDDING = "EMBEDDING"
    VECTOR_INDEXING = "VECTOR_INDEXING"
    INDEXED = "INDEXED"
    FAILED = "FAILED"
    STALE = "STALE"


class DocumentFormat(str, Enum):
    PDF = "PDF"
    TXT = "TXT"
    MD = "MD"


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ErrorDetail(APIModel):
    code: str
    message: str
    details: Any | None = None


class ErrorResponse(APIModel):
    success: Literal[False] = False
    error: ErrorDetail
    request_id: str
