import asyncio
import logging
import time
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.graph import (
    AgentEventSink,
    AgentGraphDependencies,
    build_agent_graph,
)
from app.agent.services.gemini_generation_service import (
    GeminiGenerationService,
)
from app.agent.state import (
    AgentErrorData,
    AgentRunInput,
    AgentRunResult,
    AgentState,
    CitationData,
    EvidenceStatus,
    QueryIntent,
    RetrievedChunkData,
    ValidationStatus,
)
from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.repositories.document_repository import DocumentRepository
from app.services.document_indexing_service import DocumentIndexingService

logger = logging.getLogger(__name__)


class AgentExecutionTimeoutError(AppError):
    status_code = 504
    code = "AGENT_TIMEOUT"


class AgentExecutionError(AppError):
    status_code = 500
    code = "AGENT_EXECUTION_FAILED"


class AgentService:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings | None = None,
        *,
        generation_service: GeminiGenerationService | None = None,
        indexing_service: DocumentIndexingService | None = None,
        document_repository: DocumentRepository | None = None,
    ) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self.generation_service = generation_service or GeminiGenerationService(
            self.settings
        )
        self.indexing_service = indexing_service or DocumentIndexingService(
            self.session,
            self.settings,
        )
        self.document_repository = document_repository or DocumentRepository(
            self.session
        )

    async def run(self, run_input: AgentRunInput) -> AgentRunResult:
        return await self._run_graph(
            run_input,
            event_sink=None,
            streaming_generation=False,
        )

    async def run_stream(
        self,
        run_input: AgentRunInput,
        event_sink: AgentEventSink,
    ) -> AgentRunResult:
        return await self._run_graph(
            run_input,
            event_sink=event_sink,
            streaming_generation=True,
        )

    async def _run_graph(
        self,
        run_input: AgentRunInput,
        *,
        event_sink: AgentEventSink | None,
        streaming_generation: bool,
    ) -> AgentRunResult:
        started = time.perf_counter()
        initial_state = self._initial_state(run_input)
        dependencies = AgentGraphDependencies(
            settings=self.settings,
            document_repository=self.document_repository,
            indexing_service=self.indexing_service,
            generation_service=self.generation_service,
            event_sink=event_sink,
            streaming_generation=streaming_generation,
        )
        graph = build_agent_graph(dependencies)
        recursion_limit = max(20, (self.settings.documind_agent_max_retries + 2) * 5)
        try:
            final_state = await asyncio.wait_for(
                graph.ainvoke(
                    initial_state,
                    config={"recursion_limit": recursion_limit},
                ),
                timeout=self.settings.documind_agent_timeout_seconds,
            )
        except TimeoutError as exc:
            logger.warning(
                "agent.execution_timeout",
                extra={
                    "component": "agent",
                    "conversation_id": initial_state.get("conversation_id"),
                },
            )
            raise AgentExecutionTimeoutError(
                "The document agent timed out before completing the request.",
            ) from exc

        result = self._build_result(
            final_state,
            temperature=run_input.temperature,
            processing_time_ms=round(
                (time.perf_counter() - started) * 1000, 2
            ),
        )
        logger.info(
            "agent.execution_completed",
            extra={
                "component": "agent",
                "conversation_id": initial_state.get("conversation_id"),
                "query_intent": result.query_intent.value,
                "evidence_status": result.evidence_status.value,
                "validation_status": result.validation_status.value,
                "retry_count": result.retry_count,
                "streamed": streaming_generation,
                "duration_ms": result.processing_time_ms,
            },
        )
        return result

    def _initial_state(self, run_input: AgentRunInput) -> AgentState:
        return {
            "request_id": run_input.request_id,
            "user_query": run_input.user_query,
            "original_query": run_input.user_query,
            "conversation_id": (
                str(run_input.conversation_id)
                if run_input.conversation_id
                else None
            ),
            "conversation_history": list(run_input.conversation_history),
            "document_ids": [str(value) for value in run_input.document_ids],
            "top_k": run_input.top_k or self.settings.documind_rag_top_k,
            "similarity_threshold": (
                run_input.similarity_threshold
                if run_input.similarity_threshold is not None
                else self.settings.documind_rag_similarity_threshold
            ),
            "retrieved_chunks": [],
            "filtered_chunks": [],
            "citations": [],
            "retrieval_queries": [],
            "validation_issues": [],
            "groundedness_report": {},
            "groundedness_retry_count": 0,
            "groundedness_issues": [],
            "evidence_coverage": {},
            "retry_count": 0,
            "processing_metadata": {
                "request_id": run_input.request_id,
                "temperature": run_input.temperature,
            },
        }

    def _build_result(
        self,
        state: AgentState,
        *,
        temperature: float,
        processing_time_ms: float,
    ) -> AgentRunResult:
        answer = str(state.get("final_answer", "")).strip()
        if not answer:
            raise AgentExecutionError(
                "The document agent did not produce a response."
            )
        try:
            evidence_status = EvidenceStatus(
                str(state.get("evidence_status", EvidenceStatus.INSUFFICIENT.value))
            )
        except ValueError:
            evidence_status = EvidenceStatus.INSUFFICIENT
        try:
            validation_status = ValidationStatus(
                str(state.get("validation_status", ValidationStatus.FAILED.value))
            )
        except ValueError:
            validation_status = ValidationStatus.FAILED
        try:
            query_intent = QueryIntent(
                str(state.get("query_intent", QueryIntent.FACTUAL_LOOKUP.value))
            )
        except ValueError:
            query_intent = QueryIntent.FACTUAL_LOOKUP

        metadata = {
            **state.get("processing_metadata", {}),
            "temperature": temperature,
            "agent_processing_time_ms": processing_time_ms,
        }
        retrieval_error = state.get("retrieval_error")
        if retrieval_error:
            metadata["retrieval_error"] = self._safe_error(retrieval_error)

        return AgentRunResult(
            answer=answer,
            evidence_status=evidence_status,
            citations=list(state.get("citations", [])),
            rewritten_query=str(
                state.get("rewritten_query")
                or state.get("analyzed_query")
                or state.get("user_query", "")
            ),
            query_intent=query_intent,
            query_rewritten=bool(metadata.get("query_rewritten", False)),
            retrieval_queries=list(state.get("retrieval_queries", [])),
            retrieved_chunks=list(state.get("retrieved_chunks", [])),
            filtered_chunks=list(state.get("filtered_chunks", [])),
            context_token_count=int(
                metadata.get("context_token_count", 0)
            ),
            validation_status=validation_status,
            groundedness=(
                dict(state.get("groundedness_report", {})) or None
            ),
            evidence_coverage=dict(state.get("evidence_coverage", {})),
            retry_count=int(state.get("retry_count", 0)),
            processing_metadata=metadata,
            generation_model=(
                self.settings.gemini_generation_model
                if state.get("generation_result")
                else None
            ),
            processing_time_ms=processing_time_ms,
        )

    @staticmethod
    def _safe_error(error: AgentErrorData) -> dict[str, Any]:
        return {
            "code": error.get("code", "AGENT_ERROR"),
            "category": error.get("category", "AGENT"),
            "message": error.get("message", "The document agent failed."),
            "retryable": bool(error.get("retryable", False)),
        }


def citations_for_response(
    citations: list[CitationData],
) -> list[dict[str, Any]]:
    return [dict(citation) for citation in citations]


def chunks_for_response(
    chunks: list[RetrievedChunkData],
) -> list[dict[str, Any]]:
    return [dict(chunk) for chunk in chunks]

