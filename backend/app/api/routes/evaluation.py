from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.database import get_session
from app.schemas.retrieval import (
    GroundednessEvaluationRequest,
    GroundednessEvaluationResponse,
)
from app.services.retrieval_inspection_service import RetrievalInspectionService

router = APIRouter()


@router.post("/groundedness", response_model=GroundednessEvaluationResponse)
async def evaluate_groundedness(
    request: GroundednessEvaluationRequest,
    session: AsyncSession = Depends(get_session),
) -> GroundednessEvaluationResponse:
    return await RetrievalInspectionService(session).evaluate_groundedness(
        request
    )
