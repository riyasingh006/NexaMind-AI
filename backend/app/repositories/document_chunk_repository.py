import hashlib
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import case, delete, func, select

from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.processing.models import ChunkDraft
from app.repositories.base import BaseRepository


@dataclass(frozen=True)
class ChunkAggregate:
    total_chunks: int
    total_characters: int
    average_characters: float
    documents_with_chunks: int


@dataclass(frozen=True)
class EmbeddingAggregate:
    total_chunks: int
    embedded_chunks: int
    pending_chunks: int
    failed_chunks: int
    documents_indexed: int
    last_embedded_at: datetime | None


class DocumentChunkRepository(BaseRepository):
    async def add_many(
        self,
        document_id: UUID,
        drafts: list[ChunkDraft],
        *,
        filename: str,
        source_type: str,
    ) -> list[DocumentChunk]:
        chunks: list[DocumentChunk] = []
        for index, draft in enumerate(drafts):
            chunk_id = uuid4()
            chunks.append(
                DocumentChunk(
                    id=chunk_id,
                    document_id=document_id,
                    chunk_index=index,
                    content=draft.content,
                    content_hash=hashlib.sha256(
                        draft.content.encode("utf-8")
                    ).hexdigest(),
                    character_count=len(draft.content),
                    token_count_estimate=draft.token_count_estimate,
                    page_number=draft.page_number,
                    section_title=draft.section_title,
                    section_hierarchy=list(draft.section_hierarchy),
                    start_offset=draft.start_offset,
                    end_offset=draft.end_offset,
                    chunk_metadata={
                        **draft.metadata,
                        "chunk_id": str(chunk_id),
                        "document_id": str(document_id),
                        "filename": filename,
                        "source_type": source_type,
                        "block_kinds": list(draft.block_kinds),
                    },
                )
            )
        self.session.add_all(chunks)
        await self.session.flush()
        return chunks

    async def list_for_document(
        self,
        document_id: UUID,
        *,
        limit: int = 100,
        offset: int = 0,
    ) -> list[DocumentChunk]:
        result = await self.session.scalars(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document_id)
            .order_by(DocumentChunk.chunk_index)
            .limit(limit)
            .offset(offset)
        )
        return list(result.all())

    async def list_for_retrieval(
        self,
        *,
        document_ids: list[UUID] | None = None,
        limit: int = 20000,
    ) -> list[DocumentChunk]:
        filters = [
            Document.status == "indexed",
            DocumentChunk.embedding_status == "EMBEDDED",
        ]
        if document_ids:
            filters.append(DocumentChunk.document_id.in_(document_ids))
        result = await self.session.scalars(
            select(DocumentChunk)
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(*filters)
            .order_by(DocumentChunk.document_id, DocumentChunk.chunk_index)
            .limit(limit)
        )
        return list(result.all())

    async def get_neighbors(
        self,
        *,
        document_id: UUID,
        chunk_indexes: list[int],
        radius: int = 1,
    ) -> list[DocumentChunk]:
        if not chunk_indexes:
            return []
        ranges = []
        for index in chunk_indexes:
            ranges.append(
                (DocumentChunk.chunk_index >= max(0, index - radius))
                & (DocumentChunk.chunk_index <= index + radius)
            )
        condition = ranges[0]
        for item in ranges[1:]:
            condition = condition | item
        result = await self.session.scalars(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document_id)
            .where(condition)
            .order_by(DocumentChunk.chunk_index)
        )
        return list(result.all())

    async def count_for_document(self, document_id: UUID) -> int:
        statement = select(func.count(DocumentChunk.id)).where(
            DocumentChunk.document_id == document_id
        )
        return int((await self.session.execute(statement)).scalar_one())

    async def delete_for_document(self, document_id: UUID) -> None:
        await self.session.execute(
            delete(DocumentChunk).where(DocumentChunk.document_id == document_id)
        )

    async def get_by_ids(
        self, chunk_ids: list[UUID], *, document_id: UUID | None = None
    ) -> list[DocumentChunk]:
        if not chunk_ids:
            return []
        filters = [DocumentChunk.id.in_(chunk_ids)]
        if document_id is not None:
            filters.append(DocumentChunk.document_id == document_id)
        result = await self.session.scalars(
            select(DocumentChunk)
            .where(*filters)
            .order_by(DocumentChunk.document_id, DocumentChunk.chunk_index)
        )
        return list(result.all())

    async def mark_embedded(
        self,
        chunks: list[DocumentChunk],
        *,
        model: str,
        dimension: int,
        embedded_at: datetime,
    ) -> None:
        for chunk in chunks:
            chunk.embedding_status = "EMBEDDED"
            chunk.embedding_model = model
            chunk.embedding_dimension = dimension
            chunk.embedded_at = embedded_at
        await self.session.flush()

    async def mark_embedding_failed(self, chunks: list[DocumentChunk]) -> None:
        for chunk in chunks:
            chunk.embedding_status = "FAILED"
        await self.session.flush()

    async def embedding_aggregate(self) -> EmbeddingAggregate:
        statement = select(
            func.count(DocumentChunk.id),
            func.coalesce(
                func.sum(
                    case((DocumentChunk.embedding_status == "EMBEDDED", 1), else_=0)
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case((DocumentChunk.embedding_status == "PENDING", 1), else_=0)
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case((DocumentChunk.embedding_status == "FAILED", 1), else_=0)
                ),
                0,
            ),
            func.count(
                func.distinct(
                    case(
                        (DocumentChunk.embedding_status == "EMBEDDED", DocumentChunk.document_id),
                        else_=None,
                    )
                )
            ),
            func.max(DocumentChunk.embedded_at),
        )
        row = (await self.session.execute(statement)).one()
        return EmbeddingAggregate(
            total_chunks=int(row[0]),
            embedded_chunks=int(row[1]),
            pending_chunks=int(row[2]),
            failed_chunks=int(row[3]),
            documents_indexed=int(row[4]),
            last_embedded_at=row[5],
        )

    async def statistics(self) -> ChunkAggregate:
        statement = select(
            func.count(DocumentChunk.id),
            func.coalesce(func.sum(DocumentChunk.character_count), 0),
            func.count(func.distinct(DocumentChunk.document_id)),
        )
        total_chunks, total_characters, documents_with_chunks = (
            await self.session.execute(statement)
        ).one()
        normalized_chunks = int(total_chunks)
        normalized_characters = int(total_characters)
        average = (
            normalized_characters / normalized_chunks if normalized_chunks else 0.0
        )
        return ChunkAggregate(
            total_chunks=normalized_chunks,
            total_characters=normalized_characters,
            average_characters=average,
            documents_with_chunks=int(documents_with_chunks),
        )
