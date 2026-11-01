from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any
from uuid import UUID

from app.agent.state import AgentState
from app.retrieval.pipeline import AdvancedRetrievalPipeline, RetrievalOptions

if TYPE_CHECKING:
    from app.agent.services.gemini_generation_service import (
        GeminiGenerationService,
    )
    from app.services.document_indexing_service import DocumentIndexingService

logger = logging.getLogger(__name__)


async def retrieve_documents(
    state: AgentState,
    *,
    indexing_service: DocumentIndexingService,
    default_top_k: int,
    default_threshold: float,
    max_retrieval_queries: int,
    generation_service: GeminiGenerationService | None = None,
    multi_query_enabled: bool = True,
    hybrid_search_enabled: bool = True,
    semantic_weight: float = 0.45,
    lexical_weight: float = 0.30,
    rrf_weight: float = 0.25,
    rrf_k: int = 60,
    reranking_enabled: bool = True,
    rerank_top_k: int = 10,
    final_top_k: int = 5,
    neighbor_expansion_enabled: bool = False,
) -> dict[str, Any]:
    queries = [
        query.strip()
        for query in state.get("retrieval_queries", [])[:max_retrieval_queries]
        if query.strip()
    ]
    if not queries:
        queries = [str(state.get("user_query", "")).strip()]
    queries = list(dict.fromkeys(queries))
    if not multi_query_enabled:
        queries = queries[:1]

    document_ids = [
        UUID(str(value)) for value in state.get("scope_document_ids", [])
    ]
    top_k = int(state.get("top_k") or default_top_k)
    threshold = float(
        state.get("similarity_threshold")
        if state.get("similarity_threshold") is not None
        else default_threshold
    )
    metadata = dict(state.get("processing_metadata", {}))
    metadata.update(
        {
            "retrieval_query_count": len(queries),
            "retrieval_top_k": top_k,
            "retrieval_threshold": threshold,
            "retrieval_document_scope_count": len(document_ids),
        }
    )

    settings = indexing_service.settings
    pipeline = AdvancedRetrievalPipeline(
        indexing_service.session,
        settings,
        indexing_service=indexing_service,
        generation_service=generation_service,
    )
    result = await pipeline.run(
        RetrievalOptions(
            queries=queries,
            document_ids=document_ids,
            top_k=top_k,
            threshold=threshold,
            rerank_top_k=rerank_top_k,
            final_top_k=final_top_k,
            hybrid_enabled=hybrid_search_enabled,
            reranking_enabled=reranking_enabled,
            neighbor_expansion_enabled=neighbor_expansion_enabled,
            semantic_weight=semantic_weight,
            lexical_weight=lexical_weight,
            rrf_weight=rrf_weight,
            rrf_k=rrf_k,
        )
    )
    metadata.update(result.metadata)
    metadata["retrieval_per_query"] = result.per_query
    metadata["retrieval_queries"] = result.queries
    metadata["retrieval_coverage"] = result.coverage
    if result.error:
        metadata["retrieval_failed"] = True

    logger.info(
        "agent.retrieval_completed",
        extra={
            "component": "agent",
            "conversation_id": state.get("conversation_id"),
            "retrieval_query_count": len(queries),
            "retrieval_result_count": len(result.chunks),
            "retrieval_failed": result.error is not None,
        },
    )
    return {
        "retrieved_chunks": result.chunks,
        "retrieval_error": result.error,
        "evidence_coverage": result.coverage,
        "processing_metadata": metadata,
    }
