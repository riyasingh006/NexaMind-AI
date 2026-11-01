from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.database import get_session
from app.schemas.system import SystemHealthResponse
from app.services.system_service import SystemService

router = APIRouter()


@router.get("/status", response_model=SystemHealthResponse)
async def system_status(
    session: AsyncSession = Depends(get_session),
) -> SystemHealthResponse:
    return await SystemService().system_status(session)
