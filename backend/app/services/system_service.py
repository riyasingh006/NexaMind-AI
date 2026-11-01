import asyncio
import logging
import time
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.schemas.common import IntegrationStatus, VectorIndexState
from app.schemas.health import ComponentHealth, HealthResponse, ReadinessResponse
from app.schemas.system import SystemHealthResponse
from app.services.vector_index_service import IndexSnapshot, VectorIndexService
from app.utils.datetime import utc_now

logger = logging.getLogger(__name__)
APP_STARTED_AT = time.monotonic()


class SystemService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    async def health(self, session: AsyncSession) -> HealthResponse:
        database_available, database_latency = await self._check_database(session)
        components = await self._components(database_available, database_latency)
        status = "ok" if database_available else "degraded"

        return HealthResponse(
            status=status,
            service=self.settings.app_name,
            version=self.settings.app_version,
            environment=self.settings.app_env,
            timestamp=utc_now(),
            uptime_seconds=round(time.monotonic() - APP_STARTED_AT, 3),
            components=components,
        )

    async def readiness(self, session: AsyncSession) -> ReadinessResponse:
        database_available, database_latency = await self._check_database(session)
        components = await self._components(database_available, database_latency)
        return ReadinessResponse(
            status="ready" if database_available else "not_ready",
            service=self.settings.app_name,
            version=self.settings.app_version,
            timestamp=utc_now(),
            components=components,
        )

    def liveness(self) -> datetime:
        return utc_now()

    async def system_status(
        self, session: AsyncSession
    ) -> SystemHealthResponse:
        database_available, database_latency = await self._check_database(session)
        return SystemHealthResponse(
            status="operational" if database_available else "degraded",
            service=self.settings.app_name,
            version=self.settings.app_version,
            environment=self.settings.app_env,
            timestamp=utc_now(),
            next_phase=(
                "Phase 6: SSE token streaming, retrieval analytics, and "
                "production authentication and deployment."
            ),
            components=await self._components(
                database_available, database_latency
            ),
        )

    async def _check_database(self, session: AsyncSession) -> tuple[bool, float | None]:
        started_at = time.perf_counter()
        try:
            await session.execute(text("SELECT 1"))
            latency = round((time.perf_counter() - started_at) * 1000, 2)
            return True, latency
        except SQLAlchemyError:
            logger.warning("system.database_check_failed", extra={"component": "database"})
            return False, None

    async def _components(
        self, database_available: bool, database_latency: float | None
    ) -> list[ComponentHealth]:
        gemini_configured = self.settings.gemini_configured
        gemini_status = (
            IntegrationStatus.OPERATIONAL
            if gemini_configured
            else IntegrationStatus.NOT_CONFIGURED
        )
        gemini_detail = (
            "A Gemini API key is configured; connectivity is verified when "
            "an embedding request runs."
            if gemini_configured
            else "DOCUMIND_GEMINI_API_KEY is not configured."
        )
        try:
            index_snapshot = await asyncio.to_thread(
                VectorIndexService(self.settings).get_status
            )
        except Exception:
            logger.exception("system.vector_index_check_failed")
            index_snapshot = None
        index_status, index_detail = self._vector_index_component(index_snapshot)

        return [
            ComponentHealth(
                name="api",
                status=IntegrationStatus.OPERATIONAL,
                detail="FastAPI application and request pipeline are operational.",
            ),
            ComponentHealth(
                name="database",
                status=(
                    IntegrationStatus.OPERATIONAL
                    if database_available
                    else IntegrationStatus.UNAVAILABLE
                ),
                detail=(
                    "SQLAlchemy database connectivity check succeeded."
                    if database_available
                    else "SQLAlchemy database connectivity check failed."
                ),
                latency_ms=database_latency,
            ),
            ComponentHealth(
                name="gemini",
                status=gemini_status,
                detail=gemini_detail,
            ),
            ComponentHealth(
                name="embeddings",
                status=gemini_status,
                detail=(
                    f"Model {self.settings.gemini_embedding_model} is configured "
                    f"at {self.settings.gemini_embedding_dimension} dimensions; "
                    "requests report failures explicitly."
                    if gemini_configured
                    else "DOCUMIND_GEMINI_API_KEY is not configured."
                ),
            ),
            ComponentHealth(
                name="document_pipeline",
                status=IntegrationStatus.OPERATIONAL,
                detail=(
                    "PDF, TXT, and Markdown validation, extraction, preprocessing, "
                    "structure-aware chunking, and Gemini/FAISS indexing are available."
                ),
            ),
            ComponentHealth(
                name="vector_index",
                status=index_status,
                detail=index_detail,
            ),
            ComponentHealth(
                name="orchestration",
                status=(
                    IntegrationStatus.OPERATIONAL
                    if gemini_configured
                    else IntegrationStatus.NOT_CONFIGURED
                ),
                detail=(
                    "LangGraph query analysis, rewriting, evidence evaluation, "
                    "grounded generation, citation validation, and safe abstention "
                    "are available. SSE token streaming is not implemented."
                    if gemini_configured
                    else (
                        "LangGraph orchestration is implemented but requires "
                        "DOCUMIND_GEMINI_API_KEY for answer generation."
                    )
                ),
            ),
        ]

    def _vector_index_component(
        self, snapshot: IndexSnapshot | None
    ) -> tuple[IntegrationStatus, str]:
        if snapshot is None:
            return (
                IntegrationStatus.UNAVAILABLE,
                "The vector index status could not be read.",
            )
        if snapshot.status == VectorIndexState.READY:
            return (
                IntegrationStatus.OPERATIONAL,
                f"FAISS index is ready with {snapshot.vector_count} vectors across "
                f"{snapshot.indexed_documents} documents.",
            )
        if snapshot.status == VectorIndexState.DEGRADED:
            return IntegrationStatus.DEGRADED, snapshot.detail
        if snapshot.status == VectorIndexState.INITIALIZING:
            return (
                IntegrationStatus.AWAITING_INTEGRATION
                if self.settings.gemini_configured
                else IntegrationStatus.NOT_CONFIGURED,
                "No FAISS index has been persisted yet.",
            )
        return IntegrationStatus.UNAVAILABLE, snapshot.detail
