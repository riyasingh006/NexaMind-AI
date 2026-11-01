import logging
import time
from typing import Any
from uuid import UUID

from app.core.exceptions import ConflictError, NotFoundError
from app.repositories.document_repository import DocumentRepository
from app.agent.state import AgentState

logger = logging.getLogger(__name__)


async def validate_document_scope(
    state: AgentState,
    *,
    document_repository: DocumentRepository,
) -> dict[str, Any]:
    started = time.perf_counter()
    raw_document_ids = list(state.get("document_ids", []))
    metadata = dict(state.get("processing_metadata", {}))

    if not raw_document_ids:
        return {
            "scope_document_ids": [],
            "scope_document_names": [],
            "scope_status": "ALL_INDEXED_DOCUMENTS",
            "processing_metadata": {
                **metadata,
                "scope_validated": True,
                "scope_document_count": 0,
                "scope_duration_ms": round(
                    (time.perf_counter() - started) * 1000, 2
                ),
            },
        }

    try:
        document_ids = [UUID(str(value)) for value in raw_document_ids]
    except ValueError as exc:
        raise NotFoundError(
            "One or more selected documents do not exist.",
            code="DOCUMENTS_NOT_FOUND",
        ) from exc

    existing_ids = await document_repository.exists_many(document_ids)
    missing = [
        str(document_id)
        for document_id in document_ids
        if document_id not in existing_ids
    ]
    if missing:
        raise NotFoundError(
            "One or more selected documents do not exist.",
            code="DOCUMENTS_NOT_FOUND",
            details={"missing_document_ids": missing},
        )

    documents = []
    for document_id in document_ids:
        document = await document_repository.get(document_id)
        if document is not None:
            documents.append(document)

    unavailable = [
        {
            "document_id": str(document.id),
            "filename": document.original_filename,
            "status": document.status,
        }
        for document in documents
        if document.status != "indexed"
    ]
    if unavailable:
        raise ConflictError(
            "All selected documents must be indexed before chatting.",
            code="DOCUMENTS_NOT_READY",
            details={"documents": unavailable},
        )

    logger.info(
        "agent.scope_validated",
        extra={
            "component": "agent",
            "conversation_id": state.get("conversation_id"),
            "document_count": len(documents),
        },
    )
    return {
        "scope_document_ids": [str(document.id) for document in documents],
        "scope_document_names": [
            document.original_filename for document in documents
        ],
        "scope_status": "READY",
        "processing_metadata": {
            **metadata,
            "scope_validated": True,
            "scope_document_count": len(documents),
            "scope_duration_ms": round(
                (time.perf_counter() - started) * 1000, 2
            ),
        },
    }
