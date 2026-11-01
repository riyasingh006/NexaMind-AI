import asyncio
import hashlib
import logging
import mimetypes
import time
from datetime import datetime
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    DuplicateDocumentError,
    NotFoundError,
    PayloadTooLargeError,
)
from app.models.document import Document
from app.processing.errors import DocumentProcessingError
from app.processing.models import ProcessingWarning
from app.processing.validation import ValidatedUpload, validate_uploaded_file
from app.repositories.document_chunk_repository import DocumentChunkRepository
from app.repositories.document_repository import DocumentRepository
from app.schemas.common import (
    DocumentFormat,
    DocumentIndexState,
    DocumentProcessingState,
    DocumentStatus,
    IntegrationStatus,
)
from app.schemas.document import (
    DocumentContentResponse,
    DocumentProcessingStatistics,
    DocumentProcessingStatus,
    ProcessingWarningResponse,
)
from app.services.document_indexing_service import DocumentIndexingService
from app.services.document_processing_service import (
    DocumentProcessingService,
    PreparedDocument,
)
from app.utils.datetime import utc_now

logger = logging.getLogger(__name__)


class DocumentService:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings | None = None,
    ) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self.repository = DocumentRepository(session)
        self.chunk_repository = DocumentChunkRepository(session)
        self.processing_service = DocumentProcessingService(self.settings)
        self.indexing_service = DocumentIndexingService(session, self.settings)

    async def upload(self, upload: UploadFile) -> tuple[Document, DocumentProcessingStatus]:
        if not upload.filename:
            raise BadRequestError("A filename is required")

        self.settings.storage_dir.mkdir(parents=True, exist_ok=True)
        upload_id = uuid4()
        temp_path = self.settings.storage_dir / f".{upload_id}.uploading"
        validated: ValidatedUpload | None = None
        destination: Path | None = None

        try:
            await self._persist_upload(upload, temp_path)
            validated = validate_uploaded_file(
                temp_path,
                upload.filename,
                upload.content_type,
                self.settings.max_upload_size,
            )
            duplicate = await self.repository.get_by_checksum(validated.checksum_sha256)
            if duplicate is not None:
                raise DuplicateDocumentError(
                    "This file has already been uploaded.",
                    details={
                        "document_id": str(duplicate.id),
                        "original_filename": duplicate.original_filename,
                    },
                )

            document_id = uuid4()
            destination = self.settings.storage_dir / f"{document_id}{validated.extension}"
            temp_path.replace(destination)
            content_type = validated.mime_type or mimetypes.guess_type(
                validated.safe_filename
            )[0] or "application/octet-stream"
            now = utc_now()
            document = Document(
                id=document_id,
                filename=destination.name,
                original_filename=validated.safe_filename,
                file_type=validated.file_type,
                file_size=validated.size,
                status=DocumentStatus.QUEUED.value,
                total_chunks=0,
                document_metadata={
                    "content_type": content_type,
                    "extension": validated.extension,
                    "storage_backend": "local",
                    "checksum_sha256": validated.checksum_sha256,
                    "page_count": None,
                    "total_characters": 0,
                    "preview": None,
                    "processing": self._processing_snapshot(
                        state=DocumentProcessingState.UPLOADED,
                        stage="queued",
                        started_at=now,
                        warnings=validated.warnings,
                    ),
                },
                storage_path=str(destination),
            )
        except Exception:
            temp_path.unlink(missing_ok=True)
            if destination is not None:
                destination.unlink(missing_ok=True)
            raise
        finally:
            await upload.close()

        try:
            await self.repository.add(document)
            await self.repository.commit()
            await self.repository.refresh(document)
        except Exception:
            await self.repository.rollback()
            destination.unlink(missing_ok=True)
            logger.exception(
                "document.upload_persistence_failed",
                extra={"document_id": str(document.id)},
            )
            raise

        logger.info(
            "document.uploaded",
            extra={
                "document_id": str(document.id),
                "file_type": document.file_type,
                "file_size": document.file_size,
            },
        )
        document = await self._process_document(document, validated)
        return document, self.processing_status(document)

    async def reprocess_document(
        self, document_id: UUID
    ) -> tuple[Document, DocumentProcessingStatus]:
        document = await self.get_document(document_id)
        path = Path(document.storage_path)
        if not path.is_file():
            raise ConflictError(
                "The stored document file is missing and cannot be reprocessed",
                code="DOCUMENT_FILE_MISSING",
            )

        content_type = str(document.document_metadata.get("content_type", ""))
        validated = validate_uploaded_file(
            path,
            document.original_filename,
            content_type,
            self.settings.max_upload_size,
        )
        expected_checksum = document.document_metadata.get("checksum_sha256")
        if expected_checksum and validated.checksum_sha256 != expected_checksum:
            raise ConflictError(
                "The stored document contents no longer match their recorded checksum",
                code="STORED_FILE_MODIFIED",
            )

        validated = ValidatedUpload(
            original_filename=document.original_filename,
            safe_filename=document.original_filename,
            file_type=document.file_type,
            extension=str(document.document_metadata.get("extension", validated.extension)),
            mime_type=content_type,
            size=document.file_size,
            checksum_sha256=str(expected_checksum or validated.checksum_sha256),
        )
        await self._prepare_for_reprocessing(document)
        document = await self._process_document(document, validated)
        return document, self.processing_status(document)

    async def _process_document(
        self, document: Document, validated: ValidatedUpload
    ) -> Document:
        started_at = utc_now()
        started_clock = time.perf_counter()
        self._set_processing_state(
            document,
            state=DocumentProcessingState.EXTRACTING,
            stage="extracting",
            started_at=started_at,
            total_chunks=document.total_chunks,
        )
        document.status = DocumentStatus.PROCESSING.value
        try:
            await self.repository.commit()
            await self.repository.refresh(document)
        except Exception:
            await self.repository.rollback()
            raise

        try:
            prepared = await self.processing_service.process(
                document.id,
                Path(document.storage_path),
                document.file_type,
            )
        except DocumentProcessingError as exc:
            duration_ms = round((time.perf_counter() - started_clock) * 1000, 2)
            await self._mark_failure(document, exc, duration_ms)
            return document
        except Exception as exc:
            logger.exception(
                "document.processing_failed",
                extra={"document_id": str(document.id)},
            )
            failure = DocumentProcessingError(
                "INTERNAL_PROCESSING_ERROR",
                "Document processing failed unexpectedly.",
                stage="processing",
                details={"reason": str(exc)},
                retryable=True,
            )
            duration_ms = round((time.perf_counter() - started_clock) * 1000, 2)
            await self._mark_failure(document, failure, duration_ms)
            return document

        try:
            await self.chunk_repository.delete_for_document(document.id)
            await self.chunk_repository.add_many(
                document.id,
                prepared.chunks,
                filename=document.original_filename,
                source_type=document.file_type,
            )
            processing_warnings = [
                warning.to_dict() for warning in prepared.warnings
            ]
            total_characters = len(prepared.processed.normalized_text)
            document.document_metadata = {
                **document.document_metadata,
                "page_count": prepared.processed.page_count,
                "total_characters": total_characters,
                "preview": self._preview(prepared.processed.normalized_text),
                "chunking_strategy": prepared.strategy,
                "extraction": prepared.processed.metadata,
                "processing": self._processing_snapshot(
                    state=DocumentProcessingState.COMPLETED,
                    stage="completed",
                    started_at=started_at,
                    completed_at=utc_now(),
                    duration_ms=prepared.processing_duration_ms,
                    page_count=prepared.processed.page_count,
                    total_characters=total_characters,
                    total_chunks=len(prepared.chunks),
                    chunking_strategy=prepared.strategy,
                    warnings=prepared.warnings,
                ),
            }
            document.status = DocumentStatus.INDEXED.value
            document.total_chunks = len(prepared.chunks)
            document.updated_timestamp = utc_now()
            await self.repository.commit()
            await self.repository.refresh(document)
        except Exception:
            await self.repository.rollback()
            self.processing_service.discard_files(prepared)
            logger.exception(
                "document.chunk_persistence_failed",
                extra={"document_id": str(document.id)},
            )
            await self.repository.refresh(document)
            failure = DocumentProcessingError(
                "CHUNK_PERSISTENCE_FAILED",
                "Processed chunks could not be saved.",
                stage="persistence",
                retryable=True,
            )
            await self._mark_failure(
                document,
                failure,
                round((time.perf_counter() - started_clock) * 1000, 2),
            )
            return document

        try:
            await asyncio.to_thread(self.processing_service.finalize_files, prepared)
        except OSError as exc:
            logger.warning(
                "document.extracted_content_finalize_failed",
                extra={"document_id": str(document.id), "reason": str(exc)},
            )
            warnings = [*prepared.warnings, ProcessingWarning(
                "CONTENT_SIDECAR_WRITE_FAILED",
                "Extracted content sidecars could not be finalized; chunks remain available.",
            )]
            document.document_metadata = {
                **document.document_metadata,
                "processing": self._processing_snapshot(
                    state=DocumentProcessingState.COMPLETED,
                    stage="completed",
                    started_at=started_at,
                    completed_at=utc_now(),
                    duration_ms=prepared.processing_duration_ms,
                    page_count=prepared.processed.page_count,
                    total_characters=len(prepared.processed.normalized_text),
                    total_chunks=len(prepared.chunks),
                    chunking_strategy=prepared.strategy,
                    warnings=tuple(warnings),
                ),
            }
            try:
                await self.repository.commit()
                await self.repository.refresh(document)
            except Exception:
                await self.repository.rollback()

        logger.info(
            "document.processed",
            extra={
                "document_id": str(document.id),
                "file_type": document.file_type,
                "total_chunks": document.total_chunks,
                "duration_ms": prepared.processing_duration_ms,
            },
        )
        return await self._index_after_processing(document)

    async def _index_after_processing(self, document: Document) -> Document:
        if not self.settings.vector_index_auto_on_upload:
            return document
        try:
            if not self.indexing_service.configured:
                return await self.indexing_service.mark_not_configured(document)
            document, _ = await self.indexing_service.index_document(
                document.id,
                raise_on_failure=False,
            )
            return document
        except Exception:
            logger.exception(
                "document.auto_indexing_failed",
                extra={"document_id": str(document.id)},
            )
            try:
                await self.repository.refresh(document)
            except Exception:
                await self.repository.rollback()
            return document

    async def _prepare_for_reprocessing(self, document: Document) -> None:
        try:
            await asyncio.to_thread(
                self.indexing_service.vector_index_service.remove_document,
                document.id,
            )
        except Exception:
            logger.warning(
                "document.existing_index_cleanup_failed",
                extra={"document_id": str(document.id)},
            )
        document.document_metadata = {
            **document.document_metadata,
            "indexing": {
                "state": DocumentIndexState.NOT_INDEXED.value,
                "stage": "reprocessing",
                "total_chunks": 0,
                "embedded_chunks": 0,
                "vector_count": 0,
            },
        }

    async def _remove_document_index(self, document_id: UUID) -> None:
        try:
            await asyncio.to_thread(
                self.indexing_service.vector_index_service.remove_document,
                document_id,
            )
        except Exception:
            logger.warning(
                "document.index_cleanup_failed",
                extra={"document_id": str(document_id)},
            )

    async def _mark_failure(
        self,
        document: Document,
        failure: DocumentProcessingError,
        duration_ms: float,
    ) -> None:
        state = (
            DocumentProcessingState.REQUIRES_OCR
            if failure.requires_ocr
            else DocumentProcessingState.FAILED
        )
        warning_items = failure.details.get("warnings", [])
        warnings: list[ProcessingWarning] = []
        if isinstance(warning_items, list):
            for item in warning_items:
                if not isinstance(item, dict) or not item.get("code"):
                    continue
                warnings.append(
                    ProcessingWarning(
                        code=str(item["code"]),
                        message=str(item.get("message", "")),
                        page_number=item.get("page_number")
                        if isinstance(item.get("page_number"), int)
                        else None,
                    )
                )
        document.status = DocumentStatus.FAILED.value
        document.updated_timestamp = utc_now()
        document.document_metadata = {
            **document.document_metadata,
            "processing": self._processing_snapshot(
                state=state,
                stage=failure.stage,
                started_at=None,
                completed_at=utc_now(),
                duration_ms=duration_ms,
                page_count=failure.details.get("page_count")
                if isinstance(failure.details.get("page_count"), int)
                else document.document_metadata.get("page_count"),
                total_characters=document.document_metadata.get(
                    "total_characters", 0
                ),
                total_chunks=document.total_chunks,
                warnings=tuple(warnings),
                error={
                    "code": failure.code,
                    "message": failure.message,
                    "stage": failure.stage,
                    "details": failure.details,
                    "retryable": failure.retryable,
                },
            ),
        }
        try:
            await self.repository.commit()
            await self.repository.refresh(document)
        except Exception:
            await self.repository.rollback()
            logger.exception(
                "document.failure_state_persistence_failed",
                extra={"document_id": str(document.id)},
            )
            raise

        logger.warning(
            "document.processing_failed",
            extra={
                "document_id": str(document.id),
                "error_code": failure.code,
                "stage": failure.stage,
                "requires_ocr": failure.requires_ocr,
            },
        )

    def _set_processing_state(
        self,
        document: Document,
        *,
        state: DocumentProcessingState,
        stage: str,
        started_at: datetime | None,
        total_chunks: int,
    ) -> None:
        document.document_metadata = {
            **document.document_metadata,
            "processing": self._processing_snapshot(
                state=state,
                stage=stage,
                started_at=started_at,
                total_chunks=total_chunks,
            ),
        }

    def _processing_snapshot(
        self,
        *,
        state: DocumentProcessingState,
        stage: str,
        started_at: datetime | None = None,
        completed_at: datetime | None = None,
        duration_ms: float | None = None,
        page_count: int | None = None,
        total_characters: int = 0,
        total_chunks: int = 0,
        chunking_strategy: str | None = None,
        warnings: tuple[ProcessingWarning, ...] = (),
        error: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return {
            "state": state.value,
            "stage": stage,
            "started_at": started_at.isoformat() if started_at else None,
            "completed_at": completed_at.isoformat() if completed_at else None,
            "duration_ms": duration_ms,
            "page_count": page_count,
            "total_characters": total_characters,
            "total_chunks": total_chunks,
            "chunking_strategy": chunking_strategy,
            "warnings": [warning.to_dict() for warning in warnings],
            "error": error,
        }

    def _preview(self, content: str) -> str:
        limit = self.settings.content_preview_characters
        collapsed = " ".join(content.split())
        if len(collapsed) <= limit:
            return collapsed
        return f"{collapsed[:limit].rstrip()}..."

    async def list_documents(
        self,
        *,
        search: str | None,
        status: DocumentStatus | None,
        file_type: DocumentFormat | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Document], int]:
        documents = await self.repository.list(
            search=search,
            status=status,
            file_type=file_type,
            limit=limit,
            offset=offset,
        )
        total = await self.repository.count(
            search=search,
            status=status,
            file_type=file_type,
        )
        return documents, total

    async def get_document(self, document_id: UUID) -> Document:
        document = await self.repository.get(document_id)
        if document is None:
            raise NotFoundError("Document not found")
        return document

    async def get_chunks(
        self,
        document_id: UUID,
        *,
        limit: int,
        offset: int,
    ) -> tuple[list[object], int]:
        await self.get_document(document_id)
        chunks = await self.chunk_repository.list_for_document(
            document_id,
            limit=limit,
            offset=offset,
        )
        total = await self.chunk_repository.count_for_document(document_id)
        return list(chunks), total

    async def get_content(self, document_id: UUID) -> DocumentContentResponse:
        document = await self.get_document(document_id)
        normalized_path = self.settings.extracted_dir / f"{document.id}.normalized.txt"
        content = ""
        if normalized_path.is_file():
            try:
                content = await asyncio.to_thread(
                    normalized_path.read_text, encoding="utf-8"
                )
            except OSError:
                logger.warning(
                    "document.extracted_content_read_failed",
                    extra={"document_id": str(document.id)},
                )

        if not content:
            chunks = await self.chunk_repository.list_for_document(
                document.id,
                limit=100000,
                offset=0,
            )
            content = "\n\n".join(chunk.content for chunk in chunks)

        if not content:
            raise NotFoundError(
                "No extracted content is available for this document",
                code="DOCUMENT_CONTENT_NOT_AVAILABLE",
            )

        total_characters = len(content)
        limit = self.settings.content_endpoint_max_characters
        truncated = total_characters > limit
        if truncated:
            content = content[:limit]
        warnings = list(document.processing_warnings)
        if truncated:
            warnings.append(
                ProcessingWarningResponse(
                    code="CONTENT_TRUNCATED",
                    message=f"Content truncated to {limit} characters.",
                ).model_dump()
            )

        return DocumentContentResponse(
            document_id=document.id,
            filename=document.original_filename,
            content=content,
            truncated=truncated,
            total_characters=total_characters,
            page_count=document.page_count,
            chunking_strategy=document.chunking_strategy,
            warnings=warnings,
        )

    async def delete_document(self, document_id: UUID) -> Document:
        document = await self.get_document(document_id)
        storage_path = Path(document.storage_path)
        await self._remove_document_index(document_id)
        try:
            await self.repository.delete(document)
            await self.repository.commit()
        except Exception:
            await self.repository.rollback()
            raise

        try:
            storage_path.unlink(missing_ok=True)
        except OSError:
            logger.warning(
                "document.file_cleanup_failed",
                extra={"document_id": str(document_id), "path": str(storage_path)},
            )
        self.processing_service.remove_extracted_files(document_id)

        logger.info(
            "document.deleted",
            extra={"document_id": str(document_id)},
        )
        return document

    async def reindex_document(self, document_id: UUID) -> DocumentProcessingStatus:
        _, processing = await self.reprocess_document(document_id)
        return processing

    async def processing_statistics(self) -> DocumentProcessingStatistics:
        document_aggregate = await self.repository.statistics()
        chunk_aggregate = await self.chunk_repository.statistics()
        metadata_rows = await self.repository.processing_metadata()
        state_counts = {
            state.value: 0 for state in DocumentProcessingState
        }
        requiring_ocr = 0
        valid_states = {item.value for item in DocumentProcessingState}
        for status, metadata in metadata_rows:
            processing = metadata.get("processing", {})
            state = (
                processing.get("state")
                if isinstance(processing, dict)
                else None
            )
            normalized_state = (
                str(state)
                if isinstance(state, str) and state in valid_states
                else self._infer_state(str(status))
            )
            state_counts[normalized_state] = state_counts.get(normalized_state, 0) + 1
            if normalized_state == DocumentProcessingState.REQUIRES_OCR.value:
                requiring_ocr += 1

        return DocumentProcessingStatistics(
            total_documents=document_aggregate.total_documents,
            state_counts=state_counts,
            legacy_status_counts={
                "queued": document_aggregate.queued_documents,
                "processing": document_aggregate.processing_documents,
                "indexed": document_aggregate.indexed_documents,
                "failed": document_aggregate.failed_documents,
            },
            total_chunks=chunk_aggregate.total_chunks,
            documents_with_chunks=chunk_aggregate.documents_with_chunks,
            documents_requiring_ocr=requiring_ocr,
            total_extracted_characters=chunk_aggregate.total_characters,
            average_chunks_per_document=(
                chunk_aggregate.total_chunks / document_aggregate.total_documents
                if document_aggregate.total_documents
                else 0.0
            ),
            average_characters_per_chunk=chunk_aggregate.average_characters,
            pipeline_status=IntegrationStatus.OPERATIONAL,
        )

    def _infer_state(self, status: str) -> str:
        if status == DocumentStatus.INDEXED.value:
            return DocumentProcessingState.COMPLETED.value
        if status == DocumentStatus.FAILED.value:
            return DocumentProcessingState.FAILED.value
        if status == DocumentStatus.PROCESSING.value:
            return DocumentProcessingState.EXTRACTING.value
        return DocumentProcessingState.UPLOADED.value

    def processing_status(self, document: Document) -> DocumentProcessingStatus:
        state = (
            DocumentProcessingState(document.processing_state)
            if document.processing_state
            else None
        )
        if state is None:
            state = DocumentProcessingState(self._infer_state(document.status))
        pipeline_status = self._pipeline_status(state)
        return DocumentProcessingStatus(
            document_id=document.id,
            status=DocumentStatus(document.status),
            processing_state=state,
            processing_stage=document.processing_stage,
            total_chunks=document.total_chunks,
            page_count=document.page_count,
            total_characters=document.total_characters,
            processing_duration_ms=document.processing_duration_ms,
            chunking_strategy=document.chunking_strategy,
            indexing=document.indexing_info or None,
            warnings=document.processing_warnings,
            error=document.processing_failure,
            pipeline_status=pipeline_status,
            detail=self._status_detail(state),
            updated_timestamp=document.updated_timestamp,
        )

    def _pipeline_status(self, state: DocumentProcessingState) -> IntegrationStatus:
        if state == DocumentProcessingState.COMPLETED:
            return IntegrationStatus.OPERATIONAL
        if state in {
            DocumentProcessingState.FAILED,
            DocumentProcessingState.REQUIRES_OCR,
        }:
            return IntegrationStatus.DEGRADED
        return IntegrationStatus.PROCESSING

    def _status_detail(self, state: DocumentProcessingState) -> str:
        details = {
            DocumentProcessingState.UPLOADED: "The file has been stored and is awaiting processing.",
            DocumentProcessingState.VALIDATING: "The file is being validated.",
            DocumentProcessingState.EXTRACTING: "Text is being extracted from the document.",
            DocumentProcessingState.PREPROCESSING: "Extracted text is being normalized.",
            DocumentProcessingState.CHUNKING: "The document is being divided into chunks.",
            DocumentProcessingState.EMBEDDING: "The document chunks are being embedded.",
            DocumentProcessingState.VECTOR_INDEXING: "The document vectors are being written to the FAISS index.",
            DocumentProcessingState.COMPLETED: "The document was parsed and chunked successfully.",
            DocumentProcessingState.FAILED: "Document processing failed.",
            DocumentProcessingState.REQUIRES_OCR: "The document requires OCR, which is not available.",
        }
        return details[state]

    async def generate_embeddings(self, document_id: UUID) -> None:
        await self.indexing_service.index_document(document_id)

    async def index_document(self, document_id: UUID) -> Document:
        document, _ = await self.indexing_service.index_document(document_id)
        return document

    async def _persist_upload(self, upload: UploadFile, destination: Path) -> tuple[int, str]:
        digest = hashlib.sha256()
        size = 0
        try:
            with destination.open("wb") as target:
                while True:
                    chunk = await upload.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > self.settings.max_upload_size:
                        raise PayloadTooLargeError(
                            "The uploaded file exceeds the configured limit",
                            details={"max_upload_size": self.settings.max_upload_size},
                        )
                    digest.update(chunk)
                    target.write(chunk)
        except Exception:
            destination.unlink(missing_ok=True)
            raise

        return size, digest.hexdigest()
