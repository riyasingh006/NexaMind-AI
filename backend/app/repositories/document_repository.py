from dataclasses import dataclass
from datetime import datetime
from typing import Sequence
from uuid import UUID

from sqlalchemy import case, func, or_, select

from app.models.document import Document
from app.repositories.base import BaseRepository
from app.schemas.common import DocumentFormat, DocumentStatus


@dataclass(frozen=True)
class DocumentAggregate:
    total_documents: int
    queued_documents: int
    processing_documents: int
    indexed_documents: int
    failed_documents: int
    total_chunks: int
    total_storage_bytes: int


class DocumentRepository(BaseRepository):
    async def add(self, document: Document) -> Document:
        self.session.add(document)
        await self.session.flush()
        return document

    async def get(self, document_id: UUID) -> Document | None:
        return await self.session.get(Document, document_id)

    async def get_by_checksum(self, checksum_sha256: str) -> Document | None:
        statement = (
            select(Document)
            .where(
                Document.document_metadata["checksum_sha256"].as_string()
                == checksum_sha256
            )
            .order_by(Document.upload_timestamp.asc())
            .limit(1)
        )
        return await self.session.scalar(statement)

    async def exists_many(self, document_ids: Sequence[UUID]) -> set[UUID]:
        if not document_ids:
            return set()
        result = await self.session.scalars(
            select(Document.id).where(Document.id.in_(document_ids))
        )
        return set(result.all())

    async def list(
        self,
        *,
        search: str | None = None,
        status: DocumentStatus | None = None,
        file_type: DocumentFormat | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[Document]:
        filters = self._filters(search=search, status=status, file_type=file_type)
        statement = (
            select(Document)
            .where(*filters)
            .order_by(Document.upload_timestamp.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.scalars(statement)
        return list(result.all())

    async def count(
        self,
        *,
        search: str | None = None,
        status: DocumentStatus | None = None,
        file_type: DocumentFormat | None = None,
    ) -> int:
        filters = self._filters(search=search, status=status, file_type=file_type)
        statement = select(func.count(Document.id)).where(*filters)
        return int((await self.session.execute(statement)).scalar_one())

    async def delete(self, document: Document) -> None:
        await self.session.delete(document)

    async def processing_metadata(self) -> Sequence[tuple[str, dict[str, object]]]:
        result = await self.session.execute(
            select(Document.status, Document.document_metadata)
        )
        return [(str(status), metadata or {}) for status, metadata in result.all()]

    async def statistics(self, since: datetime | None = None) -> DocumentAggregate:
        filters = [Document.upload_timestamp >= since] if since else []
        statement = select(
            func.count(Document.id),
            func.coalesce(
                func.sum(case((Document.status == "queued", 1), else_=0)), 0
            ),
            func.coalesce(
                func.sum(case((Document.status == "processing", 1), else_=0)), 0
            ),
            func.coalesce(
                func.sum(case((Document.status == "indexed", 1), else_=0)), 0
            ),
            func.coalesce(
                func.sum(case((Document.status == "failed", 1), else_=0)), 0
            ),
            func.coalesce(func.sum(Document.total_chunks), 0),
            func.coalesce(func.sum(Document.file_size), 0),
        ).where(*filters)
        row = (await self.session.execute(statement)).one()
        return DocumentAggregate(
            total_documents=int(row[0]),
            queued_documents=int(row[1]),
            processing_documents=int(row[2]),
            indexed_documents=int(row[3]),
            failed_documents=int(row[4]),
            total_chunks=int(row[5]),
            total_storage_bytes=int(row[6]),
        )

    def _filters(
        self,
        *,
        search: str | None,
        status: DocumentStatus | None,
        file_type: DocumentFormat | None,
    ) -> Sequence[object]:
        filters: list[object] = []
        if search:
            pattern = f"%{search.strip()}%"
            filters.append(
                or_(
                    Document.original_filename.ilike(pattern),
                    Document.filename.ilike(pattern),
                )
            )
        if status is not None:
            filters.append(Document.status == status.value)
        if file_type is not None:
            filters.append(Document.file_type == file_type.value)
        return filters
