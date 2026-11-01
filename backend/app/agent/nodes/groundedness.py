import logging
from typing import Any

from app.agent.services.gemini_generation_service import GeminiGenerationService
from app.agent.state import AgentState, GroundednessReportData
from app.evaluation.groundedness import (
    correction_issues,
    verify_groundedness,
)

logger = logging.getLogger(__name__)


async def verify_answer_groundedness(
    state: AgentState,
    *,
    service: GeminiGenerationService,
    enabled: bool,
    threshold: float,
    max_retries: int,
) -> dict[str, Any]:
    metadata = dict(state.get("processing_metadata", {}))
    if not enabled:
        report = GroundednessReportData(
            status="DISABLED",
            score=None,
            threshold=threshold,
            total_claims=0,
            supported_claims=0,
            partial_claims=0,
            unsupported_claims=0,
            claims=[],
            issues=[],
            duration_ms=0.0,
            error=None,
        )
        return {
            "groundedness_report": report,
            "groundedness_action": "finalize",
            "processing_metadata": {
                **metadata,
                "groundedness_enabled": False,
            },
        }

    report = await verify_groundedness(
        question=str(state.get("user_query", "")),
        answer=str(state.get("final_answer", "")),
        context=str(state.get("context", "")),
        valid_citation_ids=[
            str(citation.get("citation_id", ""))
            for citation in state.get("citations", [])
        ],
        service=service,
        threshold=threshold,
    )
    retry_count = int(state.get("groundedness_retry_count", 0))
    action = "finalize"
    issues = list(state.get("groundedness_issues", []))
    if report["status"] == "NOT_GROUNDED":
        if retry_count < max_retries:
            retry_count += 1
            issues = correction_issues(report)
            action = "correct"
        else:
            action = "abstain"
    elif report["status"] == "FAILED":
        action = "abstain"
        issues = list(report.get("issues", []))

    combined_metadata = {
        **metadata,
        "groundedness_enabled": True,
        "groundedness_status": report["status"],
        "groundedness_score": report.get("score"),
        "groundedness_claim_count": report.get("total_claims", 0),
        "groundedness_unsupported_claims": report.get(
            "unsupported_claims", 0
        ),
        "groundedness_retry_count": retry_count,
        "groundedness_duration_ms": report.get("duration_ms", 0.0),
        "groundedness_action": action,
    }
    logger.info(
        "agent.groundedness_verified",
        extra={
            "component": "agent",
            "conversation_id": state.get("conversation_id"),
            "groundedness_status": report["status"],
            "groundedness_score": report.get("score"),
            "groundedness_action": action,
        },
    )
    return {
        "groundedness_report": report,
        "groundedness_retry_count": retry_count,
        "groundedness_issues": issues,
        "validation_issues": issues if action == "correct" else state.get(
            "validation_issues", []
        ),
        "groundedness_action": action,
        "processing_metadata": combined_metadata,
    }
