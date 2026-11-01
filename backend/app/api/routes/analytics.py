from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.database import get_session
from app.schemas.analytics import (
    AnalyticsRange,
    DashboardAnalyticsResponse,
    DocumentAnalyticsResponse,
    RetrievalAnalyticsResponse,
)
from app.services.analytics_service import AnalyticsService

router = APIRouter()


@router.get("/dashboard", response_model=DashboardAnalyticsResponse)
async def dashboard(
    time_range: AnalyticsRange = Query(default="30d", alias="range"),
    session: AsyncSession = Depends(get_session),
) -> DashboardAnalyticsResponse:
    return await AnalyticsService(session).dashboard(time_range)


@router.get("/retrieval", response_model=RetrievalAnalyticsResponse)
async def retrieval(
    time_range: AnalyticsRange = Query(default="30d", alias="range"),
    session: AsyncSession = Depends(get_session),
) -> RetrievalAnalyticsResponse:
    return await AnalyticsService(session).retrieval(time_range)


@router.get("/documents", response_model=DocumentAnalyticsResponse)
async def documents(
    time_range: AnalyticsRange = Query(default="30d", alias="range"),
    session: AsyncSession = Depends(get_session),
) -> DocumentAnalyticsResponse:
    return await AnalyticsService(session).documents(time_range)
