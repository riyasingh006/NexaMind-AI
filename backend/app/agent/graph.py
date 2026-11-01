from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal

from langgraph.graph import END, START, StateGraph

from app.agent.nodes.abstention import abstain
from app.agent.nodes.answer_generator import (
    generate_answer,
    generate_answer_stream,
)
from app.agent.nodes.answer_validator import validate_answer
from app.agent.nodes.citation_finalizer import finalize_citations
from app.agent.nodes.context_filter import filter_context
from app.agent.nodes.document_scope import validate_document_scope
from app.agent.nodes.evidence_evaluator import evaluate_evidence
from app.agent.nodes.groundedness import verify_answer_groundedness
from app.agent.nodes.query_analyzer import analyze_query
from app.agent.nodes.query_rewriter import rewrite_query
from app.agent.nodes.retrieval import retrieve_documents
from app.agent.services.gemini_generation_service import (
    GeminiGenerationService,
)
from app.agent.state import AgentState, EvidenceStatus, ValidationStatus
from app.core.config import Settings
from app.repositories.document_repository import DocumentRepository

if TYPE_CHECKING:
    from app.services.document_indexing_service import DocumentIndexingService

logger = logging.getLogger(__name__)

AgentEventSink = Callable[[str, dict[str, Any]], None]


@dataclass(frozen=True)
class AgentGraphDependencies:
    settings: Settings
    document_repository: DocumentRepository
    indexing_service: DocumentIndexingService
    generation_service: GeminiGenerationService
    event_sink: AgentEventSink | None = None
    streaming_generation: bool = False


def route_after_analysis(state: AgentState) -> Literal["scope", "abstain"]:
    if state.get("out_of_scope") or not state.get("requires_retrieval", True):
        return "abstain"
    return "scope"


def route_after_evidence(
    state: AgentState,
) -> Literal["generate", "abstain"]:
    status = str(state.get("evidence_status", ""))
    if status in {
        EvidenceStatus.SUFFICIENT.value,
        EvidenceStatus.PARTIAL.value,
    }:
        return "generate"
    return "abstain"


def route_after_validation(
    state: AgentState,
) -> Literal["groundedness", "generate", "abstain"]:
    status = str(state.get("validation_status", ""))
    if status == ValidationStatus.VALID.value:
        return "groundedness"
    if status == ValidationStatus.INVALID.value:
        return "generate"
    return "abstain"


def route_after_groundedness(
    state: AgentState,
) -> Literal["generate", "finalize", "abstain"]:
    action = str(state.get("groundedness_action", "finalize"))
    if action == "correct":
        return "generate"
    if action == "abstain":
        return "abstain"
    return "finalize"


