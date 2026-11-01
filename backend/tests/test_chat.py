from uuid import uuid4

from pydantic import SecretStr

from app.agent.agent_service import AgentService
from app.agent.state import (
    AgentRunInput,
    AgentRunResult,
    EvidenceStatus,
    QueryIntent,
    ValidationStatus,
)
from app.core.config import get_settings


def _chunk(document_id: str) -> dict:
    return {
        "chunk_id": "chunk-1",
        "document_id": document_id,
        "filename": "grounded.txt",
        "content": "DocuMind stores indexed evidence in FAISS.",
        "page_number": 1,
        "section_title": "Storage",
        "chunk_index": 0,
        "similarity_score": 0.82,
        "citation_id": "S1",
    }


def _agent_result(
    document_id: str,
    answer: str,
    *,
    groundedness: dict | None = None,
) -> AgentRunResult:
    chunk = _chunk(document_id)
    return AgentRunResult(
        answer=answer,
        evidence_status=EvidenceStatus.SUFFICIENT,
        citations=[
            {
                "citation_id": "S1",
                "chunk_id": "chunk-1",
                "document_id": document_id,
                "filename": "grounded.txt",
                "page_number": 1,
                "section_title": "Storage",
                "relevant_excerpt": "DocuMind stores indexed evidence in FAISS.",
                "similarity_score": 0.82,
                "chunk_index": 0,
            }
        ],
        rewritten_query="How does DocuMind store indexed evidence?",
        query_intent=QueryIntent.FACTUAL_LOOKUP,
        query_rewritten=True,
        retrieval_queries=["DocuMind FAISS index"],
        retrieved_chunks=[chunk],
        filtered_chunks=[chunk],
        context_token_count=42,
        validation_status=(
            ValidationStatus.ABSTAINED
            if groundedness and groundedness.get("status") == "FAILED"
            else ValidationStatus.VALID
        ),
        groundedness=groundedness,
        retry_count=0,
        processing_metadata={"retrieval_duration_ms": 12.5},
        generation_model="gemini-3.6-flash",
        processing_time_ms=24.0,
    )


def _configure_gemini(monkeypatch) -> None:
    monkeypatch.setattr(
        get_settings(), "documind_gemini_api_key", SecretStr("test-key")
    )


