from types import SimpleNamespace
from uuid import uuid4

import numpy as np
import pytest
from pydantic import SecretStr

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.schemas.embedding import VectorSearchRequest
from app.services.gemini_embedding_service import (
    EmbeddingGenerationError,
    GeminiEmbeddingService,
)
from app.services.vector_index_service import (
    VectorIndexService,
    VectorRecord,
)


def _settings(tmp_path, **overrides) -> Settings:
    values = {
        "documind_gemini_api_key": SecretStr("test-key"),
        "gemini_embedding_dimension": 4,
        "gemini_embedding_batch_size": 2,
        "gemini_embedding_timeout_seconds": 1.0,
        "gemini_embedding_max_retries": 1,
        "gemini_embedding_retry_base_seconds": 0.0,
        "faiss_dir": tmp_path / "faiss",
        "faiss_backup_count": 2,
    }
    values.update(overrides)
    return Settings(**values)


def _record(document_id, chunk_index, vector):
    return VectorRecord(
        chunk_id=uuid4(),
        document_id=document_id,
        chunk_index=chunk_index,
        filename=f"document-{document_id}.txt",
        source_type="TXT",
        page_number=1,
        section_title="Section",
        section_hierarchy=["Section"],
        vector=np.asarray(vector, dtype=np.float32),
    )


class _FakeEmbeddingClient:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []
        self.models = SimpleNamespace(embed_content=self._embed_content)
        self.aio = SimpleNamespace(models=self.models)

    async def _embed_content(self, *, model, contents, config):
        self.calls.append(
            {
                "model": model,
                "contents": list(contents),
                "task_type": config.task_type,
                "dimension": config.output_dimensionality,
                "title": config.title,
            }
        )
        return SimpleNamespace(
            embeddings=[
                SimpleNamespace(values=[1.0, 0.0, 0.0, 0.0])
                for _ in contents
            ]
        )


@pytest.mark.asyncio
async def test_embedding_service_batches_normalizes_and_uses_task_types(tmp_path):
    settings = _settings(tmp_path)
    client = _FakeEmbeddingClient()
    service = GeminiEmbeddingService(settings, client=client)

    vectors = await service.embed_documents(["alpha", "beta", "gamma"], title="guide.txt")

    assert len(vectors) == 3
    assert [len(vector) for vector in vectors] == [4, 4, 4]
    assert np.allclose(np.linalg.norm(vectors[0]), 1.0)
    assert [call["task_type"] for call in client.calls] == [
        "RETRIEVAL_DOCUMENT",
        "RETRIEVAL_DOCUMENT",
    ]
    assert [call["dimension"] for call in client.calls] == [4, 4]
    assert [call["title"] for call in client.calls] == ["guide.txt", "guide.txt"]

    query = await service.embed_query("find alpha")
    assert len(query) == 4
    assert client.calls[-1]["task_type"] == "RETRIEVAL_QUERY"
    assert client.calls[-1]["title"] is None


@pytest.mark.asyncio
async def test_embedding_service_rejects_invalid_dimensions(tmp_path):
    settings = _settings(tmp_path)

    class BadClient(_FakeEmbeddingClient):
        async def _embed_content(self, *, model, contents, config):
            return SimpleNamespace(
                embeddings=[
                    SimpleNamespace(values=[1.0, 0.0]) for _ in contents
                ]
            )

    with pytest.raises(EmbeddingGenerationError) as exc_info:
        await GeminiEmbeddingService(settings, client=BadClient()).embed_documents(
            ["alpha"]
        )

    assert exc_info.value.code == "EMBEDDING_DIMENSION_MISMATCH"
    assert isinstance(exc_info.value, AppError)


@pytest.mark.asyncio
async def test_embedding_service_retries_retryable_errors(tmp_path):
    settings = _settings(tmp_path)
    attempts = 0

    class RetryClient(_FakeEmbeddingClient):
        async def _embed_content(self, *, model, contents, config):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                error = RuntimeError("temporary")
                error.status = 503
                raise error
            return await super()._embed_content(
                model=model, contents=contents, config=config
            )

    service = GeminiEmbeddingService(settings, client=RetryClient())
    vectors = await service.embed_documents(["alpha"])

    assert attempts == 2
    assert len(vectors) == 1


