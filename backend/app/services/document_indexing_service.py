import asyncio
import logging
import time
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.exceptions import ConflictError, NotFoundError
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.repositories.document_chunk_repository import DocumentChunkRepository
from app.repositories.document_repository import DocumentRepository
from app.schemas.common import (
    DocumentIndexState,
    DocumentProcessingState,
    DocumentStatus,
    EmbeddingState,
    IntegrationStatus,
    VectorIndexState,
)
from app.schemas.document import DocumentIndexingInfo
from app.schemas.embedding import (
    DocumentIndexStatusResponse,
    EmbeddingStatusResponse,
    VectorIndexRebuildResponse,
    VectorIndexStatusResponse,
    VectorSearchRequest,
    VectorSearchResponse,
    VectorSearchResult,
    VectorStatisticsResponse,
)
from app.services.gemini_embedding_service import (
    EmbeddingConfigurationError,
    GeminiEmbeddingService,
)
from app.services.vector_index_service import (
    IndexSnapshot,
    VectorIndexService,
    VectorRecord,
)
from app.utils.datetime import utc_now

logger = logging.getLogger(__name__)


class DocumentIndexingService:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings | None = None,
        *,
        embedding_service: GeminiEmbeddingService | None = None,
        vector_index_service: VectorIndexService | None = None,
    ) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self.document_repository = DocumentRepository(session)
        self.chunk_repository = DocumentChunkRepository(session)
        self.embedding_service = embedding_service or GeminiEmbeddingService(
            self.settings
        )
        self.vector_index_service = vector_index_service or VectorIndexService(
            self.settings
        )

    @property
    def configured(self) -> bool:
        return self.settings.gemini_configured

    async def index_document(
        self,
        document_id: UUID,
        *,
        force: bool = False,
        raise_on_failure: bool = True,
    ) -> tuple[Document, DocumentIndexingInfo]:
        document = await self.document_repository.get(document_id)
        if document is None:
            raise NotFoundError("Document not found")
        chunks = await self.chunk_repository.list_for_document(
            document_id, limit=100000, offset=0
        )
        if not chunks:
            raise ConflictError(
                "The document does not have any chunks to embed.",
                code="DOCUMENT_HAS_NO_CHUNKS",
            )

        if not self.configured:
            await self._mark_not_configured(document, len(chunks))
            await self.document_repository.commit()
            await self.document_repository.refresh(document)
            raise EmbeddingConfigurationError(
                "DOCUMIND_GEMINI_API_KEY is not configured; the document cannot be indexed.",
                details={
                    "document_id": str(document_id),
                    "model": self.settings.gemini_embedding_model,
                    "dimension": self.settings.gemini_embedding_dimension,
                },
            )

        if not force:
            index_snapshot = await asyncio.to_thread(
                self.vector_index_service.get_status
            )
            if await self._already_indexed(document, chunks, index_snapshot):
                return document, self._document_indexing_info(document)

        started_at = utc_now()
        started_clock = time.perf_counter()
        self._set_index_state(
            document,
            state=DocumentIndexState.EMBEDDING,
            stage="embedding",
            started_at=started_at,
            total_chunks=len(chunks),
            embedded_chunks=0,
            vector_count=0,
        )
        self._set_processing_stage(
            document,
            DocumentProcessingState.EMBEDDING,
            "embedding",
        )
        document.status = DocumentStatus.PROCESSING.value
        await self.document_repository.commit()
        await self.document_repository.refresh(document)

        try:
            vectors = await self.embedding_service.embed_documents(
                [chunk.content for chunk in chunks],
                title=document.original_filename,
            )
            if len(vectors) != len(chunks):
                raise ValueError(
                    "The embedding count does not match the document's chunk count."
                )

            self._set_index_state(
                document,
                state=DocumentIndexState.VECTOR_INDEXING,
                stage="vector_indexing",
                started_at=started_at,
                total_chunks=len(chunks),
                embedded_chunks=len(vectors),
                vector_count=len(vectors),
            )
            self._set_processing_stage(
                document,
                DocumentProcessingState.VECTOR_INDEXING,
                "vector_indexing",
            )
            await self.document_repository.commit()

            records = [
                self._vector_record(document, chunk, vector)
                for chunk, vector in zip(chunks, vectors, strict=True)
            ]
            snapshot = await asyncio.to_thread(
                self.vector_index_service.upsert_document,
                document.id,
                records,
            )

            completed_at = utc_now()
            duration_ms = round(
                (time.perf_counter() - started_clock) * 1000, 2
            )
            await self.chunk_repository.mark_embedded(
                chunks,
                model=self.settings.gemini_embedding_model,
                dimension=self.settings.gemini_embedding_dimension,
                embedded_at=completed_at,
            )
            self._set_index_state(
                document,
                state=DocumentIndexState.INDEXED,
                stage="completed",
                started_at=started_at,
                completed_at=completed_at,
                duration_ms=duration_ms,
                total_chunks=len(chunks),
                embedded_chunks=len(chunks),
                vector_count=len(records),
                index_version=snapshot.version,
            )
            self._set_processing_stage(
                document,
                DocumentProcessingState.COMPLETED,
                "completed",
            )
            document.status = DocumentStatus.INDEXED.value
            document.updated_timestamp = completed_at
            await self.document_repository.commit()
            await self.document_repository.refresh(document)

            logger.info(
                "document.indexed",
                extra={
                    "document_id": str(document.id),
                    "chunks": len(chunks),
                    "dimension": self.settings.gemini_embedding_dimension,
                    "duration_ms": duration_ms,
                },
            )
            return document, self._document_indexing_info(document)
        except Exception as exc:
            duration_ms = round(
                (time.perf_counter() - started_clock) * 1000, 2
            )
            await self.session.rollback()
            document = await self.document_repository.get(document_id)
            if document is None:
                raise
            await self._mark_indexing_failure(
                document,
                exc,
                duration_ms=duration_ms,
                chunks=chunks,
            )
            if raise_on_failure:
                raise
            return document, self._document_indexing_info(document)

    async def mark_not_configured(self, document: Document) -> Document:
        chunks = await self.chunk_repository.list_for_document(
            document.id, limit=100000, offset=0
        )
        await self._mark_not_configured(document, len(chunks))
        await self.document_repository.commit()
        await self.document_repository.refresh(document)
        return document

    async def document_index_status(
        self, document_id: UUID
    ) -> DocumentIndexStatusResponse:
        document = await self.document_repository.get(document_id)
        if document is None:
            raise NotFoundError("Document not found")
        chunks = await self.chunk_repository.list_for_document(
            document_id, limit=100000, offset=0
        )
        embedded_chunks = sum(
            1 for chunk in chunks if chunk.embedding_status == "EMBEDDED"
        )
        info = document.indexing_info
        state_value = info.get("state")
        if isinstance(state_value, str):
            try:
                state = DocumentIndexState(state_value)
            except ValueError:
                state = DocumentIndexState.NOT_INDEXED
        elif self.configured:
            state = DocumentIndexState.NOT_INDEXED
        else:
            state = DocumentIndexState.NOT_CONFIGURED

        return DocumentIndexStatusResponse(
            document_id=document.id,
            status=state,
            stage=document.index_stage,
            total_chunks=len(chunks),
            embedded_chunks=embedded_chunks,
            vector_count=document.vector_count,
            embedding_model=document.embedding_model
            or self.settings.gemini_embedding_model,
            embedding_dimension=document.embedding_dimension
            or self.settings.gemini_embedding_dimension,
            indexed_at=self._parse_datetime(document.indexed_at),
            duration_ms=document.indexing_duration_ms,
            index_version=info.get("index_version")
            if isinstance(info.get("index_version"), str)
            else None,
            error=document.indexing_failure,
        )

    async def embedding_status(self) -> EmbeddingStatusResponse:
        aggregate = await self.chunk_repository.embedding_aggregate()
        index_snapshot = await asyncio.to_thread(
            self.vector_index_service.get_status
        )
        configured = self.configured
        if not configured:
            state = EmbeddingState.NOT_CONFIGURED
            detail = "DOCUMIND_GEMINI_API_KEY is not configured."
        elif aggregate.failed_chunks:
            state = EmbeddingState.DEGRADED
            detail = "One or more chunks failed embedding generation."
        elif aggregate.embedded_chunks:
            state = EmbeddingState.READY
            detail = "Gemini embeddings are configured and available."
        else:
            state = EmbeddingState.PENDING
            detail = "Gemini embeddings are configured; no chunks are embedded yet."

        return EmbeddingStatusResponse(
            status=state,
            configured=configured,
            model=self.settings.gemini_embedding_model,
            dimension=self.settings.gemini_embedding_dimension,
            batch_size=self.settings.gemini_embedding_batch_size,
            total_chunks=aggregate.total_chunks,
            embedded_chunks=aggregate.embedded_chunks,
            pending_chunks=aggregate.pending_chunks,
            failed_chunks=aggregate.failed_chunks,
            documents_indexed=index_snapshot.indexed_documents,
            last_embedded_at=aggregate.last_embedded_at,
            detail=detail,
        )

    async def index_status(self) -> VectorIndexStatusResponse:
        snapshot = await asyncio.to_thread(self.vector_index_service.get_status)
        return self._index_status_response(snapshot)

    async def statistics(self) -> VectorStatisticsResponse:
        chunk_aggregate = await self.chunk_repository.embedding_aggregate()
        document_aggregate = await self.document_repository.statistics()
        index_snapshot = await asyncio.to_thread(
            self.vector_index_service.get_status
        )
        index_statistics = await asyncio.to_thread(
            self.vector_index_service.statistics
        )
        if not self.configured:
            model_status = IntegrationStatus.NOT_CONFIGURED
        elif index_snapshot.status == VectorIndexState.DEGRADED:
            model_status = IntegrationStatus.DEGRADED
        else:
            model_status = IntegrationStatus.OPERATIONAL

        return VectorStatisticsResponse(
            total_documents=document_aggregate.total_documents,
            documents_with_chunks=chunk_aggregate.documents_indexed,
            documents_indexed=index_snapshot.indexed_documents,
            total_chunks=chunk_aggregate.total_chunks,
            embedded_chunks=chunk_aggregate.embedded_chunks,
            pending_chunks=chunk_aggregate.pending_chunks,
            failed_chunks=chunk_aggregate.failed_chunks,
            vector_count=index_snapshot.vector_count,
            embedding_model=self.settings.gemini_embedding_model,
            embedding_dimension=self.settings.gemini_embedding_dimension,
            index_status=index_snapshot.status,
            index_version=index_snapshot.version,
            index_updated_at=index_snapshot.updated_at,
            storage_bytes=int(index_statistics.get("storage_bytes", 0)),
            model_status=model_status,
        )

    async def search(self, request: VectorSearchRequest) -> VectorSearchResponse:
        if not self.configured:
            raise EmbeddingConfigurationError(
                "DOCUMIND_GEMINI_API_KEY is not configured; vector search is unavailable.",
                details={
                    "model": self.settings.gemini_embedding_model,
                    "dimension": self.settings.gemini_embedding_dimension,
                },
            )

        top_k = min(
            request.top_k or self.settings.vector_search_default_top_k,
            self.settings.vector_search_max_top_k,
        )
        threshold = (
            request.threshold
            if request.threshold is not None
            else self.settings.vector_similarity_threshold
        )
        started_clock = time.perf_counter()
        query_vector = await self.embedding_service.embed_query(request.query)
        matches, version = await asyncio.to_thread(
            self.vector_index_service.search,
            query_vector,
            top_k=top_k,
            threshold=threshold,
            document_ids=request.document_ids,
        )

        chunk_ids = [
            UUID(str(match.metadata["chunk_id"])) for match in matches
        ]
        chunks = await self.chunk_repository.get_by_ids(chunk_ids)
        chunks_by_id = {str(chunk.id): chunk for chunk in chunks}
        results: list[VectorSearchResult] = []
        for match in matches:
            chunk = chunks_by_id.get(str(match.metadata.get("chunk_id")))
            if chunk is None:
                logger.warning(
                    "vector_index.stale_chunk_reference",
                    extra={"chunk_id": str(match.metadata.get("chunk_id"))},
                )
                continue
            results.append(
                VectorSearchResult(
                    chunk_id=chunk.id,
                    document_id=chunk.document_id,
                    document_name=str(
                        match.metadata.get("filename")
                        or chunk.chunk_metadata.get("filename")
                        or "Unknown document"
                    ),
                    chunk_index=chunk.chunk_index,
                    content=chunk.content,
                    page_number=chunk.page_number,
                    section_title=chunk.section_title,
                    section_hierarchy=list(chunk.section_hierarchy),
                    score=round(match.score, 6),
                    rank=len(results) + 1,
                )
            )

        return VectorSearchResponse(
            query=request.query,
            embedding_model=self.settings.gemini_embedding_model,
            embedding_dimension=self.settings.gemini_embedding_dimension,
            top_k=top_k,
            threshold=threshold,
            document_ids=request.document_ids,
            results=results,
            result_count=len(results),
            index_version=version,
            processing_time_ms=round(
                (time.perf_counter() - started_clock) * 1000, 2
            ),
        )

    async def rebuild_index(
        self, document_ids: list[UUID] | None = None
    ) -> VectorIndexRebuildResponse:
        if not self.configured:
            raise EmbeddingConfigurationError(
                "DOCUMIND_GEMINI_API_KEY is not configured; the index cannot be rebuilt.",
            )

        started_clock = time.perf_counter()
        if document_ids:
            documents = [
                document
                for document_id in document_ids
                if (document := await self.document_repository.get(document_id))
                is not None
            ]
        else:
            documents = await self.document_repository.list(
                limit=100000, offset=0
            )

        processed = 0
        failed = 0
        embedded_chunks = 0
        errors: list[dict[str, Any]] = []
        for document in documents:
            try:
                _, info = await self.index_document(
                    document.id,
                    force=True,
                    raise_on_failure=False,
                )
                if info.state == DocumentIndexState.INDEXED:
                    processed += 1
                    embedded_chunks += info.embedded_chunks
                else:
                    failed += 1
                    errors.append(
                        {
                            "document_id": str(document.id),
                            "error": info.error.message
                            if info.error
                            else "Indexing did not complete.",
                        }
                    )
            except Exception as exc:
                failed += 1
                errors.append(
                    {
                        "document_id": str(document.id),
                        "error": str(exc)[:500],
                    }
                )

        snapshot = await asyncio.to_thread(self.vector_index_service.get_status)
        return VectorIndexRebuildResponse(
            status=snapshot.status,
            documents_processed=processed,
            documents_failed=failed,
            embedded_chunks=embedded_chunks,
            vector_count=snapshot.vector_count,
            index_version=snapshot.version,
            duration_ms=round(
                (time.perf_counter() - started_clock) * 1000, 2
            ),
            errors=errors,
        )

    async def delete_document_index(self, document_id: UUID) -> IndexSnapshot:
        document = await self.document_repository.get(document_id)
        if document is None:
            raise NotFoundError("Document not found")
        snapshot = await asyncio.to_thread(
            self.vector_index_service.remove_document, document_id
        )
        document.document_metadata = {
            **document.document_metadata,
            "indexing": {
                "state": DocumentIndexState.NOT_INDEXED.value,
                "stage": "deleted",
                "total_chunks": document.total_chunks,
                "embedded_chunks": 0,
                "vector_count": 0,
                "embedding_model": self.settings.gemini_embedding_model,
                "embedding_dimension": self.settings.gemini_embedding_dimension,
                "completed_at": utc_now().isoformat(),
            },
        }
        await self.document_repository.commit()
        await self.document_repository.refresh(document)
        return snapshot

    async def _already_indexed(
        self,
        document: Document,
        chunks: list[DocumentChunk],
        index_snapshot: IndexSnapshot,
    ) -> bool:
        return (
            document.index_state == DocumentIndexState.INDEXED.value
            and document.embedding_model == self.settings.gemini_embedding_model
            and document.embedding_dimension
            == self.settings.gemini_embedding_dimension
            and index_snapshot.status == VectorIndexState.READY
            and all(
                chunk.embedding_status == "EMBEDDED"
                and chunk.embedding_model == self.settings.gemini_embedding_model
                and chunk.embedding_dimension
                == self.settings.gemini_embedding_dimension
                for chunk in chunks
            )
        )

    def _vector_record(
        self,
        document: Document,
        chunk: DocumentChunk,
        vector: list[float],
    ) -> VectorRecord:
        return VectorRecord(
            chunk_id=chunk.id,
            document_id=document.id,
            chunk_index=chunk.chunk_index,
            filename=document.original_filename,
            source_type=document.file_type,
            page_number=chunk.page_number,
            section_title=chunk.section_title,
            section_hierarchy=list(chunk.section_hierarchy),
            vector=vector,
        )

    def _set_index_state(
        self,
        document: Document,
        *,
        state: DocumentIndexState,
        stage: str,
        started_at: datetime | None = None,
        completed_at: datetime | None = None,
        duration_ms: float | None = None,
        total_chunks: int = 0,
        embedded_chunks: int = 0,
        vector_count: int = 0,
        index_version: str | None = None,
        error: dict[str, Any] | None = None,
    ) -> None:
        document.document_metadata = {
            **document.document_metadata,
            "indexing": {
                "state": state.value,
                "stage": stage,
                "started_at": started_at.isoformat() if started_at else None,
                "completed_at": completed_at.isoformat()
                if completed_at
                else None,
                "duration_ms": duration_ms,
                "total_chunks": total_chunks,
                "embedded_chunks": embedded_chunks,
                "vector_count": vector_count,
                "embedding_model": self.settings.gemini_embedding_model,
                "embedding_dimension": self.settings.gemini_embedding_dimension,
                "index_version": index_version,
                "error": error,
            },
        }

    def _set_processing_stage(
        self,
        document: Document,
        state: DocumentProcessingState,
        stage: str,
    ) -> None:
        processing = dict(document.processing_info)
        processing["state"] = state.value
        processing["stage"] = stage
        document.document_metadata = {
            **document.document_metadata,
            "processing": processing,
        }

    async def _mark_not_configured(
        self, document: Document, total_chunks: int
    ) -> None:
        if document.index_state == DocumentIndexState.INDEXED.value:
            return
        self._set_index_state(
            document,
            state=DocumentIndexState.NOT_CONFIGURED,
            stage="not_configured",
            total_chunks=total_chunks,
        )

    async def _mark_indexing_failure(
        self,
        document: Document,
        exc: Exception,
        *,
        duration_ms: float,
        chunks: list[DocumentChunk],
    ) -> None:
        try:
            await self.chunk_repository.mark_embedding_failed(chunks)
        except Exception:
            await self.session.rollback()
            document = await self.document_repository.get(document.id) or document

        code = getattr(exc, "code", "INDEXING_FAILED")
        retryable = bool(getattr(exc, "retryable", False))
        details = getattr(exc, "details", {})
        error = {
            "code": str(code),
            "message": str(exc)[:500] or "Document indexing failed.",
            "stage": "indexing",
            "details": details if isinstance(details, dict) else {},
            "retryable": retryable,
        }
        self._set_index_state(
            document,
            state=DocumentIndexState.FAILED,
            stage="failed",
            total_chunks=len(chunks),
            embedded_chunks=0,
            vector_count=0,
            duration_ms=duration_ms,
            error=error,
        )
        document.status = DocumentStatus.FAILED.value
        document.updated_timestamp = utc_now()
        try:
            await self.document_repository.commit()
            await self.document_repository.refresh(document)
        except Exception:
            await self.session.rollback()
            logger.exception(
                "document.indexing_failure_persistence_failed",
                extra={"document_id": str(document.id)},
            )
        logger.warning(
            "document.indexing_failed",
            extra={
                "document_id": str(document.id),
                "error_code": str(code),
                "duration_ms": duration_ms,
            },
        )

    def _document_indexing_info(self, document: Document) -> DocumentIndexingInfo:
        return DocumentIndexingInfo.model_validate(document.indexing_info)

    def _index_status_response(
        self, snapshot: IndexSnapshot
    ) -> VectorIndexStatusResponse:
        return VectorIndexStatusResponse(
            status=snapshot.status,
            model=self.settings.gemini_embedding_model,
            dimension=self.settings.gemini_embedding_dimension,
            metric="cosine",
            vector_count=snapshot.vector_count,
            indexed_documents=snapshot.indexed_documents,
            storage_path=str(self.settings.faiss_dir),
            version=snapshot.version,
            created_at=snapshot.created_at,
            updated_at=snapshot.updated_at,
            recovered=snapshot.recovered,
            detail=snapshot.detail,
        )

    def _parse_datetime(self, value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
