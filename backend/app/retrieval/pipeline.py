import logging
import time
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.services.gemini_generation_service import GeminiGenerationService
from app.agent.state import RetrievedChunkData
from app.core.config import Settings
from app.models.document_chunk import DocumentChunk
from app.repositories.document_chunk_repository import DocumentChunkRepository
from app.retrieval.coverage import compute_evidence_coverage
from app.retrieval.lexical import LexicalDocument, bm25_search
from app.retrieval.reranker import apply_rerank_scores, rerank_candidates
from app.schemas.embedding import VectorSearchRequest
from app.services.document_indexing_service import DocumentIndexingService
from app.services.gemini_embedding_service import EmbeddingConfigurationError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RetrievalOptions:
    queries: list[str]
    document_ids: list[UUID] = field(default_factory=list)
    top_k: int = 8
    threshold: float = 0.35
    rerank_top_k: int = 10
    final_top_k: int = 5
    hybrid_enabled: bool = True
    reranking_enabled: bool = True
    neighbor_expansion_enabled: bool = False
    semantic_weight: float = 0.45
    lexical_weight: float = 0.30
    rrf_weight: float = 0.25
    rrf_k: int = 60


@dataclass(frozen=True)
class RetrievalPipelineResult:
    chunks: list[RetrievedChunkData]
    candidates: list[RetrievedChunkData]
    queries: list[str]
    per_query: list[dict[str, Any]]
    coverage: dict[str, Any]
    metadata: dict[str, Any]
    error: dict[str, Any] | None = None


def _chunk_data(chunk: DocumentChunk) -> RetrievedChunkData:
    return RetrievedChunkData(
        chunk_id=str(chunk.id),
        document_id=str(chunk.document_id),
        filename=str(
            chunk.chunk_metadata.get("filename") or "Unknown document"
        ),
        content=chunk.content,
        page_number=chunk.page_number,
        section_title=chunk.section_title,
        section_hierarchy=list(chunk.section_hierarchy),
        chunk_index=chunk.chunk_index,
        similarity_score=0.0,
        embedding_model=chunk.embedding_model or "",
        retrieval_queries=[],
        retrieval_sources=[],
        neighbor_chunks=[],
    )


def _normalize(values: dict[str, float]) -> dict[str, float]:
    if not values:
        return {}
    maximum = max(values.values())
    if maximum <= 0:
        return {key: 0.0 for key in values}
    return {key: value / maximum for key, value in values.items()}


