from dataclasses import dataclass, field
from typing import Any
from uuid import UUID


@dataclass(frozen=True)
class ProcessingWarning:
    code: str
    message: str
    page_number: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "page_number": self.page_number,
        }


@dataclass(frozen=True)
class ProcessingFailure:
    code: str
    message: str
    stage: str
    details: dict[str, Any] | None = None
    retryable: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "stage": self.stage,
            "details": self.details or {},
            "retryable": self.retryable,
        }


@dataclass(frozen=True)
class ParsedPage:
    page_number: int
    text: str
    character_count: int
    is_image_only: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ParsedSection:
    title: str
    level: int
    hierarchy: tuple[str, ...]
    start_offset: int
    end_offset: int
    page_number: int | None = None


@dataclass(frozen=True)
class ParsedBlock:
    kind: str
    text: str
    start_offset: int
    end_offset: int
    page_number: int | None = None
    section_title: str | None = None
    section_hierarchy: tuple[str, ...] = ()
    heading_level: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ParsedDocument:
    text: str
    blocks: tuple[ParsedBlock, ...]
    pages: tuple[ParsedPage, ...] = ()
    sections: tuple[ParsedSection, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)
    warnings: tuple[ProcessingWarning, ...] = ()
    page_count: int | None = None
    title: str | None = None
    author: str | None = None
    requires_ocr: bool = False


@dataclass(frozen=True)
class ProcessedBlock:
    kind: str
    text: str
    start_offset: int
    end_offset: int
    page_number: int | None = None
    section_title: str | None = None
    section_hierarchy: tuple[str, ...] = ()
    heading_level: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProcessedDocument:
    raw_text: str
    normalized_text: str
    blocks: tuple[ProcessedBlock, ...]
    warnings: tuple[ProcessingWarning, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)
    page_count: int | None = None
    title: str | None = None
    author: str | None = None
    requires_ocr: bool = False


@dataclass(frozen=True)
class ChunkingConfig:
    chunk_size: int = 1000
    chunk_overlap: int = 150
    min_chunk_size: int = 100
    max_chunk_size: int = 2000
    strategy: str = "auto"

    def __post_init__(self) -> None:
        if self.min_chunk_size > self.chunk_size:
            raise ValueError("min_chunk_size must not exceed chunk_size")
        if self.chunk_size > self.max_chunk_size:
            raise ValueError("chunk_size must not exceed max_chunk_size")
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("chunk_overlap must be smaller than chunk_size")
        if self.strategy not in {"auto", "recursive", "structure"}:
            raise ValueError("unsupported chunking strategy")


@dataclass(frozen=True)
class ChunkDraft:
    content: str
    start_offset: int
    end_offset: int
    page_number: int | None
    section_title: str | None
    section_hierarchy: tuple[str, ...]
    block_kinds: tuple[str, ...]
    token_count_estimate: int
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProcessingResult:
    document_id: UUID
    status: str
    processing_state: str
    page_count: int | None
    total_characters: int
    total_chunks: int
    duration_ms: float
    warnings: tuple[ProcessingWarning, ...] = ()
    failure: ProcessingFailure | None = None
    chunking_strategy: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
