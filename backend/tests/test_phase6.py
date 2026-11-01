from types import SimpleNamespace

import pytest
from pydantic import SecretStr

from app.agent.services.gemini_generation_service import (
    GeminiGenerationService,
    GenerationUnavailableError,
)
from app.core.config import get_settings
from app.evaluation.groundedness import split_claims, verify_groundedness
from app.services.gemini_embedding_service import GeminiEmbeddingService
from app.retrieval.coverage import compute_evidence_coverage
from app.retrieval.lexical import LexicalDocument, bm25_search
from app.retrieval.reranker import rerank_candidates


def _chunk(content: str, *, chunk_id: str = "chunk-1") -> dict:
    return {
        "chunk_id": chunk_id,
        "document_id": "00000000-0000-0000-0000-000000000001",
        "filename": "guide.txt",
        "content": content,
        "page_number": 1,
        "section_title": "Storage",
        "chunk_index": 0,
        "similarity_score": 0.82,
        "fusion_score": 0.72,
        "citation_id": "S1",
    }


def test_bm25_ranks_matching_chunk_above_unrelated_content():
    documents = [
        LexicalDocument("a", "The FAISS index stores semantic vectors."),
        LexicalDocument("b", "Completely unrelated billing information."),
    ]
    matches = bm25_search("How does FAISS store vectors?", documents, top_k=2)
    assert matches[0].chunk_id == "a"
    assert matches[0].score > 0
    assert all(match.chunk_id != "b" for match in matches)


def test_coverage_identifies_terms_and_citations():
    coverage = compute_evidence_coverage(
        ["FAISS vectors budget"],
        [_chunk("FAISS stores vectors for retrieval.")],
    )
    assert coverage["status"] == "PARTIAL"
    assert coverage["covered_terms"] == 2
    terms = {item["term"]: item for item in coverage["terms"]}
    assert terms["faiss"]["covered"] is True
    assert terms["faiss"]["citation_ids"] == ["S1"]
    assert terms["budget"]["covered"] is False


def test_claim_split_removes_citation_markers_and_short_fragments():
    claims = split_claims(
        "DocuMind uses FAISS. [S1]\n- It stores vectors for retrieval. [S2]\nHi."
    )
    assert claims == [
        "DocuMind uses FAISS.",
        "It stores vectors for retrieval.",
    ]


@pytest.mark.asyncio
async def test_reranker_falls_back_to_fusion_without_llm():
    result = await rerank_candidates(
        "FAISS vectors",
        [
            _chunk("FAISS stores vectors.", chunk_id="a"),
            _chunk("FAISS stores vectors.", chunk_id="b"),
        ],
        service=None,
        top_k=2,
        enabled=True,
    )
    assert result.method == "fusion_fallback"
    assert len(result.candidates) == 2


@pytest.mark.asyncio
async def test_groundedness_verifier_rejects_unverified_claims():
    class FakeService:
        async def generate_json(self, **kwargs):
            return SimpleNamespace(
                claims=[
                    SimpleNamespace(
                        claim_id="C1",
                        status="SUPPORTED",
                        evidence_ids=["S1"],
                        reason="Directly stated.",
                    ),
                    SimpleNamespace(
                        claim_id="C2",
                        status="UNSUPPORTED",
                        evidence_ids=[],
                        reason="Not in evidence.",
                    ),
                ]
            )

    report = await verify_groundedness(
        question="What does the guide say?",
        answer="FAISS stores vectors. [S1] The index costs $500. [S1]",
        context="[S1] FAISS stores vectors.",
        valid_citation_ids=["S1"],
        service=FakeService(),
        threshold=0.75,
    )
    assert report["status"] == "NOT_GROUNDED"
    assert report["total_claims"] == 2
    assert report["supported_claims"] == 1
    assert report["unsupported_claims"] == 1
    assert report["score"] == 0.5


def _configure_embeddings(monkeypatch) -> None:
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


