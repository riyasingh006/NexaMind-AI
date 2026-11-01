import logging
import time
from typing import Any

from app.agent.state import AgentState, ValidationStatus
from app.agent.utilities.citation_builder import (
    build_citations,
    extract_citation_ids,
    normalize_citation_ids,
)

logger = logging.getLogger(__name__)


async def finalize_citations(state: AgentState) -> dict[str, Any]:
    started = time.perf_counter()
    answer = str(state.get("final_answer", "")).strip()
    generation = dict(state.get("generation_result") or {})
    used_ids = list(
        dict.fromkeys(
            [
                *extract_citation_ids(answer),
                *normalize_citation_ids(
                    list(generation.get("used_citation_ids", []))
                ),
            ]
        )
    )
    citations = build_citations(
        list(state.get("citations", [])),
        used_ids,
    )
    metadata = {
        **state.get("processing_metadata", {}),
        "final_citation_count": len(citations),
        "final_answer_characters": len(answer),
        "citation_duration_ms": round(
            (time.perf_counter() - started) * 1000, 2
        ),
    }
    logger.info(
        "agent.citations_finalized",
        extra={
            "component": "agent",
            "conversation_id": state.get("conversation_id"),
            "final_citation_count": len(citations),
        },
    )
    return {
        "final_answer": answer,
        "citations": citations,
        "validation_status": ValidationStatus.VALID.value,
        "processing_metadata": metadata,
    }
