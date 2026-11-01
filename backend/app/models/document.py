from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, CheckConstraint, Index, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.database.types import UTCDateTime
from app.utils.datetime import utc_now

if TYPE_CHECKING:
    from app.models.document_chunk import DocumentChunk


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'processing', 'indexed', 'failed')",
            name="document_status",
        ),
        CheckConstraint(
            "file_type IN ('PDF', 'TXT', 'MD')",
            name="document_file_type",
        ),
        Index("ix_documents_status_upload_timestamp", "status", "upload_timestamp"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(8), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="queued", index=True
    )
    upload_timestamp: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utc_now, index=True
    )
    updated_timestamp: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utc_now, onupdate=utc_now
    )
    total_chunks: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    document_metadata: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSON, nullable=False, default=dict
    )
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    chunks: Mapped[list["DocumentChunk"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="DocumentChunk.chunk_index",
    )

    @property
    def processing_info(self) -> dict[str, Any]:
        value = self.document_metadata.get("processing", {})
        return value if isinstance(value, dict) else {}

    @property
    def processing_state(self) -> str | None:
        value = self.processing_info.get("state")
        return value if isinstance(value, str) else None

    @property
    def processing_stage(self) -> str | None:
        value = self.processing_info.get("stage")
        return value if isinstance(value, str) else None

    @property
    def page_count(self) -> int | None:
        value = self.processing_info.get("page_count")
        return value if isinstance(value, int) else None

    @property
    def total_characters(self) -> int:
        value = self.processing_info.get("total_characters")
        return value if isinstance(value, int) else 0

    @property
    def processing_duration_ms(self) -> float | None:
        value = self.processing_info.get("duration_ms")
        return float(value) if isinstance(value, int | float) else None

    @property
    def chunking_strategy(self) -> str | None:
        value = self.processing_info.get("chunking_strategy")
        return value if isinstance(value, str) else None

    @property
    def processing_warnings(self) -> list[dict[str, Any]]:
        value = self.processing_info.get("warnings", [])
        return value if isinstance(value, list) else []

    @property
    def processing_failure(self) -> dict[str, Any] | None:
        value = self.processing_info.get("error")
        return value if isinstance(value, dict) else None

    @property
    def indexing_info(self) -> dict[str, Any]:
        value = self.document_metadata.get("indexing", {})
        return value if isinstance(value, dict) else {}

    @property
    def index_state(self) -> str | None:
        value = self.indexing_info.get("state")
        return value if isinstance(value, str) else None

    @property
    def index_stage(self) -> str | None:
        value = self.indexing_info.get("stage")
        return value if isinstance(value, str) else None

    @property
    def embedded_chunks(self) -> int:
        value = self.indexing_info.get("embedded_chunks")
        return value if isinstance(value, int) else 0

    @property
    def vector_count(self) -> int:
        value = self.indexing_info.get("vector_count")
        return value if isinstance(value, int) else 0

    @property
    def embedding_model(self) -> str | None:
        value = self.indexing_info.get("embedding_model")
        return value if isinstance(value, str) else None

    @property
    def embedding_dimension(self) -> int | None:
        value = self.indexing_info.get("embedding_dimension")
        return value if isinstance(value, int) else None

    @property
    def indexed_at(self) -> str | None:
        value = self.indexing_info.get("completed_at")
        return value if isinstance(value, str) else None

    @property
    def indexing_duration_ms(self) -> float | None:
        value = self.indexing_info.get("duration_ms")
        return float(value) if isinstance(value, int | float) else None

    @property
    def indexing_failure(self) -> dict[str, Any] | None:
        value = self.indexing_info.get("error")
        return value if isinstance(value, dict) else None

    @property
    def content_preview(self) -> str | None:
        value = self.document_metadata.get("preview")
        return value if isinstance(value, str) else None