async def _upload_alpha(client) -> str:
    upload = await client.post(
        "/api/v1/documents/upload",
        files={
            "file": (
                "phase6.txt",
                b"The FAISS index stores semantic vectors for retrieval. " * 40,
                "text/plain",
            )
        },
    )
    assert upload.status_code == 201, upload.text
    return upload.json()["document"]["id"]


@pytest.mark.asyncio
async def test_retrieval_inspector_exposes_hybrid_signals(client, monkeypatch):
    _configure_embeddings(monkeypatch)
    document_id = await _upload_alpha(client)

    async def no_rerank(self, **kwargs):
        raise GenerationUnavailableError("reranking unavailable")

    monkeypatch.setattr(GeminiGenerationService, "generate_json", no_rerank)

    response = await client.post(
        "/api/v1/retrieval/inspect",
        json={
            "query": "FAISS semantic vectors",
            "queries": ["FAISS semantic vectors", "retrieval index"],
            "document_ids": [document_id],
            "top_k": 5,
            "threshold": 0.0,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["strategy"] == "langgraph_multi_query_hybrid_rrf"
    assert body["queries"] == ["FAISS semantic vectors", "retrieval index"]
    assert body["candidates"]
    assert body["chunks"]
    assert body["chunks"][0]["citation_id"] == "S1"
    assert body["candidates"][0]["lexical_score"] > 0
    assert body["coverage"]["total_terms"] > 0
    assert body["warnings"]


@pytest.mark.asyncio
async def test_groundedness_endpoint_returns_claim_verdicts(client, monkeypatch):
    _configure_embeddings(monkeypatch)
    document_id = await _upload_alpha(client)
    settings = get_settings()
    monkeypatch.setattr(settings, "documind_rag_reranking_enabled", False)

    async def fake_generate(self, *, schema, **kwargs):
        return schema(
            claims=[
                {
                    "claim_id": "C1",
                    "status": "SUPPORTED",
                    "evidence_ids": ["S1"],
                    "reason": "The cited evidence states this.",
                }
            ]
        )

    monkeypatch.setattr(GeminiGenerationService, "generate_json", fake_generate)

    response = await client.post(
        "/api/v1/evaluation/groundedness",
        json={
            "question": "What does FAISS store?",
            "answer": "FAISS stores semantic vectors for retrieval. [S1]",
            "document_ids": [document_id],
            "top_k": 5,
            "threshold": 0.0,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "GROUNDED"
    assert body["score"] == 1.0
    assert body["claims"][0]["evidence_ids"] == ["S1"]
    assert "S1" in body["evidence_citations"]


@pytest.mark.asyncio
async def test_chat_graph_verifies_claims_before_finalizing(client, monkeypatch):
    _configure_embeddings(monkeypatch)
    document_id = await _upload_alpha(client)
    settings = get_settings()
    monkeypatch.setattr(settings, "documind_rag_reranking_enabled", False)

    async def fake_generate(self, *, schema, **kwargs):
        name = schema.__name__
        if name == "AnswerOutput":
            return schema(
                answer="The FAISS index stores semantic vectors for retrieval. [S1]",
                used_citation_ids=["S1"],
            )
        if name == "GroundednessOutput":
            return schema(
                claims=[
                    {
                        "claim_id": "C1",
                        "status": "SUPPORTED",
                        "evidence_ids": ["S1"],
                        "reason": "The cited chunk directly states this.",
                    }
                ]
            )
        raise GenerationUnavailableError("unexpected generation call")

    monkeypatch.setattr(GeminiGenerationService, "generate_json", fake_generate)

    response = await client.post(
        "/api/v1/chat/query",
        json={
            "prompt": "What does FAISS store?",
            "document_ids": [document_id],
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["answer"].endswith("[S1]")
    assert body["agent"]["groundedness_status"] == "GROUNDED"
    assert body["agent"]["groundedness_score"] == 1.0
    assert body["assistant_message"]["metadata"]["groundedness_status"] == (
        "GROUNDED"
    )
    assert body["retrieval"]["strategy"].startswith("langgraph_multi_query_hybrid")
