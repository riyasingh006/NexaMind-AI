import json
from types import SimpleNamespace

import pytest
from pydantic import SecretStr

from app.agent.agent_service import AgentService
from app.agent.nodes.query_rewriter import QueryRewriteOutput
from app.agent.services.gemini_generation_service import (
    GeminiGenerationService,
    GenerationUnavailableError,
)
from app.agent.state import (
    AgentRunInput,
    AgentRunResult,
    EvidenceStatus,
    QueryIntent,
    ValidationStatus,
)
from app.core.config import get_settings
from app.evaluation.groundedness import GroundednessOutput
from app.services.gemini_embedding_service import GeminiEmbeddingService


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
        query_rewritten=False,
        retrieval_queries=["DocuMind FAISS index"],
        retrieved_chunks=[chunk],
        filtered_chunks=[chunk],
        context_token_count=42,
        validation_status=ValidationStatus.VALID,
        groundedness=groundedness,
        evidence_coverage={"status": "FULL", "score": 1.0},
        retry_count=0,
        processing_metadata={"retrieval_duration_ms": 12.5},
        generation_model="gemini-3.6-flash",
        processing_time_ms=24.0,
    )


def _configure_gemini(monkeypatch) -> None:
    monkeypatch.setattr(
        get_settings(), "documind_gemini_api_key", SecretStr("test-key")
    )


def _configure_embeddings(monkeypatch) -> None:
    _configure_gemini(monkeypatch)

    async def fake_embed_documents(self, texts, *, title=None):
        return [[1.0] + [0.0] * 767 for _ in texts]

    async def fake_embed_query(self, query):
        return [1.0] + [0.0] * 767

    monkeypatch.setattr(
        GeminiEmbeddingService, "embed_documents", fake_embed_documents
    )
    monkeypatch.setattr(
        GeminiEmbeddingService, "embed_query", fake_embed_query
    )


def _parse_events(body: str) -> list[dict]:
    events: list[dict] = []
    for block in body.replace("\r\n", "\n").split("\n\n"):
        data_lines = [
            line[5:].strip()
            for line in block.splitlines()
            if line.startswith("data:")
        ]
        if not data_lines:
            continue
        events.append(json.loads("\n".join(data_lines)))
    return events


async def _upload_alpha(client) -> str:
    upload = await client.post(
        "/api/v1/documents/upload",
        files={
            "file": (
                "phase7.txt",
                b"The FAISS index stores semantic vectors for retrieval. " * 40,
                "text/plain",
            )
        },
    )
    assert upload.status_code == 201, upload.text
    return upload.json()["document"]["id"]


