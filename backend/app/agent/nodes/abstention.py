import logging
import time
from typing import Any

from app.agent.state import AgentState, EvidenceStatus, ValidationStatus

logger = logging.getLogger(__name__)

_OUT_OF_SCOPE_ANSWER = (
    "I can only answer questions grounded in the indexed DocuMind documents. "
    "Please ask a question about your uploaded documents."
)
_NO_RESULTS_ANSWER = (
    "I could not find enough relevant information in the indexed documents to "
    "answer that question. Try rephrasing it, selecting different documents, or "
    "indexing additional material."
)
_INSUFFICIENT_ANSWER = (
    "The retrieved passages do not provide enough evidence for a reliable answer. "
    "I will not infer an answer that the documents do not support. Try a more "
    "specific question or add documents that cover this topic."
)
_RETRIEVAL_UNAVAILABLE_ANSWER = (
    "Document retrieval is temporarily unavailable, so I cannot provide a "
    "grounded answer right now. Please verify Gemini configuration and try again."
)
_VALIDATION_FAILED_ANSWER = (
    "I retrieved relevant material, but I could not produce an answer that passed "
    "evidence and citation validation. I will not present an unverified response."
)
_GROUNDEDNESS_FAILED_ANSWER = (
    "I retrieved relevant material, but one or more answer claims could not be "
    "verified against the cited evidence. I will not present an unverified "
    "response."
)


async def abstain(state: AgentState) -> dict[str, Any]:
    started = time.perf_counter()
    reason = "VALIDATION_FAILED"
    answer = _VALIDATION_FAILED_ANSWER
    evidence_status = str(
        state.get("evidence_status", EvidenceStatus.INSUFFICIENT.value)
    )

    if state.get("out_of_scope"):
        reason = "OUT_OF_SCOPE"
        answer = _OUT_OF_SCOPE_ANSWER
        evidence_status = EvidenceStatus.INSUFFICIENT.value
    elif state.get("retrieval_error") or evidence_status == (
        EvidenceStatus.RETRIEVAL_UNAVAILABLE.value
    ):
        reason = "RETRIEVAL_UNAVAILABLE"
        answer = _RETRIEVAL_UNAVAILABLE_ANSWER
        evidence_status = EvidenceStatus.RETRIEVAL_UNAVAILABLE.value
    elif evidence_status == EvidenceStatus.NO_RESULTS.value:
        reason = "NO_RESULTS"
        answer = _NO_RESULTS_ANSWER
    elif evidence_status == EvidenceStatus.INSUFFICIENT.value:
        reason = "INSUFFICIENT_EVIDENCE"
        answer = _INSUFFICIENT_ANSWER
    elif (
        state.get("groundedness_action") == "abstain"
        or str(state.get("groundedness_report", {}).get("status", ""))
        in {"NOT_GROUNDED", "FAILED"}
    ):
        reason = "GROUNDEDNESS_FAILED"
        answer = _GROUNDEDNESS_FAILED_ANSWER

    metadata = {
        **state.get("processing_metadata", {}),
        "abstention_reason": reason,
        "abstention_duration_ms": round(
            (time.perf_counter() - started) * 1000, 2
        ),
    }
    logger.info(
        "agent.abstained",
        extra={
            "component": "agent",
            "conversation_id": state.get("conversation_id"),
            "abstention_reason": reason,
            "evidence_status": evidence_status,
        },
    )
    return {
        "final_answer": answer,
        "evidence_status": evidence_status,
        "validation_status": ValidationStatus.ABSTAINED.value,
        "citations": [],
        "generation_result": None,
        "processing_metadata": metadata,
    }
