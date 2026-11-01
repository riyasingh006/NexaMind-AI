import logging
import time
from typing import Any

from pydantic import BaseModel, Field

from app.agent.prompts.query_rewrite import (
    QUERY_REWRITE_SYSTEM_PROMPT,
    build_query_rewrite_prompt,
)
from app.agent.services.gemini_generation_service import (
    GenerationError,
    GeminiGenerationService,
)
from app.agent.state import AgentState
from app.core.exceptions import ConfigurationError

logger = logging.getLogger(__name__)


class QueryRewriteOutput(BaseModel):
    queries: list[str] = Field(min_length=1, max_length=6)


def _clean_queries(
    queries: list[str], *, original: str, max_queries: int
) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for value in queries:
        query = " ".join(str(value).split()).strip()
        if not query:
            continue
        key = query.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(query[:1000])
        if len(cleaned) >= max_queries:
            break
    if not cleaned:
        cleaned = [original]
    return cleaned


def _fallback_queries(state: AgentState) -> list[str]:
    original = str(state.get("analyzed_query") or state.get("user_query", "")).strip()
    analysis = state.get("processing_metadata", {}).get("analysis", {})
    keywords = [str(value) for value in analysis.get("keywords", [])]
    queries = [original]
    if keywords:
        focused = " ".join(keywords[:8])
        if focused and focused.lower() != original.lower():
            queries.append(focused)
    return _clean_queries(
        queries,
        original=original,
        max_queries=int(
            state.get("processing_metadata", {}).get(
                "max_retrieval_queries", 3
            )
        ),
    )


async def rewrite_query(
    state: AgentState,
    *,
    service: GeminiGenerationService,
    max_retrieval_queries: int,
) -> dict[str, Any]:
    started = time.perf_counter()
    original = str(state.get("analyzed_query") or state.get("user_query", "")).strip()
    metadata = {
        **state.get("processing_metadata", {}),
        "max_retrieval_queries": max_retrieval_queries,
    }
    if not state.get("needs_rewrite", False):
        return {
            "rewritten_query": original,
            "retrieval_queries": [original],
            "processing_metadata": {
                **metadata,
                "query_rewritten": False,
                "rewrite_duration_ms": round(
                    (time.perf_counter() - started) * 1000, 2
                ),
            },
        }

    prompt = build_query_rewrite_prompt(
        query=original,
        intent=str(state.get("query_intent", "")),
        conversation_history=list(state.get("conversation_history", [])),
        max_queries=max_retrieval_queries,
        document_count=len(state.get("document_ids", [])),
    )
    try:
        output = await service.generate_json(
            prompt=prompt,
            system_instruction=QUERY_REWRITE_SYSTEM_PROMPT.format(
                max_queries=max_retrieval_queries
            ),
            schema=QueryRewriteOutput,
            temperature=0.0,
        )
        queries = _clean_queries(
            output.queries,
            original=original,
            max_queries=max_retrieval_queries,
        )
        rewritten = True
    except (GenerationError, ConfigurationError) as exc:
        logger.warning(
            "agent.query_rewrite_fallback",
            extra={
                "component": "agent",
                "conversation_id": state.get("conversation_id"),
                "error_code": getattr(exc, "code", "GENERATION_ERROR"),
            },
        )
        queries = _fallback_queries({**state, "processing_metadata": metadata})
        rewritten = False

    return {
        "rewritten_query": queries[0],
        "retrieval_queries": queries,
        "processing_metadata": {
            **metadata,
            "query_rewritten": rewritten,
            "retrieval_query_count": len(queries),
            "rewrite_duration_ms": round(
                (time.perf_counter() - started) * 1000, 2
            ),
        },
    }
