from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.database import get_session
from app.schemas.common import DocumentFormat, DocumentStatus
from app.schemas.document import (
    DocumentChunkListResponse,
    DocumentChunkResponse,
    DocumentContentResponse,
    DocumentDeleteResponse,
    DocumentListResponse,
    DocumentProcessingStatistics,
    DocumentProcessingStatus,
    DocumentReindexResponse,
    DocumentReprocessResponse,
    DocumentResponse,
    DocumentUploadResponse,
)
from app.schemas.embedding import (
    DocumentIndexDeleteResponse,
    DocumentIndexResponse,
    DocumentIndexStatusResponse,
)
from app.services.document_indexing_service import DocumentIndexingService
from app.services.document_service import DocumentService

router = APIRouter()


@router.post(
    "/upload",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> DocumentUploadResponse:
    service = DocumentService(session)
    document, processing = await service.upload(file)
    document_response = DocumentResponse.model_validate(document)
    return DocumentUploadResponse(
        document=document_response,
        processing=processing,
        processing_state=document_response.processing_state,
        page_count=document_response.page_count,
        total_characters=document_response.total_characters,
        total_chunks=document_response.total_chunks,
        processing_duration_ms=document_response.processing_duration_ms,
        chunking_strategy=document_response.chunking_strategy,
        warnings=document_response.warnings,
        error=document_response.error,
    )


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    search: str | None = Query(default=None, max_length=200),
    document_status: DocumentStatus | None = Query(default=None, alias="status"),
    file_type: DocumentFormat | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> DocumentListResponse:
    service = DocumentService(session)
    documents, total = await service.list_documents(
        search=search,
        status=document_status,
        file_type=file_type,
        limit=limit,
        offset=offset,
    )
    return DocumentListResponse(
        items=[DocumentResponse.model_validate(document) for document in documents],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/processing/statistics",
    response_model=DocumentProcessingStatistics,
)
async def processing_statistics(
    session: AsyncSession = Depends(get_session),
) -> DocumentProcessingStatistics:
    return await DocumentService(session).processing_statistics()


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> DocumentResponse:
    document = await DocumentService(session).get_document(document_id)
    return DocumentResponse.model_validate(document)


@router.get(
    "/{document_id}/status",
    response_model=DocumentProcessingStatus,
)
async def get_document_status(
    document_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> DocumentProcessingStatus:
    service = DocumentService(session)
    document = await service.get_document(document_id)
    return service.processing_status(document)


@router.post(
    "/{document_id}/index",
    response_model=DocumentIndexResponse,
)
async def index_document(
    document_id: UUID,
    force: bool = Query(default=False),
    session: AsyncSession = Depends(get_session),
) -> DocumentIndexResponse:
    document, indexing = await DocumentIndexingService(session).index_document(
        document_id,
        force=force,
    )
    return DocumentIndexResponse(
        document=DocumentResponse.model_validate(document),
        indexing=indexing,
    )


@router.get(
    "/{document_id}/index/status",
    response_model=DocumentIndexStatusResponse,
)
async def get_document_index_status(
    document_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> DocumentIndexStatusResponse:
    return await DocumentIndexingService(session).document_index_status(document_id)


@router.delete(
    "/{document_id}/index",
    response_model=DocumentIndexDeleteResponse,
)
async def delete_document_index(
    document_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> DocumentIndexDeleteResponse:
    snapshot = await DocumentIndexingService(session).delete_document_index(
        document_id
    )
    return DocumentIndexDeleteResponse(
        message="Document vectors removed from the index",
        document_id=document_id,
        vector_count=snapshot.vector_count,
        index_version=snapshot.version,
    )


@router.get(
    "/{document_id}/chunks",
    response_model=DocumentChunkListResponse,
)
async def get_document_chunks(
    document_id: UUID,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> DocumentChunkListResponse:
    chunks, total = await DocumentService(session).get_chunks(
        document_id,
        limit=limit,
        offset=offset,
    )
    return DocumentChunkListResponse(
        document_id=document_id,
        items=[DocumentChunkResponse.model_validate(chunk) for chunk in chunks],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{document_id}/content",
    response_model=DocumentContentResponse,
)
async def get_document_content(
    document_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> DocumentContentResponse:
    return await DocumentService(session).get_content(document_id)


@router.post(
    "/{document_id}/reprocess",
    response_model=DocumentReprocessResponse,
)
async def reprocess_document(
    document_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> DocumentReprocessResponse:
    document, processing = await DocumentService(session).reprocess_document(
        document_id
    )
    return DocumentReprocessResponse(
        document=DocumentResponse.model_validate(document),
        processing=processing,
    )


@router.delete("/{document_id}", response_model=DocumentDeleteResponse)
async def delete_document(
    document_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> DocumentDeleteResponse:
    await DocumentService(session).delete_document(document_id)
    return DocumentDeleteResponse(
        message="Document deleted",
        document_id=document_id,
    )


@router.post(
    "/{document_id}/reindex",
    response_model=DocumentReindexResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def reindex_document(
    document_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> DocumentReindexResponse:
    processing = await DocumentService(session).reindex_document(document_id)
    return DocumentReindexResponse(processing=processing)