async def test_query_returns_persisted_grounded_answer(client, monkeypatch):
    _configure_gemini(monkeypatch)
    document_id = str(uuid4())
    calls: list[AgentRunInput] = []

    async def fake_run(self, payload: AgentRunInput) -> AgentRunResult:
        calls.append(payload)
        return _agent_result(
            document_id,
            "DocuMind stores indexed evidence in FAISS. [S1]",
        )

    monkeypatch.setattr(AgentService, "run", fake_run)

    response = await client.post(
        "/api/v1/chat/query",
        json={
            "prompt": "How does DocuMind store indexed evidence?",
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "OPERATIONAL"
    assert body["answer"].endswith("[S1]")
    assert body["assistant_message"]["role"] == "assistant"
    assert body["assistant_message"]["metadata"]["evidence_status"] == (
        "SUFFICIENT"
    )
    assert body["assistant_message"]["metadata"]["sources_count"] == 1
    assert body["sources"][0]["document_id"] == document_id
    assert body["sources"][0]["page"] == 1
    assert body["retrieval"]["rewritten_query"] == (
        "How does DocuMind store indexed evidence?"
    )
    assert body["retrieval"]["chunks"][0]["rerank_position"] == 1
    assert body["agent"]["validation_status"] == "VALID"
    assert body["agent"]["retry_count"] == 0
    assert body["conversation_id"]
    assert calls[0].document_ids == []

    detail = await client.get(
        f"/api/v1/chat/conversations/{body['conversation_id']}"
    )
    assert detail.status_code == 200
    conversation = detail.json()
    assert conversation["message_count"] == 2
    assert [message["role"] for message in conversation["messages"]] == [
        "user",
        "assistant",
    ]
    assert conversation["messages"][1]["metadata"]["citations"][0]["id"] == (
        "S1"
    )


async def test_groundedness_failure_is_reported_as_degraded_and_persisted(
    client, monkeypatch
):
    _configure_gemini(monkeypatch)
    document_id = str(uuid4())
    groundedness = {
        "status": "FAILED",
        "score": 0.0,
        "threshold": 0.75,
        "total_claims": 1,
        "supported_claims": 0,
        "partial_claims": 0,
        "unsupported_claims": 1,
        "claims": [],
        "issues": ["Answer groundedness could not be verified."],
        "duration_ms": 1.0,
        "error": "GEMINI_UNAVAILABLE",
    }

    async def fake_run(self, payload: AgentRunInput) -> AgentRunResult:
        return _agent_result(
            document_id,
            "The answer was withheld because verification failed.",
            groundedness=groundedness,
        )

    monkeypatch.setattr(AgentService, "run", fake_run)

    response = await client.post(
        "/api/v1/chat/query",
        json={"prompt": "What is in the document?"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "DEGRADED"
    assert body["agent"]["groundedness_error_code"] == "GEMINI_UNAVAILABLE"
    assert body["assistant_message"]["metadata"]["integration_status"] == "DEGRADED"
    assert body["detail"] == (
        "Groundedness verification failed (GEMINI_UNAVAILABLE); the answer was withheld."
    )

    history = await client.get(
        f"/api/v1/chat/conversations/{body['conversation_id']}"
    )
    assert history.status_code == 200
    assistant = history.json()["messages"][1]
    assert assistant["metadata"]["groundedness_error_code"] == "GEMINI_UNAVAILABLE"
    assert assistant["metadata"]["integration_status"] == "DEGRADED"


async def test_conversation_history_list_and_delete(client, monkeypatch):
    _configure_gemini(monkeypatch)
    document_id = str(uuid4())
    calls: list[AgentRunInput] = []

    async def fake_run(self, payload: AgentRunInput) -> AgentRunResult:
        calls.append(payload)
        return _agent_result(document_id, "Grounded answer. [S1]")

    monkeypatch.setattr(AgentService, "run", fake_run)

    first = await client.post(
        "/api/v1/chat/query",
        json={"prompt": "First question"},
    )
    assert first.status_code == 200
    conversation_id = first.json()["conversation_id"]

    second = await client.post(
        "/api/v1/chat/query",
        json={
            "prompt": "Follow-up question",
            "conversation_id": conversation_id,
        },
    )
    assert second.status_code == 200
    assert second.json()["conversation_id"] == conversation_id
    assert [turn["role"] for turn in calls[1].conversation_history] == [
        "user",
        "assistant",
    ]

    listing = await client.get("/api/v1/chat/conversations")
    assert listing.status_code == 200
    body = listing.json()
    assert body["total"] == 1
    assert body["items"][0]["message_count"] == 4

    deleted = await client.delete(
        f"/api/v1/chat/conversations/{conversation_id}"
    )
    assert deleted.status_code == 200
    assert deleted.json()["conversation_id"] == conversation_id

    missing = await client.get(
        f"/api/v1/chat/conversations/{conversation_id}"
    )
    assert missing.status_code == 404

    empty = await client.get("/api/v1/chat/conversations")
    assert empty.json()["total"] == 0


async def test_query_validates_document_scope_and_prompt(client, monkeypatch):
    _configure_gemini(monkeypatch)

    missing_document = await client.post(
        "/api/v1/chat/query",
        json={
            "prompt": "Use this document",
            "document_ids": [str(uuid4())],
        },
    )
    assert missing_document.status_code == 404
    assert missing_document.json()["error"]["code"] == "DOCUMENT_NOT_FOUND"

    blank = await client.post(
        "/api/v1/chat/query",
        json={"prompt": "   "},
    )
    assert blank.status_code == 422
    assert blank.json()["error"]["code"] == "VALIDATION_ERROR"

    invalid_conversation = await client.post(
        "/api/v1/chat/query",
        json={
            "prompt": "Continue",
            "conversation_id": str(uuid4()),
        },
    )
    assert invalid_conversation.status_code == 404
    assert invalid_conversation.json()["error"]["code"] == "RESOURCE_NOT_FOUND"


async def test_query_requires_gemini_configuration(client):
    response = await client.post(
        "/api/v1/chat/query",
        json={"prompt": "Summarize the uploaded document."},
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "GEMINI_NOT_CONFIGURED"

    listing = await client.get("/api/v1/chat/conversations")
    assert listing.json()["total"] == 0


async def test_stream_requires_gemini_configuration(client):
    response = await client.post(
        "/api/v1/chat/stream",
        json={"prompt": "Stream a grounded answer."},
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "GEMINI_NOT_CONFIGURED"
