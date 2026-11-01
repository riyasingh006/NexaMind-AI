import logging
import time
from typing import Any

from app.agent.state import AgentState, EvidenceStatus
from app.agent.utilities.context_builder import (
    build_context,
    context_metadata,
)
from app.retrieval.coverage import compute_evidence_coverage

logger = logging.getLogger(__name__)


def _evidence_status(
    chunks: list[dict[str, Any]], threshold: float
) -> EvidenceStatus:
    if not chunks:
        return EvidenceStatus.NO_RESULTS
    top_score = max(float(chunk.get("similarity_score", 0.0)) for chunk in chunks)
    strong_chunks = sum(
        1
        for chunk in chunks
        if float(chunk.get("similarity_score", 0.0)) >= max(threshold, 0.5)
    )
    if top_score >= max(threshold, 0.6) or (
        top_score >= max(threshold, 0.5) and strong_chunks >= 2
    ):
        return EvidenceStatus.SUFFICIENT
    if top_score >= threshold:
        return EvidenceStatus.PARTIAL
    return EvidenceStatus.INSUFFICIENT


async def evaluate_evidence(
    state: AgentState,
    *,
    max_context_chunks: int,
    max_context_tokens: int,
) -> dict[str, Any]:
    started = time.perf_counter()
    metadata = dict(state.get("processing_metadata", {}))
    if state.get("retrieval_error"):
        error = state.get("retrieval_error") or {}
        return {
            "evidence_status": EvidenceStatus.RETRIEVAL_UNAVAILABLE.value,
            "context": "",
            "citations": [],
            "filtered_chunks": [],
            "processing_metadata": {
                **metadata,
                "evidence_status": EvidenceStatus.RETRIEVAL_UNAVAILABLE.value,
                "evidence_retrieval_error": error.get("code"),
                "evidence_duration_ms": round(
                    (time.perf_counter() - started) * 1000, 2
                ),
            },
        }

    source_chunks = list(state.get("filtered_chunks", []))
    if not source_chunks:
        return {
            "evidence_status": EvidenceStatus.NO_RESULTS.value,
            "context": "",
            "citations": [],
            "filtered_chunks": [],
            "processing_metadata": {
                **metadata,
                "evidence_status": EvidenceStatus.NO_RESULTS.value,
                "evidence_duration_ms": round(
                    (time.perf_counter() - started) * 1000, 2
                ),
            },
        }

    threshold = float(metadata.get("retrieval_threshold", 0.0))
    status = _evidence_status(source_chunks, threshold)
    context_result = build_context(
        source_chunks,
        max_chunks=max_context_chunks,
        max_tokens=max_context_tokens,
    )
    if not context_result.context:
        status = EvidenceStatus.INSUFFICIENT

    coverage_queries = list(
        dict.fromkeys(
            [
                *list(state.get("retrieval_queries", [])),
                str(
                    state.get("rewritten_query")
                    or state.get("user_query", "")
                ).strip(),
            ]
        )
    )
    coverage = compute_evidence_coverage(
        [query for query in coverage_queries if query],
        context_result.included_chunks,
    )
    if coverage["total_terms"] > 0:
        if coverage["score"] < 0.35:
            status = EvidenceStatus.INSUFFICIENT
        elif coverage["score"] < 0.75 and status == EvidenceStatus.SUFFICIENT:
            status = EvidenceStatus.PARTIAL

    scores = [
        float(chunk.get("similarity_score", 0.0)) for chunk in source_chunks
    ]
    best_score = max(scores) if scores else 0.0
    average_score = sum(scores) / len(scores) if scores else 0.0
    combined_metadata = {
        **metadata,
        **context_metadata(context_result),
        "evidence_status": status.value,
        "evidence_best_score": round(best_score, 6),
        "evidence_average_score": round(average_score, 6),
        "evidence_candidate_count": len(source_chunks),
        "evidence_citation_candidate_count": len(context_result.citations),
        "evidence_coverage": coverage,
        "evidence_coverage_score": coverage.get("score", 0.0),
        "evidence_coverage_status": coverage.get("status", "UNKNOWN"),
        "evidence_duration_ms": round(
            (time.perf_counter() - started) * 1000, 2
        ),
    }
    logger.info(
        "agent.evidence_evaluated",
        extra={
            "component": "agent",
            "conversation_id": state.get("conversation_id"),
            "evidence_status": status.value,
            "context_chunks": len(context_result.included_chunks),
            "context_tokens": context_result.token_count,
        },
    )
    return {
        "evidence_status": status.value,
        "context": context_result.context,
        "citations": context_result.citations,
        "filtered_chunks": context_result.included_chunks,
        "evidence_coverage": coverage,
        "processing_metadata": combined_metadata,
    }
