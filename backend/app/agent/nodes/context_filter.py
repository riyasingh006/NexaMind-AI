import logging
import time
from typing import Any

from app.agent.state import AgentState
from app.retrieval.optimizer import optimize_chunks

logger = logging.getLogger(__name__)


async def filter_context(
    state: AgentState,
    *,
    max_context_chunks: int,
) -> dict[str, Any]:
    started = time.perf_counter()
    query = str(
        state.get("rewritten_query")
        or state.get("analyzed_query")
        or state.get("user_query", "")
    )
    source_chunks = list(state.get("retrieved_chunks", []))
    optimized = optimize_chunks(
        source_chunks,
        query=query,
        max_chunks=max_context_chunks,
    )
    metadata = {
        **state.get("processing_metadata", {}),
        "filter_input_count": len(source_chunks),
        "filter_output_count": len(optimized.chunks),
        "filter_removed_duplicates": optimized.removed_duplicates,
        "filter_removed_empty": optimized.removed_empty,
        "filter_removed_redundant": optimized.removed_redundant,
        "filter_removed_excess": optimized.removed_excess,
        "context_optimization": "dedupe_diversity_budget",
        "filter_duration_ms": round(
            (time.perf_counter() - started) * 1000, 2
        ),
    }
    logger.info(
        "agent.context_filtered",
        extra={
            "component": "agent",
            "conversation_id": state.get("conversation_id"),
            "filter_input_count": len(source_chunks),
            "filter_output_count": len(optimized.chunks),
        },
    )
    return {
        "filtered_chunks": optimized.chunks,
        "processing_metadata": metadata,
    }