def build_agent_graph(
    dependencies: AgentGraphDependencies,
) -> Any:
    settings = dependencies.settings
    generation_service = dependencies.generation_service

    def emit(event: str, payload: dict[str, Any]) -> None:
        if dependencies.event_sink is None:
            return
        try:
            dependencies.event_sink(event, payload)
        except Exception:
            logger.exception("agent.stream_event_failed")

    async def analysis_node(state: AgentState) -> dict[str, Any]:
        result = await analyze_query(state)
        emit(
            "query_analyzed",
            {
                "intent": result.get("query_intent"),
                "requires_retrieval": bool(
                    result.get("requires_retrieval", True)
                ),
                "needs_rewrite": bool(result.get("needs_rewrite", False)),
                "out_of_scope": bool(result.get("out_of_scope", False)),
            },
        )
        return result

    async def scope_node(state: AgentState) -> dict[str, Any]:
        return await validate_document_scope(
            state,
            document_repository=dependencies.document_repository,
        )

    async def rewrite_node(state: AgentState) -> dict[str, Any]:
        return await rewrite_query(
            state,
            service=generation_service,
            max_retrieval_queries=settings.documind_rag_max_retrieval_queries,
        )

    async def retrieval_node(state: AgentState) -> dict[str, Any]:
        queries = [
            str(query)
            for query in state.get("retrieval_queries", [])
            if str(query).strip()
        ]
        if not queries:
            queries = [str(state.get("user_query", "")).strip()]
        document_ids = [
            str(value) for value in state.get("document_ids", [])
        ]
        emit(
            "retrieval_started",
            {
                "queries": queries,
                "document_ids": document_ids,
                "document_count": len(document_ids),
                "top_k": int(
                    state.get("top_k") or settings.documind_rag_top_k
                ),
                "similarity_threshold": float(
                    state.get("similarity_threshold")
                    if state.get("similarity_threshold") is not None
                    else settings.documind_rag_similarity_threshold
                ),
                "hybrid_search": settings.documind_rag_hybrid_search_enabled,
                "reranking": settings.documind_rag_reranking_enabled,
            },
        )
        result = await retrieve_documents(
            state,
            indexing_service=dependencies.indexing_service,
            default_top_k=settings.documind_rag_top_k,
            default_threshold=settings.documind_rag_similarity_threshold,
            max_retrieval_queries=settings.documind_rag_max_retrieval_queries,
            generation_service=generation_service,
            multi_query_enabled=settings.documind_rag_multi_query_enabled,
            hybrid_search_enabled=settings.documind_rag_hybrid_search_enabled,
            semantic_weight=settings.documind_rag_semantic_weight,
            lexical_weight=settings.documind_rag_lexical_weight,
            rrf_weight=settings.documind_rag_rrf_weight,
            rrf_k=settings.documind_rag_rrf_k,
            reranking_enabled=settings.documind_rag_reranking_enabled,
            rerank_top_k=settings.documind_rag_rerank_top_k,
            final_top_k=settings.documind_rag_final_top_k,
            neighbor_expansion_enabled=(
                settings.documind_rag_neighbor_expansion_enabled
            ),
        )
        metadata = result.get("processing_metadata", {})
        retrieval_error = result.get("retrieval_error")
        emit(
            "retrieval_completed",
            {
                "chunk_count": len(result.get("retrieved_chunks", [])),
                "candidate_count": int(
                    metadata.get("retrieval_fused_candidate_count", 0)
                ),
                "duration_ms": float(
                    metadata.get("retrieval_duration_ms", 0.0)
                ),
                "failed": retrieval_error is not None,
                "error": (
                    retrieval_error.get("code") if retrieval_error else None
                ),
                "strategy": metadata.get("retrieval_strategy"),
            },
        )
        emit(
            "reranking_completed",
            {
                "enabled": bool(
                    metadata.get("retrieval_reranking_enabled", False)
                ),
                "method": metadata.get(
                    "retrieval_rerank_method", "disabled"
                ),
                "error": metadata.get("retrieval_rerank_error"),
                "candidate_count": int(
                    metadata.get("retrieval_fused_candidate_count", 0)
                ),
                "result_count": len(result.get("retrieved_chunks", [])),
            },
        )
        return result

    async def filter_node(state: AgentState) -> dict[str, Any]:
        return await filter_context(
            state,
            max_context_chunks=settings.documind_rag_max_context_chunks,
        )

    async def evidence_node(state: AgentState) -> dict[str, Any]:
        result = await evaluate_evidence(
            state,
            max_context_chunks=settings.documind_rag_max_context_chunks,
            max_context_tokens=settings.documind_rag_max_context_tokens,
        )
        metadata = result.get("processing_metadata", {})
        coverage = result.get("evidence_coverage", {})
        emit(
            "evidence_evaluated",
            {
                "status": result.get("evidence_status"),
                "citation_count": len(result.get("citations", [])),
                "context_chunk_count": len(
                    result.get("filtered_chunks", [])
                ),
                "context_token_count": int(
                    metadata.get("context_token_count", 0)
                ),
                "coverage_status": coverage.get("status"),
                "coverage_score": coverage.get("score"),
            },
        )
        return result

    generation_attempts = 0

    async def generation_node(state: AgentState) -> dict[str, Any]:
        nonlocal generation_attempts
        generation_attempts += 1
        emit(
            "generation_started",
            {
                "mode": (
                    "initial" if generation_attempts == 1 else "correction"
                ),
                "replace": generation_attempts > 1,
                "attempt": generation_attempts,
                "model": generation_service.model,
            },
        )
        if dependencies.streaming_generation:
            token_index = 0

            async def emit_token(token: str) -> None:
                nonlocal token_index
                token_index += 1
                emit(
                    "token",
                    {
                        "token": token,
                        "generation": generation_attempts,
                        "index": token_index,
                    },
                )

            return await generate_answer_stream(
                state,
                service=generation_service,
                temperature=settings.gemini_generation_temperature,
                on_token=emit_token,
            )
        return await generate_answer(
            state,
            service=generation_service,
            temperature=settings.gemini_generation_temperature,
        )

    async def validation_node(state: AgentState) -> dict[str, Any]:
        return await validate_answer(
            state,
            max_retries=settings.documind_agent_max_retries,
        )

    async def groundedness_node(state: AgentState) -> dict[str, Any]:
        result = await verify_answer_groundedness(
            state,
            service=generation_service,
            enabled=settings.documind_groundedness_enabled,
            threshold=settings.documind_groundedness_threshold,
            max_retries=settings.documind_groundedness_max_retries,
        )
        report = result.get("groundedness_report", {})
        emit(
            "groundedness_completed",
            {
                "status": report.get("status"),
                "score": report.get("score"),
                "threshold": report.get("threshold"),
                "total_claims": report.get("total_claims", 0),
                "supported_claims": report.get("supported_claims", 0),
                "partial_claims": report.get("partial_claims", 0),
                "unsupported_claims": report.get(
                    "unsupported_claims", 0
                ),
                "issues": report.get("issues", []),
                "action": result.get("groundedness_action"),
                "retry_count": result.get(
                    "groundedness_retry_count", 0
                ),
            },
        )
        return result

    async def citation_node(state: AgentState) -> dict[str, Any]:
        result = await finalize_citations(state)
        citations = result.get("citations", [])
        emit(
            "citation",
            {
                "count": len(citations),
                "citations": citations,
            },
        )
        return result

    async def abstention_node(state: AgentState) -> dict[str, Any]:
        return await abstain(state)

    graph = StateGraph(AgentState)
    graph.add_node("analyze", analysis_node)
    graph.add_node("scope", scope_node)
    graph.add_node("rewrite", rewrite_node)
    graph.add_node("retrieve", retrieval_node)
    graph.add_node("filter", filter_node)
    graph.add_node("evidence", evidence_node)
    graph.add_node("generate", generation_node)
    graph.add_node("validate", validation_node)
    graph.add_node("groundedness", groundedness_node)
    graph.add_node("finalize", citation_node)
    graph.add_node("abstain", abstention_node)

    graph.add_edge(START, "analyze")
    graph.add_conditional_edges(
        "analyze",
        route_after_analysis,
        {"scope": "scope", "abstain": "abstain"},
    )
    graph.add_edge("scope", "rewrite")
    graph.add_edge("rewrite", "retrieve")
    graph.add_edge("retrieve", "filter")
    graph.add_edge("filter", "evidence")
    graph.add_conditional_edges(
        "evidence",
        route_after_evidence,
        {"generate": "generate", "abstain": "abstain"},
    )
    graph.add_edge("generate", "validate")
    graph.add_conditional_edges(
        "validate",
        route_after_validation,
        {
            "generate": "generate",
            "groundedness": "groundedness",
            "abstain": "abstain",
        },
    )
    graph.add_conditional_edges(
        "groundedness",
        route_after_groundedness,
        {
            "generate": "generate",
            "finalize": "finalize",
            "abstain": "abstain",
        },
    )
    graph.add_edge("finalize", END)
    graph.add_edge("abstain", END)
    return graph.compile()