async def test_stream_requires_gemini_configuration(client):
    response = await client.post(
        "/api/v1/chat/stream",
        json={"prompt": "Stream a grounded answer."},
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "GEMINI_NOT_CONFIGURED"

    listing = await client.get("/api/v1/chat/conversations")
    assert listing.json()["total"] == 0


async def test_stream_persists_only_completed_answer(client, monkeypatch):
    _configure_gemini(monkeypatch)
    document_id = "00000000-0000-0000-0000-000000000001"

    async def fake_run_stream(self, payload: AgentRunInput, emit):
        assert payload.user_query == "How does DocuMind store evidence?"
        emit("query_analyzed", {"intent": "FACTUAL_LOOKUP"})
        emit("retrieval_started", {"queries": ["DocuMind FAISS"]})
        emit(
            "retrieval_completed",
            {"chunk_count": 1, "duration_ms": 9.0},
        )
        emit(
            "reranking_completed",
            {"enabled": True, "method": "gemini_llm"},
        )
        emit(
            "evidence_evaluated",
            {"status": "SUFFICIENT", "citation_count": 1},
        )
        emit(
            "generation_started",
            {"mode": "initial", "replace": False, "attempt": 1},
        )
        emit("token", {"token": "DocuMind ", "generation": 1, "index": 1})
        emit(
            "token",
            {
                "token": "stores evidence in FAISS. [S1]",
                "generation": 1,
                "index": 2,
            },
        )
        emit(
            "groundedness_completed",
            {"status": "GROUNDED", "score": 1.0, "action": "finalize"},
        )
        emit("citation", {"count": 1, "citations": []})
        return _agent_result(
            document_id,
            "DocuMind stores evidence in FAISS. [S1]",
            groundedness={
                "status": "GROUNDED",
                "score": 1.0,
                "threshold": 0.75,
                "total_claims": 1,
                "supported_claims": 1,
                "partial_claims": 0,
                "unsupported_claims": 0,
                "claims": [],
                "issues": [],
                "duration_ms": 1.0,
                "error": None,
            },
        )

    monkeypatch.setattr(AgentService, "run_stream", fake_run_stream)

    response = await client.post(
        "/api/v1/chat/stream",
        json={"prompt": "How does DocuMind store evidence?"},
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["cache-control"] == "no-cache"

    events = _parse_events(response.text)
    names = [event["event"] for event in events]
    assert names[0] == "workflow_started"
    assert names[-1] == "completed"
    assert names.count("token") == 2
    assert names.index("groundedness_completed") < names.index("citation")
    assert [event["sequence"] for event in events] == list(
        range(1, len(events) + 1)
    )
    assert all(event["request_id"] for event in events)

    completed = events[-1]["data"]
    assert completed["answer"] == "DocuMind stores evidence in FAISS. [S1]"
    assert completed["conversation_id"] == events[0]["data"]["conversation_id"]
    assert completed["assistant_message"]["content"].endswith("[S1]")
    assert completed["agent"]["groundedness_status"] == "GROUNDED"

    detail = await client.get(
        f"/api/v1/chat/conversations/{completed['conversation_id']}"
    )
    assert detail.status_code == 200
    conversation = detail.json()
    assert conversation["message_count"] == 2
    assert [message["role"] for message in conversation["messages"]] == [
        "user",
        "assistant",
    ]


async def test_stream_failure_keeps_user_message_only(client, monkeypatch):
    _configure_gemini(monkeypatch)

    async def fake_run_stream(self, payload: AgentRunInput, emit):
        emit("token", {"token": "Partial answer", "generation": 1})
        raise GenerationUnavailableError("Gemini failed mid-stream.")

    monkeypatch.setattr(AgentService, "run_stream", fake_run_stream)

    response = await client.post(
        "/api/v1/chat/stream",
        json={"prompt": "Stream a partial answer."},
    )
    assert response.status_code == 200
    events = _parse_events(response.text)
    assert events[0]["event"] == "workflow_started"
    assert events[-1]["event"] == "error"
    error = events[-1]["data"]
    assert error["code"] == "GEMINI_UNAVAILABLE"
    assert error["partial"] is True

    detail = await client.get(
        f"/api/v1/chat/conversations/{error['conversation_id']}"
    )
    conversation = detail.json()
    assert conversation["message_count"] == 1
    assert conversation["messages"][0]["role"] == "user"


async def test_regenerate_replaces_previous_assistant_message(
    client, monkeypatch
):
    _configure_gemini(monkeypatch)
    document_id = "00000000-0000-0000-0000-000000000002"
    prompt = "What does DocuMind use for indexing?"

    async def fake_run(self, payload: AgentRunInput):
        return _agent_result(document_id, "The old answer. [S1]")

    async def fake_run_stream(self, payload: AgentRunInput, emit):
        emit("token", {"token": "The new answer. [S1]", "generation": 1})
        return _agent_result(document_id, "The new answer. [S1]")

    monkeypatch.setattr(AgentService, "run", fake_run)
    monkeypatch.setattr(AgentService, "run_stream", fake_run_stream)

    first = await client.post(
        "/api/v1/chat/query",
        json={"prompt": prompt},
    )
    assert first.status_code == 200, first.text
    conversation_id = first.json()["conversation_id"]
    old_assistant_id = first.json()["assistant_message"]["id"]

    response = await client.post(
        "/api/v1/chat/stream",
        json={
            "prompt": "This prompt is ignored during regeneration.",
            "conversation_id": conversation_id,
            "regenerate": True,
        },
    )
    assert response.status_code == 200, response.text
    events = _parse_events(response.text)
    completed = events[-1]["data"]
    assert completed["regenerated_message_id"] == old_assistant_id
    assert completed["user_message"]["content"] == prompt
    assert completed["assistant_message"]["content"] == "The new answer. [S1]"

    detail = await client.get(
        f"/api/v1/chat/conversations/{conversation_id}"
    )
    conversation = detail.json()
    assert conversation["message_count"] == 2
    assert conversation["messages"][1]["id"] != old_assistant_id
    assert conversation["messages"][1]["content"] == "The new answer. [S1]"


async def test_stream_retry_reuses_interrupted_user_message(
    client, monkeypatch
):
    _configure_gemini(monkeypatch)
    prompt = "Retry this grounded question."

    async def fake_fail(self, payload: AgentRunInput, emit):
        raise GenerationUnavailableError("Gemini unavailable.")

    monkeypatch.setattr(AgentService, "run_stream", fake_fail)
    failed = await client.post(
        "/api/v1/chat/stream",
        json={"prompt": prompt},
    )
    failed_event = _parse_events(failed.text)[-1]["data"]
    conversation_id = failed_event["conversation_id"]
    user_message_id = failed_event["user_message_id"]

    async def fake_success(self, payload: AgentRunInput, emit):
        emit("token", {"token": "Recovered answer. [S1]", "generation": 1})
        return _agent_result(
            "00000000-0000-0000-0000-000000000003",
            "Recovered answer. [S1]",
        )

    monkeypatch.setattr(AgentService, "run_stream", fake_success)
    retried = await client.post(
        "/api/v1/chat/stream",
        json={
            "prompt": prompt,
            "conversation_id": conversation_id,
        },
    )
    assert retried.status_code == 200, retried.text
    completed = _parse_events(retried.text)[-1]["data"]
    assert completed["user_message"]["id"] == user_message_id

    detail = await client.get(
        f"/api/v1/chat/conversations/{conversation_id}"
    )
    assert detail.json()["message_count"] == 2


async def test_conversation_rename(client, monkeypatch):
    _configure_gemini(monkeypatch)

    async def fake_run(self, payload: AgentRunInput):
        return _agent_result(
            "00000000-0000-0000-0000-000000000004",
            "A grounded answer. [S1]",
        )

    monkeypatch.setattr(AgentService, "run", fake_run)
    created = await client.post(
        "/api/v1/chat/query",
        json={"prompt": "Rename this conversation."},
    )
    conversation_id = created.json()["conversation_id"]

    response = await client.patch(
        f"/api/v1/chat/conversations/{conversation_id}",
        json={"title": "  Renamed   research thread  "},
    )
    assert response.status_code == 200, response.text
    assert response.json()["title"] == "Renamed research thread"

    blank = await client.patch(
        f"/api/v1/chat/conversations/{conversation_id}",
        json={"title": "   "},
    )
    assert blank.status_code == 422


async def test_conversation_clear_keeps_conversation(client, monkeypatch):
    _configure_gemini(monkeypatch)

    async def fake_run(self, payload: AgentRunInput):
        return _agent_result(
            "00000000-0000-0000-0000-000000000005",
            "A grounded answer. [S1]",
        )

    monkeypatch.setattr(AgentService, "run", fake_run)
    created = await client.post(
        "/api/v1/chat/query",
        json={"prompt": "Clear this conversation."},
    )
    conversation_id = created.json()["conversation_id"]

    response = await client.delete(
        f"/api/v1/chat/conversations/{conversation_id}/messages"
    )
    assert response.status_code == 200, response.text
    cleared = response.json()
    assert cleared["id"] == conversation_id
    assert cleared["message_count"] == 0
    assert cleared["messages"] == []
    assert cleared["document_ids"] == []

    detail = await client.get(
        f"/api/v1/chat/conversations/{conversation_id}"
    )
    assert detail.status_code == 200
    assert detail.json()["message_count"] == 0


async def test_stream_text_yields_chunks_without_json(client):
    class FakeStream:
        def __init__(self) -> None:
            self.chunks = ["Grounded ", "answer. [S1]"]
            self.position = 0
            self.closed = False

        def __aiter__(self):
            return self

        async def __anext__(self):
            if self.position >= len(self.chunks):
                raise StopAsyncIteration
            value = self.chunks[self.position]
            self.position += 1
            return SimpleNamespace(text=value)

        async def aclose(self):
            self.closed = True

    stream = FakeStream()

    class FakeModels:
        async def generate_content_stream(self, **kwargs):
            assert kwargs["config"].response_mime_type is None
            return stream

    class FakeClient:
        aio = SimpleNamespace(models=FakeModels())

    service = GeminiGenerationService(
        get_settings(),
        client=FakeClient(),
    )
    service.settings.documind_gemini_api_key = SecretStr("test-key")

    chunks = [
        chunk
        async for chunk in service.stream_text(
            prompt="Answer from evidence.",
            system_instruction="Return Markdown only.",
        )
    ]
    assert chunks == ["Grounded ", "answer. [S1]"]
    assert stream.closed is True


@pytest.mark.asyncio
async def test_full_graph_streams_tokens_and_stages(client, monkeypatch):
    _configure_embeddings(monkeypatch)
    document_id = await _upload_alpha(client)
    settings = get_settings()
    monkeypatch.setattr(settings, "documind_rag_reranking_enabled", False)

    async def fake_generate(self, *, schema, **kwargs):
        name = schema.__name__
        if name == "QueryRewriteOutput":
            return QueryRewriteOutput(queries=["FAISS semantic vectors"])
        if name == "GroundednessOutput":
            return GroundednessOutput(
                claims=[
                    {
                        "claim_id": "C1",
                        "status": "SUPPORTED",
                        "evidence_ids": ["S1"],
                        "reason": "The evidence states this directly.",
                    }
                ]
            )
        raise GenerationUnavailableError("unexpected JSON generation")

    async def fake_stream_text(
        self,
        *,
        prompt: str,
        system_instruction: str,
        temperature: float | None = None,
    ):
        assert "Return only the final answer as Markdown" in (
            system_instruction
        )
        assert "Return an object with 'answer'" not in prompt
        for chunk in [
            "The FAISS index ",
            "stores semantic vectors ",
            "for retrieval. [S1]",
        ]:
            yield chunk

    monkeypatch.setattr(GeminiGenerationService, "generate_json", fake_generate)
    monkeypatch.setattr(
        GeminiGenerationService, "stream_text", fake_stream_text
    )

    response = await client.post(
        "/api/v1/chat/stream",
        json={
            "prompt": "What does the FAISS index store?",
            "document_ids": [document_id],
            "similarity_threshold": 0.0,
        },
    )
    assert response.status_code == 200, response.text
    events = _parse_events(response.text)
    names = [event["event"] for event in events]
    for expected in (
        "query_analyzed",
        "retrieval_started",
        "retrieval_completed",
        "reranking_completed",
        "evidence_evaluated",
        "generation_started",
        "token",
        "groundedness_completed",
        "citation",
        "completed",
    ):
        assert expected in names
    tokens = [
        event["data"]["token"]
        for event in events
        if event["event"] == "token"
    ]
    assert "".join(tokens) == (
        "The FAISS index stores semantic vectors for retrieval. [S1]"
    )
    completed = events[-1]["data"]
    assert completed["agent"]["validation_status"] == "VALID"
    assert completed["agent"]["groundedness_status"] == "GROUNDED"
    assert completed["sources"][0]["id"] == "S1"
