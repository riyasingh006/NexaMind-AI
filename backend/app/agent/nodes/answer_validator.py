import logging
import re
import time
from typing import Any

from app.agent.state import AgentState, ValidationStatus
from app.agent.utilities.citation_builder import (
    extract_citation_ids,
    normalize_citation_ids,
)

logger = logging.getLogger(__name__)

_UNSAFE_ANSWER_PATTERNS = (
    re.compile(r"(?i)\bDOCUMIND_GEMINI_API_KEY\b"),
    re.compile(r"(?i)\bGEMINI_API_KEY\b"),
    re.compile(r"(?i)\bsystem\s+prompt\b"),
    re.compile(r"(?i)\byou are DocuMind AI\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
)


async def validate_answer(
    state: AgentState,
    *,
    max_retries: int,
) -> dict[str, Any]:
    started = time.perf_counter()
    answer = str(state.get("final_answer", "")).strip()
    generation = dict(state.get("generation_result") or {})
    candidate_citations = list(state.get("citations", []))
    candidate_ids = {
        str(citation.get("citation_id", "")).upper()
        for citation in candidate_citations
        if citation.get("citation_id")
    }
    answer_citation_ids = extract_citation_ids(answer)
    generation_citation_ids = normalize_citation_ids(
        list(generation.get("used_citation_ids", []))
    )
    used_ids = list(
        dict.fromkeys([*answer_citation_ids, *generation_citation_ids])
    )
    issues: list[str] = []

    if not answer:
        issues.append("The answer is empty.")
    if len(answer) < 10:
        issues.append("The answer is too short to be useful.")
    if not candidate_citations:
        issues.append("No evidence citations are available.")
    if not answer_citation_ids:
        issues.append("The answer does not cite any supplied evidence.")
    unknown_ids = sorted(set(used_ids) - candidate_ids)
    if unknown_ids:
        issues.append(
            "The answer references citation labels that were not supplied: "
            + ", ".join(unknown_ids)
        )
    if any(pattern.search(answer) for pattern in _UNSAFE_ANSWER_PATTERNS):
        issues.append("The answer leaked internal configuration or instructions.")

    retry_count = int(state.get("retry_count", 0))
    if issues:
        retry_count += 1
        status = (
            ValidationStatus.FAILED
            if retry_count > max_retries
            else ValidationStatus.INVALID
        )
    else:
        status = ValidationStatus.VALID

    metadata = {
        **state.get("processing_metadata", {}),
        "validation_status": status.value,
        "validation_issue_count": len(issues),
        "validation_duration_ms": round(
            (time.perf_counter() - started) * 1000, 2
        ),
    }
    logger.info(
        "agent.answer_validated",
        extra={
            "component": "agent",
            "conversation_id": state.get("conversation_id"),
            "validation_status": status.value,
            "validation_issue_count": len(issues),
            "retry_count": retry_count,
        },
    )
    return {
        "validation_status": status.value,
        "validation_issues": issues,
        "retry_count": retry_count,
        "generation_result": {
            **generation,
            "used_citation_ids": used_ids if not unknown_ids else generation_citation_ids,
        },
        "processing_metadata": metadata,
    }