def test_vector_index_persists_filters_and_recovers_backup(tmp_path):
    settings = _settings(tmp_path)
    service = VectorIndexService(settings)
    first_document = uuid4()
    second_document = uuid4()
    first_record = _record(first_document, 0, [1.0, 0.0, 0.0, 0.0])
    second_record = _record(first_document, 1, [0.0, 1.0, 0.0, 0.0])
    third_record = _record(second_document, 0, [1.0, 0.0, 0.0, 0.0])

    service.upsert_document(first_document, [first_record, second_record])
    snapshot = service.upsert_document(second_document, [third_record])

    assert snapshot.status.value == "READY"
    assert snapshot.vector_count == 3
    assert snapshot.indexed_documents == 2

    matches, _ = service.search(
        [1.0, 0.0, 0.0, 0.0], top_k=5, threshold=0.0
    )
    assert len(matches) == 3
    assert matches[0].score == pytest.approx(1.0)

    filtered, _ = service.search(
        [1.0, 0.0, 0.0, 0.0],
        top_k=5,
        threshold=0.0,
        document_ids=[second_document],
    )
    assert len(filtered) == 1
    assert filtered[0].metadata["document_id"] == str(second_document)

    reloaded = VectorIndexService(settings)
    assert reloaded.get_status().vector_count == 3

    reloaded.index_path.write_bytes(b"corrupt")
    recovered = reloaded.get_status()
    assert recovered.recovered is True
    assert recovered.status.value == "READY"
    assert recovered.vector_count == 2

    remaining, _ = reloaded.search(
        [1.0, 0.0, 0.0, 0.0], top_k=5, threshold=0.0
    )
    assert len(remaining) == 2


@pytest.mark.asyncio
async def test_upload_auto_index_search_status_and_delete(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(
        settings, "documind_gemini_api_key", SecretStr("test-key")
    )

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

    upload = await client.post(
        "/api/v1/documents/upload",
        files={
            "file": (
                "alpha.txt",
                b"Alpha document content. " * 20,
                "text/plain",
            )
        },
    )
    assert upload.status_code == 201
    body = upload.json()
    document_id = body["document"]["id"]
    assert body["document"]["status"] == "indexed"
    assert body["document"]["indexing"]["state"] == "INDEXED"
    assert body["document"]["indexing"]["vector_count"] > 0

    status = await client.get(f"/api/v1/documents/{document_id}/index/status")
    assert status.status_code == 200
    assert status.json()["status"] == "INDEXED"
    assert status.json()["embedded_chunks"] == status.json()["total_chunks"]

    embedding_status = await client.get("/api/v1/embeddings/status")
    assert embedding_status.status_code == 200
    assert embedding_status.json()["status"] == "READY"

    index_status = await client.get("/api/v1/vectors/index/status")
    assert index_status.status_code == 200
    assert index_status.json()["status"] == "READY"
    assert index_status.json()["vector_count"] > 0

    search = await client.post(
        "/api/v1/vectors/search",
        json={"query": "alpha", "top_k": 3, "threshold": 0.0},
    )
    assert search.status_code == 200
    search_body = search.json()
    assert search_body["result_count"] > 0
    assert search_body["results"][0]["document_id"] == document_id
    assert search_body["results"][0]["score"] == pytest.approx(1.0)

    rebuilt = await client.post(
        "/api/v1/vectors/index/rebuild", json={}
    )
    assert rebuilt.status_code == 200
    assert rebuilt.json()["documents_processed"] == 1

    statistics = await client.get("/api/v1/vectors/statistics")
    assert statistics.status_code == 200
    assert statistics.json()["documents_indexed"] == 1

    removed = await client.delete(f"/api/v1/documents/{document_id}/index")
    assert removed.status_code == 200
    assert removed.json()["vector_count"] == 0

    empty_search = await client.post(
        "/api/v1/vectors/search",
        json={"query": "alpha", "document_ids": [document_id]},
    )
    assert empty_search.status_code == 200
    assert empty_search.json()["result_count"] == 0


@pytest.mark.asyncio
async def test_embedding_endpoints_report_not_configured(client):
    status = await client.get("/api/v1/embeddings/status")
    assert status.status_code == 200
    assert status.json()["status"] == "NOT_CONFIGURED"

    search = await client.post(
        "/api/v1/vectors/search", json={"query": "anything"}
    )
    assert search.status_code == 503
    assert search.json()["error"]["code"] == "EMBEDDING_NOT_CONFIGURED"

    missing = await client.post(
        "/api/v1/embeddings/generate", json={"document_id": str(uuid4())}
    )
    assert missing.status_code == 404
