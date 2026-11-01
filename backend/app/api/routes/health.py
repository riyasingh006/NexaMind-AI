from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.dependencies.database import get_session
from app.schemas.health import HealthResponse, LivenessResponse, ReadinessResponse
from app.services.system_service import SystemService
from app.utils.datetime import utc_now

router = APIRouter()


@router.get("", response_model=HealthResponse)
async def health(session: AsyncSession = Depends(get_session)) -> HealthResponse:
    return await SystemService().health(session)


@router.get("/live", response_model=LivenessResponse)
async def liveness() -> LivenessResponse:
    settings = get_settings()
    return LivenessResponse(
        service=settings.app_name,
        version=settings.app_version,
        timestamp=utc_now(),
    )


@router.get("/ready", response_model=ReadinessResponse)
async def readiness(
    session: AsyncSession = Depends(get_session),
) -> ReadinessResponse | JSONResponse:
    response = await SystemService().readiness(session)
    if response.status != "ready":
        return JSONResponse(
            status_code=503,
            content=response.model_dump(mode="json"),
        )
    return response
