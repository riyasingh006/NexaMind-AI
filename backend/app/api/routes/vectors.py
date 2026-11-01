from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.database import get_session
from app.schemas.embedding import (
    VectorIndexRebuildRequest,
    VectorIndexRebuildResponse,
    VectorIndexStatusResponse,
    VectorSearchRequest,
    VectorSearchResponse,
    VectorStatisticsResponse,
)
from app.services.document_indexing_service import DocumentIndexingService

router = APIRouter()


@router.get("/index/status", response_model=VectorIndexStatusResponse)
async def vector_index_status(
    session: AsyncSession = Depends(get_session),
) -> VectorIndexStatusResponse:
    return await DocumentIndexingService(session).index_status()


@router.post("/search", response_model=VectorSearchResponse)
async def search_vectors(
    request: VectorSearchRequest,
    session: AsyncSession = Depends(get_session),
) -> VectorSearchResponse:
    return await DocumentIndexingService(session).search(request)


@router.post("/index/rebuild", response_model=VectorIndexRebuildResponse)
async def rebuild_vector_index(
    request: VectorIndexRebuildRequest,
    session: AsyncSession = Depends(get_session),
) -> VectorIndexRebuildResponse:
    return await DocumentIndexingService(session).rebuild_index(
        request.document_ids or None
    )


@router.get("/statistics", response_model=VectorStatisticsResponse)
async def vector_statistics(
    session: AsyncSession = Depends(get_session),
) -> VectorStatisticsResponse:
    return await DocumentIndexingService(session).statistics()
