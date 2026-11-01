from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.database import get_session
from app.schemas.retrieval import (
    RetrievalInspectRequest,
    RetrievalInspectResponse,
)
from app.services.retrieval_inspection_service import RetrievalInspectionService

router = APIRouter()


@router.post("/inspect", response_model=RetrievalInspectResponse)
async def inspect_retrieval(
    request: RetrievalInspectRequest,
    session: AsyncSession = Depends(get_session),
) -> RetrievalInspectResponse:
    return await RetrievalInspectionService(session).inspect(request)
