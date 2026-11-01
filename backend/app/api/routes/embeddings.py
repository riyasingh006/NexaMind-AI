from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.database import get_session
from app.schemas.document import DocumentResponse
from app.schemas.embedding import (
    DocumentIndexResponse,
    EmbeddingGenerateRequest,
    EmbeddingStatusResponse,
)
from app.services.document_indexing_service import DocumentIndexingService

router = APIRouter()


@router.post("/generate", response_model=DocumentIndexResponse)
async def generate_embeddings(
    request: EmbeddingGenerateRequest,
    session: AsyncSession = Depends(get_session),
) -> DocumentIndexResponse:
    document, indexing = await DocumentIndexingService(session).index_document(
        request.document_id,
        force=request.force,
    )
    return DocumentIndexResponse(
        document=DocumentResponse.model_validate(document),
        indexing=indexing,
    )


@router.get("/status", response_model=EmbeddingStatusResponse)
async def embedding_status(
    session: AsyncSession = Depends(get_session),
) -> EmbeddingStatusResponse:
    return await DocumentIndexingService(session).embedding_status()
