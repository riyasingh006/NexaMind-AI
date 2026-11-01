import asyncio
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID, uuid4

from app.core.config import Settings, get_settings
from app.processing.chunking import chunk_document, resolve_strategy
from app.processing.errors import DocumentProcessingError
from app.processing.models import (
    ChunkDraft,
    ChunkingConfig,
    ProcessedDocument,
    ProcessingWarning,
)
from app.processing.parsers import get_parser
from app.processing.preprocessing import preprocess_document

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PreparedDocument:
    document_id: UUID
    processed: ProcessedDocument
    chunks: list[ChunkDraft]
    strategy: str
    warnings: tuple[ProcessingWarning, ...]
    raw_temp_path: Path
    normalized_temp_path: Path
    raw_path: Path
    normalized_path: Path
    processing_duration_ms: float


class DocumentProcessingService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    async def process(
        self,
        document_id: UUID,
        path: Path,
        file_type: str,
    ) -> PreparedDocument:
        started = time.perf_counter()
        raw_path = self.settings.extracted_dir / f"{document_id}.raw.txt"
        normalized_path = self.settings.extracted_dir / f"{document_id}.normalized.txt"
        unique = uuid4().hex
        raw_temp_path = self.settings.processing_temp_dir / f"{document_id}-{unique}.raw.tmp"
        normalized_temp_path = (
            self.settings.processing_temp_dir / f"{document_id}-{unique}.normalized.tmp"
        )
        self.settings.extracted_dir.mkdir(parents=True, exist_ok=True)
        self.settings.processing_temp_dir.mkdir(parents=True, exist_ok=True)

        try:
            processed, chunks, strategy, warnings = await asyncio.wait_for(
                asyncio.to_thread(
                    self._process_sync,
                    path,
                    file_type,
                    raw_temp_path,
                    normalized_temp_path,
                ),
                timeout=self.settings.processing_timeout_seconds,
            )
        except TimeoutError as exc:
            self._cleanup(raw_temp_path, normalized_temp_path)
            raise DocumentProcessingError(
                "PROCESSING_TIMEOUT",
                "Document processing exceeded the configured timeout.",
                stage="extracting",
                retryable=True,
            ) from exc
        except Exception:
            self._cleanup(raw_temp_path, normalized_temp_path)
            raise

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        return PreparedDocument(
            document_id=document_id,
            processed=processed,
            chunks=chunks,
            strategy=strategy,
            warnings=warnings,
            raw_temp_path=raw_temp_path,
            normalized_temp_path=normalized_temp_path,
            raw_path=raw_path,
            normalized_path=normalized_path,
            processing_duration_ms=duration_ms,
        )

    def _process_sync(
        self,
        path: Path,
        file_type: str,
        raw_temp_path: Path,
        normalized_temp_path: Path,
    ) -> tuple[ProcessedDocument, list[ChunkDraft], str, tuple[ProcessingWarning, ...]]:
        try:
            parsed = get_parser(file_type).parse(path)
        except DocumentProcessingError:
            raise
        except Exception as exc:
            logger.exception(
                "document.parser_failed",
                extra={"file_type": file_type, "path": str(path)},
            )
            raise DocumentProcessingError(
                "PARSER_FAILED",
                "The document parser failed unexpectedly.",
                stage="extracting",
                details={"reason": str(exc)},
            ) from exc

        if parsed.requires_ocr:
            raise DocumentProcessingError(
                "OCR_REQUIRED",
                "The PDF contains no extractable text and requires OCR, which is not available in Phase 3.",
                stage="extracting",
                details={
                    "page_count": parsed.page_count,
                    "warnings": [warning.to_dict() for warning in parsed.warnings],
                },
                retryable=False,
                requires_ocr=True,
            )

        processed = preprocess_document(parsed)
        if not processed.normalized_text.strip():
            raise DocumentProcessingError(
                "EMPTY_DOCUMENT",
                "The document does not contain meaningful extractable text.",
                stage="preprocessing",
                details={
                    "page_count": processed.page_count,
                    "warnings": [warning.to_dict() for warning in processed.warnings],
                },
            )

        config = ChunkingConfig(
            chunk_size=self.settings.chunk_size,
            chunk_overlap=self.settings.chunk_overlap,
            min_chunk_size=self.settings.min_chunk_size,
            max_chunk_size=self.settings.max_chunk_size,
            strategy=self.settings.chunking_strategy,
        )
        try:
            chunks = chunk_document(processed, config)
        except Exception as exc:
            logger.exception(
                "document.chunking_failed",
                extra={"document_path": str(path)},
            )
            raise DocumentProcessingError(
                "CHUNKING_FAILED",
                "The document could not be divided into meaningful chunks.",
                stage="chunking",
                details={"reason": str(exc)},
            ) from exc
        if not chunks:
            raise DocumentProcessingError(
                "NO_CHUNKS_CREATED",
                "No meaningful chunks were produced from the document.",
                stage="chunking",
                details={"total_characters": len(processed.normalized_text)},
            )

        strategy = chunks[0].metadata.get("strategy", resolve_strategy(processed, "auto"))
        warnings = self._deduplicate_warnings(processed.warnings)
        self._write_text(raw_temp_path, processed.raw_text)
        self._write_text(normalized_temp_path, processed.normalized_text)
        return processed, chunks, str(strategy), warnings

    def finalize_files(self, prepared: PreparedDocument) -> None:
        prepared.raw_temp_path.replace(prepared.raw_path)
        prepared.normalized_temp_path.replace(prepared.normalized_path)

    def discard_files(self, prepared: PreparedDocument) -> None:
        self._cleanup(prepared.raw_temp_path, prepared.normalized_temp_path)

    def remove_extracted_files(self, document_id: UUID) -> None:
        self._cleanup(
            self.settings.extracted_dir / f"{document_id}.raw.txt",
            self.settings.extracted_dir / f"{document_id}.normalized.txt",
        )

    def _write_text(self, path: Path, content: str) -> None:
        with path.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)

    def _cleanup(self, *paths: Path) -> None:
        for path in paths:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                logger.warning(
                    "document.processing_cleanup_failed",
                    extra={"path": str(path)},
                )

    def _deduplicate_warnings(
        self, warnings: tuple[ProcessingWarning, ...]
    ) -> tuple[ProcessingWarning, ...]:
        seen: set[tuple[str, int | None]] = set()
        unique: list[ProcessingWarning] = []
        for warning in warnings:
            key = (warning.code, warning.page_number)
            if key in seen:
                continue
            seen.add(key)
            unique.append(warning)
        return tuple(unique)
