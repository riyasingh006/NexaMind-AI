from types import SimpleNamespace

import pytest
from pydantic import BaseModel, SecretStr

from app.agent.nodes.answer_validator import validate_answer
from app.agent.nodes.evidence_evaluator import evaluate_evidence
from app.agent.nodes.query_analyzer import analyze_query_text
from app.agent.services.gemini_generation_service import (
    GeminiGenerationService,
    GenerationNotConfiguredError,
)
from app.agent.state import QueryIntent, ValidationStatus
from app.core.config import Settings


class GeneratedAnswer(BaseModel):
    answer: str


def _chunk(score: float = 0.82) -> dict:
    return {
        "chunk_id": "chunk-1",
        "document_id": "00000000-0000-0000-0000-000000000001",
        "filename": "guide.txt",
        "content": "DocuMind stores indexed evidence in FAISS.",
        "page_number": 2,
        "section_title": "Storage",
        "chunk_index": 0,
        "similarity_score": score,
    }


def test_query_analyzer_detects_out_of_scope_follow_up_and_comparison():
    greeting = analyze_query_text("Hello there", [])
    assert greeting.intent == QueryIntent.OUT_OF_SCOPE
    assert greeting.requires_documents is False

    follow_up = analyze_query_text(
        "What about that requirement?",
        [{"role": "user", "content": "What does the policy require?"}],
    )
    assert follow_up.intent == QueryIntent.FOLLOW_UP
    assert follow_up.uses_conversation_history is True

    comparison = analyze_query_text("Compare the Alpha and Beta results", [])
    assert comparison.intent == QueryIntent.COMPARISON


async def test_answer_validator_accepts_known_citations_only():
    citations = [
        {
            "citation_id": "S1",
            "chunk_id": "chunk-1",
            "document_id": "00000000-0000-0000-0000-000000000001",
        }
    ]
    valid = await validate_answer(
        {
            "final_answer": "DocuMind stores indexed evidence in FAISS. [S1]",
            "citations": citations,
            "generation_result": {"used_citation_ids": ["S1"]},
            "retry_count": 0,
            "processing_metadata": {},
        },
        max_retries=2,
    )
    assert valid["validation_status"] == ValidationStatus.VALID.value
    assert valid["retry_count"] == 0
    assert valid["validation_issues"] == []

    invalid = await validate_answer(
        {
            "final_answer": "DocuMind stores indexed evidence in FAISS. [S9]",
            "citations": citations,
            "generation_result": {"used_citation_ids": ["S9"]},
            "retry_count": 0,
            "processing_metadata": {},
        },
        max_retries=2,
    )
    assert invalid["validation_status"] == ValidationStatus.INVALID.value
    assert invalid["retry_count"] == 1
    assert any("not supplied" in issue for issue in invalid["validation_issues"])


async def test_evidence_evaluation_creates_context_and_abstains_safely():
    sufficient = await evaluate_evidence(
        {
            "filtered_chunks": [_chunk()],
            "processing_metadata": {"retrieval_threshold": 0.35},
        },
        max_context_chunks=5,
        max_context_tokens=1000,
    )
    assert sufficient["evidence_status"] == "SUFFICIENT"
    assert "[S1]" in sufficient["context"]
    assert sufficient["citations"][0]["citation_id"] == "S1"

    empty = await evaluate_evidence(
        {"filtered_chunks": [], "processing_metadata": {}},
        max_context_chunks=5,
        max_context_tokens=1000,
    )
    assert empty["evidence_status"] == "NO_RESULTS"
    assert empty["citations"] == []

    unavailable = await evaluate_evidence(
        {
            "filtered_chunks": [],
            "retrieval_error": {"code": "RETRIEVAL_UNAVAILABLE"},
            "processing_metadata": {},
        },
        max_context_chunks=5,
        max_context_tokens=1000,
    )
    assert unavailable["evidence_status"] == "RETRIEVAL_UNAVAILABLE"


async def test_generation_service_parses_structured_output_and_rejects_missing_key():
    settings = Settings(
        documind_gemini_api_key=SecretStr("test-key"),
        documind_agent_max_retries=0,
        gemini_generation_timeout_seconds=1,
    )

    async def fake_generate_content(**kwargs):
        return SimpleNamespace(parsed=GeneratedAnswer(answer="grounded"))

    client = SimpleNamespace(
        aio=SimpleNamespace(
            models=SimpleNamespace(generate_content=fake_generate_content)
        )
    )
    service = GeminiGenerationService(settings, client=client)
    result = await service.generate_json(
        prompt="Answer from the supplied context.",
        system_instruction="Use only the supplied context.",
        schema=GeneratedAnswer,
    )
    assert result.answer == "grounded"

    unconfigured = GeminiGenerationService(
        Settings(documind_gemini_api_key=None),
        client=client,
    )
    with pytest.raises(GenerationNotConfiguredError):
        await unconfigured.generate_json(
            prompt="Answer from the supplied context.",
            system_instruction="Use only the supplied context.",
            schema=GeneratedAnswer,
        )
