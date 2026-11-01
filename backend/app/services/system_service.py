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
from app.services.provider_health import get_generation_health
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
                "Production authentication, authorization, and durable storage verification."
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
        gemini_status, gemini_detail = self._gemini_component(gemini_configured)
        try:
            index_snapshot = await asyncio.to_thread(
                VectorIndexService(self.settings).get_status
            )
        except Exception:
            logger.exception("system.vector_index_check_failed")
            index_snapshot = None
        index_status, index_detail = self._vector_index_component(index_snapshot)
        embeddings_status, embeddings_detail = self._embedding_component(
            index_snapshot,
            gemini_configured,
        )

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
                detail=self._database_detail(database_available),
                latency_ms=database_latency,
            ),
            ComponentHealth(
                name="gemini",
                status=gemini_status,
                detail=gemini_detail,
            ),
            ComponentHealth(
                name="embeddings",
                status=embeddings_status,
                detail=embeddings_detail,
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
                status=gemini_status,
                detail=self._orchestration_detail(
                    gemini_configured,
                    gemini_status,
                    gemini_detail,
                ),
            ),
        ]

    def _gemini_component(
        self, configured: bool
    ) -> tuple[IntegrationStatus, str]:
        if not configured:
            return (
                IntegrationStatus.NOT_CONFIGURED,
                "DOCUMIND_GEMINI_API_KEY is not configured.",
            )
        runtime = get_generation_health()
        if (
            runtime.model == self.settings.gemini_generation_model
            and runtime.status == "OPERATIONAL"
        ):
            return (
                IntegrationStatus.OPERATIONAL,
                f"Gemini text generation on {runtime.model} last succeeded in this worker.",
            )
        if (
            runtime.model == self.settings.gemini_generation_model
            and runtime.status == "DEGRADED"
        ):
            return (
                IntegrationStatus.DEGRADED,
                f"The latest Gemini generation request failed with {runtime.error_code}.",
            )
        return (
            IntegrationStatus.AWAITING_INTEGRATION,
            (
                f"A Gemini API key is configured for {self.settings.gemini_generation_model}; "
                "text generation has not yet succeeded in this worker."
            ),
        )

    def _embedding_component(
        self,
        snapshot: IndexSnapshot | None,
        configured: bool,
    ) -> tuple[IntegrationStatus, str]:
        if not configured:
            return (
                IntegrationStatus.NOT_CONFIGURED,
                "DOCUMIND_GEMINI_API_KEY is not configured.",
            )
        if snapshot is None:
            return (
                IntegrationStatus.UNAVAILABLE,
                "Embedding status could not be checked because FAISS is unavailable.",
            )
        if snapshot.status in {
            VectorIndexState.DEGRADED,
            VectorIndexState.FAILED,
            VectorIndexState.UNAVAILABLE,
        }:
            return (
                IntegrationStatus.DEGRADED,
                f"Embedding/indexing is degraded: {snapshot.detail}",
            )
        if (
            snapshot.status != VectorIndexState.READY
            or snapshot.vector_count <= 0
            or snapshot.indexed_documents <= 0
        ):
            return (
                IntegrationStatus.AWAITING_INTEGRATION,
                "The embedding model is configured; no successfully indexed vectors are available yet.",
            )
        return (
            IntegrationStatus.OPERATIONAL,
            (
                f"{snapshot.vector_count} vectors from {snapshot.indexed_documents} documents "
                f"are indexed with {self.settings.gemini_embedding_model} at "
                f"{self.settings.gemini_embedding_dimension} dimensions."
            ),
        )

    def _orchestration_detail(
        self,
        configured: bool,
        status: IntegrationStatus,
        gemini_detail: str,
    ) -> str:
        if not configured:
            return (
                "LangGraph orchestration is implemented but requires "
                "DOCUMIND_GEMINI_API_KEY for answer generation."
            )
        if status == IntegrationStatus.OPERATIONAL:
            return (
                "LangGraph analysis, retrieval, grounded generation, citation "
                "validation, safe abstention, and POST /chat/stream are implemented; "
                "Gemini generation has succeeded in this worker."
            )
        return (
            "LangGraph and POST /chat/stream are implemented, but grounded answers "
            f"are not verified: {gemini_detail}"
        )

    def _database_detail(self, available: bool) -> str:
        scheme = self.settings.database_url.partition(":")[0].lower()
        dialect = scheme.split("+", maxsplit=1)[0]
        name = {
            "postgres": "PostgreSQL",
            "postgresql": "PostgreSQL",
            "sqlite": "SQLite",
        }.get(dialect, "SQLAlchemy database")
        state = "connectivity check succeeded" if available else "connectivity check failed"
        return f"{name} {state}."

    def _vector_index_component(
        self, snapshot: IndexSnapshot | None
    ) -> tuple[IntegrationStatus, str]:
        if snapshot is None:
            return (
                IntegrationStatus.UNAVAILABLE,
                "The vector index status could not be read.",
            )
        if snapshot.status == VectorIndexState.READY:
            if snapshot.vector_count <= 0 or snapshot.indexed_documents <= 0:
                return (
                    IntegrationStatus.AWAITING_INTEGRATION
                    if self.settings.gemini_configured
                    else IntegrationStatus.NOT_CONFIGURED,
                    "The FAISS index is empty; index at least one document before retrieval.",
                )
            return (
                IntegrationStatus.OPERATIONAL,
                (
                    f"FAISS index is ready with {snapshot.vector_count} vectors across "
                    f"{snapshot.indexed_documents} documents."
                ),
            )
        if snapshot.status == VectorIndexState.DEGRADED:
            return IntegrationStatus.DEGRADED, snapshot.detail
        if snapshot.status == VectorIndexState.INITIALIZING:
            return (
                IntegrationStatus.AWAITING_INTEGRATION
                if self.settings.gemini_configured
                else IntegrationStatus.NOT_CONFIGURED,
                snapshot.detail,
            )
        return IntegrationStatus.UNAVAILABLE, snapshot.detail