class AdvancedRetrievalPipeline:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings,
        *,
        indexing_service: DocumentIndexingService,
        generation_service: GeminiGenerationService | None = None,
    ) -> None:
        self.session = session
        self.settings = settings
        self.indexing_service = indexing_service
        self.generation_service = generation_service
        self.chunk_repository = DocumentChunkRepository(session)

    async def run(self, options: RetrievalOptions) -> RetrievalPipelineResult:
        started = time.perf_counter()
        queries = list(dict.fromkeys(
            query.strip() for query in options.queries if query.strip()
        ))
        if not queries:
            queries = [""]
        per_query: list[dict[str, Any]] = []
        semantic_ranks: dict[str, dict[str, int]] = {}
        lexical_ranks: dict[str, dict[str, int]] = {}
        semantic_scores: dict[str, float] = {}
        lexical_scores: dict[str, float] = {}
        chunk_data: dict[str, RetrievedChunkData] = {}
        retrieval_error: dict[str, Any] | None = None
        index_versions: set[str] = set()
        semantic_failures = 0

        db_chunks = await self.chunk_repository.list_for_retrieval(
            document_ids=options.document_ids or None
        )
        for chunk in db_chunks:
            chunk_data[str(chunk.id)] = _chunk_data(chunk)

        lexical_documents = [
            LexicalDocument(chunk_id=str(chunk.id), content=chunk.content)
            for chunk in db_chunks
        ]

        for query in queries:
            query_started = time.perf_counter()
            semantic_count = 0
            lexical_count = 0
            try:
                response = await self.indexing_service.search(
                    VectorSearchRequest(
                        query=query,
                        document_ids=options.document_ids,
                        top_k=options.top_k,
                        threshold=options.threshold,
                    )
                )
                index_versions.add(str(response.index_version))
                semantic_rank_map: dict[str, int] = {}
                for result in response.results:
                    chunk_id = str(result.chunk_id)
                    if chunk_id not in chunk_data:
                        continue
                    semantic_rank_map[chunk_id] = result.rank
                    semantic_scores[chunk_id] = max(
                        semantic_scores.get(chunk_id, 0.0),
                        float(result.score),
                    )
                    existing = chunk_data[chunk_id]
                    existing["similarity_score"] = float(result.score)
                    existing["embedding_model"] = response.embedding_model
                    sources = list(existing.get("retrieval_sources", []))
                    if "semantic" not in sources:
                        sources.append("semantic")
                    existing["retrieval_sources"] = sources
                    query_list = list(existing.get("retrieval_queries", []))
                    if query not in query_list:
                        query_list.append(query)
                    existing["retrieval_queries"] = query_list
                semantic_ranks[query] = semantic_rank_map
                semantic_count = len(semantic_rank_map)
            except EmbeddingConfigurationError as exc:
                retrieval_error = {
                    "code": exc.code,
                    "category": "CONFIGURATION",
                    "message": (
                        "Document retrieval is unavailable because Gemini "
                        "embeddings are not configured."
                    ),
                    "retryable": False,
                }
                break
            except Exception as exc:
                semantic_failures += 1
                logger.warning(
                    "retrieval.semantic_query_failed",
                    extra={
                        "component": "retrieval",
                        "error_type": exc.__class__.__name__,
                    },
                )
                semantic_ranks[query] = {}

            lexical_matches = (
                bm25_search(
                    query,
                    lexical_documents,
                    top_k=options.top_k,
                )
                if options.hybrid_enabled
                else []
            )
            lexical_rank_map: dict[str, int] = {}
            for match in lexical_matches:
                chunk_id = match.chunk_id
                if chunk_id not in chunk_data:
                    continue
                lexical_rank_map[chunk_id] = match.rank
                lexical_scores[chunk_id] = max(
                    lexical_scores.get(chunk_id, 0.0),
                    float(match.score),
                )
                existing = chunk_data[chunk_id]
                sources = list(existing.get("retrieval_sources", []))
                if "lexical" not in sources:
                    sources.append("lexical")
                existing["retrieval_sources"] = sources
                query_list = list(existing.get("retrieval_queries", []))
                if query not in query_list:
                    query_list.append(query)
                existing["retrieval_queries"] = query_list
            lexical_ranks[query] = lexical_rank_map
            lexical_count = len(lexical_rank_map)

            per_query.append(
                {
                    "query": query,
                    "semantic_count": semantic_count,
                    "lexical_count": lexical_count,
                    "semantic_chunk_ids": list(semantic_rank_map.keys()),
                    "lexical_chunk_ids": list(lexical_rank_map.keys()),
                    "duration_ms": round(
                        (time.perf_counter() - query_started) * 1000, 2
                    ),
                }
            )

        if retrieval_error is not None:
            return RetrievalPipelineResult(
                chunks=[],
                candidates=[],
                queries=queries,
                per_query=per_query,
                coverage=compute_evidence_coverage(queries, []),
                metadata={
                    "retrieval_result_count": 0,
                    "retrieval_duration_ms": round(
                        (time.perf_counter() - started) * 1000, 2
                    ),
                },
                error=retrieval_error,
            )

        if semantic_failures == len(queries):
            return RetrievalPipelineResult(
                chunks=[],
                candidates=[],
                queries=queries,
                per_query=per_query,
                coverage=compute_evidence_coverage(queries, []),
                metadata={
                    "retrieval_result_count": 0,
                    "retrieval_duration_ms": round(
                        (time.perf_counter() - started) * 1000, 2
                    ),
                },
                error={
                    "code": "RETRIEVAL_FAILED",
                    "category": "RETRIEVAL",
                    "message": "Document retrieval failed. Please try again.",
                    "retryable": True,
                },
            )

        fusion_started = time.perf_counter()
        rrf_raw: dict[str, float] = {}
        for query in queries:
            for chunk_id, rank in semantic_ranks.get(query, {}).items():
                rrf_raw[chunk_id] = rrf_raw.get(chunk_id, 0.0) + (
                    options.semantic_weight / (options.rrf_k + rank)
                )
            for chunk_id, rank in lexical_ranks.get(query, {}).items():
                rrf_raw[chunk_id] = rrf_raw.get(chunk_id, 0.0) + (
                    options.lexical_weight / (options.rrf_k + rank)
                )

        semantic_normalized = _normalize(semantic_scores)
        lexical_normalized = _normalize(lexical_scores)
        rrf_normalized = _normalize(rrf_raw)
        weight_total = max(
            1e-9,
            options.semantic_weight
            + options.lexical_weight
            + options.rrf_weight,
        )

        candidates: list[RetrievedChunkData] = []
        for chunk_id, chunk in chunk_data.items():
            semantic_value = semantic_normalized.get(chunk_id, 0.0)
            lexical_value = lexical_normalized.get(chunk_id, 0.0)
            rrf_value = rrf_normalized.get(chunk_id, 0.0)
            if semantic_value <= 0 and lexical_value <= 0:
                continue
            fusion_score = (
                semantic_value * options.semantic_weight
                + lexical_value * options.lexical_weight
                + rrf_value * options.rrf_weight
            ) / weight_total
            candidate = RetrievedChunkData(**chunk)
            candidate["semantic_score"] = round(
                semantic_scores.get(chunk_id, 0.0), 6
            )
            candidate["lexical_score"] = round(
                lexical_scores.get(chunk_id, 0.0), 6
            )
            candidate["rrf_score"] = round(rrf_raw.get(chunk_id, 0.0), 8)
            candidate["fusion_score"] = round(fusion_score, 6)
            candidate["relevance_score"] = round(fusion_score, 6)
            semantic_matches = [
                rank
                for query in queries
                if (rank := semantic_ranks.get(query, {}).get(chunk_id))
                is not None
            ]
            lexical_matches = [
                rank
                for query in queries
                if (rank := lexical_ranks.get(query, {}).get(chunk_id))
                is not None
            ]
            candidate["semantic_rank"] = (
                min(semantic_matches) if semantic_matches else None
            )
            candidate["lexical_rank"] = (
                min(lexical_matches) if lexical_matches else None
            )
            candidates.append(candidate)

        candidates.sort(
            key=lambda item: (
                -float(item.get("fusion_score", 0.0)),
                -float(item.get("similarity_score", 0.0)),
                str(item.get("chunk_id")),
            )
        )
        for position, candidate in enumerate(candidates):
            candidate["fusion_rank"] = position + 1

        fusion_candidates = candidates[: max(options.rerank_top_k, 1)]
        rerank_result = await rerank_candidates(
            queries[0],
            fusion_candidates,
            service=self.generation_service,
            top_k=options.rerank_top_k,
            enabled=options.reranking_enabled,
        )
        final_chunks = apply_rerank_scores(
            rerank_result,
            top_k=options.final_top_k,
        )

        neighbor_count = 0
        if options.neighbor_expansion_enabled and final_chunks:
            neighbor_count = await self._expand_neighbors(final_chunks)

        for position, chunk in enumerate(final_chunks):
            chunk["citation_id"] = f"S{position + 1}"

        coverage = compute_evidence_coverage(queries, final_chunks)
        metadata = {
            "retrieval_result_count": len(final_chunks),
            "retrieval_fused_candidate_count": len(candidates),
            "retrieval_semantic_candidate_count": len(semantic_scores),
            "retrieval_lexical_candidate_count": len(lexical_scores),
            "retrieval_query_count": len(queries),
            "retrieval_index_versions": sorted(index_versions),
            "retrieval_hybrid_enabled": options.hybrid_enabled,
            "retrieval_reranking_enabled": options.reranking_enabled,
            "retrieval_rerank_method": rerank_result.method,
            "retrieval_rerank_error": rerank_result.error,
            "retrieval_rerank_top_k": options.rerank_top_k,
            "retrieval_final_top_k": options.final_top_k,
            "retrieval_neighbor_expansion": options.neighbor_expansion_enabled,
            "retrieval_neighbor_chunks": neighbor_count,
            "retrieval_coverage": coverage,
            "retrieval_strategy": (
                "langgraph_multi_query_hybrid_rrf_llm_rerank"
                if rerank_result.method == "gemini_llm"
                else "langgraph_multi_query_hybrid_rrf"
            ),
            "retrieval_fusion_ms": round(
                (time.perf_counter() - fusion_started) * 1000, 2
            ),
            "retrieval_duration_ms": round(
                (time.perf_counter() - started) * 1000, 2
            ),
        }
        logger.info(
            "retrieval.pipeline_completed",
            extra={
                "component": "retrieval",
                "query_count": len(queries),
                "candidate_count": len(candidates),
                "final_count": len(final_chunks),
                "rerank_method": rerank_result.method,
            },
        )
        return RetrievalPipelineResult(
            chunks=final_chunks,
            candidates=candidates,
            queries=queries,
            per_query=per_query,
            coverage=coverage,
            metadata=metadata,
        )

    async def _expand_neighbors(
        self, chunks: list[RetrievedChunkData]
    ) -> int:
        by_document: dict[str, list[RetrievedChunkData]] = {}
        for chunk in chunks:
            by_document.setdefault(
                str(chunk.get("document_id", "")), []
            ).append(chunk)

        added = 0
        for document_id, document_chunks in by_document.items():
            indexes = [int(chunk.get("chunk_index", 0)) for chunk in document_chunks]
            try:
                neighbors = await self.chunk_repository.get_neighbors(
                    document_id=UUID(document_id),
                    chunk_indexes=indexes,
                    radius=1,
                )
            except (TypeError, ValueError):
                continue
            neighbors_by_index = {chunk.chunk_index: chunk for chunk in neighbors}
            for parent in document_chunks:
                parent_index = int(parent.get("chunk_index", 0))
                neighbor_payloads = []
                expanded_parts = [str(parent.get("content", ""))]
                for index in (parent_index - 1, parent_index + 1):
                    neighbor = neighbors_by_index.get(index)
                    if neighbor is None:
                        continue
                    neighbor_payloads.append(
                        {
                            "chunk_id": str(neighbor.id),
                            "chunk_index": neighbor.chunk_index,
                            "content": neighbor.content,
                            "page_number": neighbor.page_number,
                            "section_title": neighbor.section_title,
                        }
                    )
                    expanded_parts.append(
                        "Neighboring evidence "
                        f"(chunk {neighbor.chunk_index + 1}): {neighbor.content}"
                    )
                if neighbor_payloads:
                    parent["neighbor_chunks"] = neighbor_payloads
                    parent["expanded_content"] = "\n\n".join(expanded_parts)
                    added += len(neighbor_payloads)
        return added

