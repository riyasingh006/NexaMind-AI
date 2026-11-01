from pydantic import SecretStr

from app.agent.agent_service import AgentService
from app.agent.services.gemini_generation_service import (
    GenerationUnavailableError,
)
from app.core.config import get_settings


async def _upload(client, name: str, content: bytes, content_type: str):
    return await client.post(
        "/api/v1/documents/upload",
        files={"file": (name, content, content_type)},
    )


async def test_dashboard_uses_real_persisted_counts_and_explicit_retrieval_state(
    client,
    monkeypatch,
):
    await _upload(client, "one.txt", b"one", "text/plain")
    await _upload(client, "two.md", b"# two", "text/markdown")
    monkeypatch.setattr(
        get_settings(), "documind_gemini_api_key", SecretStr("test-key")
    )

    async def unavailable(self, payload, emit):
        raise GenerationUnavailableError("Gemini unavailable in analytics test.")

    monkeypatch.setattr(AgentService, "run_stream", unavailable)
    query = await client.post(
        "/api/v1/chat/stream",
        json={"prompt": "What is in the documents?"},
    )
    assert query.status_code == 200
    assert "event: error" in query.text

    response = await client.get("/api/v1/analytics/dashboard?range=30d")
    assert response.status_code == 200
    body = response.json()
    assert body["range"] == "30d"
    assert body["documents"]["total_documents"] == 2
    assert body["documents"]["queued_documents"] == 0
    assert body["documents"]["indexed_documents"] == 2
    assert body["documents"]["total_chunks"] == 2
    assert body["documents"]["total_storage_bytes"] == 8
    assert body["documents"]["average_file_size_bytes"] == 4.0
    assert body["total_conversations"] == 1
    assert body["total_messages"] == 1
    assert body["total_user_queries"] == 1
    assert body["retrieval"]["status"] == "OPERATIONAL"
    assert body["retrieval"]["queries_recorded"] == 1
    assert body["retrieval"]["average_retrieval_latency_ms"] is None
    assert body["retrieval"]["success_rate"] is None
    assert body["retrieval"]["chunks_retrieved"] == 0


async def test_retrieval_and_document_analytics_endpoints(client):
    response = await client.get("/api/v1/analytics/retrieval?range=7d")
    assert response.status_code == 200
    retrieval = response.json()["retrieval"]
    assert retrieval["status"] == "OPERATIONAL"
    assert retrieval["queries_recorded"] == 0

    documents = await client.get("/api/v1/analytics/documents?range=90d")
    assert documents.status_code == 200
    assert documents.json()["statistics"]["total_documents"] == 0


async def test_analytics_rejects_invalid_range(client):
    response = await client.get("/api/v1/analytics/dashboard?range=365d")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"

