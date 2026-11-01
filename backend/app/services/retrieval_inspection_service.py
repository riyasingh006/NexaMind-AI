from time import perf_counter

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.services.gemini_generation_service import GeminiGenerationService
from app.agent.utilities.context_builder import build_context
from app.core.config import Settings, get_settings
from app.core.exceptions import ServiceUnavailableError
from app.evaluation.groundedness import verify_groundedness
from app.retrieval.pipeline import AdvancedRetrievalPipeline, RetrievalOptions
from app.schemas.retrieval import (
    CoverageTerm,
    EvidenceCoverageResponse,
    GroundednessClaimResponse,
    GroundednessEvaluationRequest,
    GroundednessEvaluationResponse,
    InspectorCandidate,
    InspectorChunk,
    InspectorNeighbor,
    QueryRetrievalTrace,
    RetrievalInspectRequest,
    RetrievalInspectResponse,
    RetrievalSettingsSummary,
)
from app.services.document_indexing_service import DocumentIndexingService
from app.services.gemini_embedding_service import EmbeddingConfigurationError


def _coverage(data: dict) -> EvidenceCoverageResponse:
    return EvidenceCoverageResponse(
        status=str(data.get("status", "UNKNOWN")),
        score=float(data.get("score", 0.0)),
        covered_terms=int(data.get("covered_terms", 0)),
        total_terms=int(data.get("total_terms", 0)),
        terms=[
            CoverageTerm(
                term=str(item.get("term", "")),
                covered=bool(item.get("covered")),
                citation_ids=[
                    str(value)
                    for value in item.get("citation_ids", [])
                ],
            )
            for item in data.get("terms", [])
        ],
    )


def _neighbors(chunk: dict) -> list[InspectorNeighbor]:
    return [
        InspectorNeighbor(
            chunk_id=str(item.get("chunk_id", "")),
            chunk_index=int(item.get("chunk_index", 0)),
            content=str(item.get("content", "")),
            page_number=item.get("page_number"),
            section_title=item.get("section_title"),
        )
        for item in chunk.get("neighbor_chunks", [])
    ]


class RetrievalInspectionService:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings | None = None,
        *,
        generation_service: GeminiGenerationService | None = None,
    ) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self.indexing_service = DocumentIndexingService(
            session, self.settings
        )
        self.generation_service = generation_service or GeminiGenerationService(
            self.settings
        )

    def _warnings(self, metadata: dict) -> list[str]:
        warnings: list[str] = []
        if metadata.get("retrieval_rerank_error"):
            warnings.append(
                "LLM reranking fell back to weighted hybrid fusion: "
                + str(metadata["retrieval_rerank_error"])
            )
        if metadata.get("retrieval_neighbor_expansion") and not metadata.get(
            "retrieval_neighbor_chunks"
        ):
            warnings.append("Neighbor expansion was enabled but added no chunks.")
        return warnings

    async def inspect(
        self, request: RetrievalInspectRequest
    ) -> RetrievalInspectResponse:
        started = perf_counter()
        top_k = request.top_k or self.settings.documind_rag_top_k
        threshold = (
            request.threshold
            if request.threshold is not None
            else self.settings.documind_rag_similarity_threshold
        )
        rerank_top_k = (
            request.rerank_top_k or self.settings.documind_rag_rerank_top_k
        )
        final_top_k = (
            request.final_top_k or self.settings.documind_rag_final_top_k
        )
        queries = request.queries or [request.query]
        pipeline = AdvancedRetrievalPipeline(
            self.session,
            self.settings,
            indexing_service=self.indexing_service,
            generation_service=self.generation_service,
        )
        result = await pipeline.run(
            RetrievalOptions(
                queries=queries,
                document_ids=request.document_ids,
                top_k=top_k,
                threshold=threshold,
                rerank_top_k=rerank_top_k,
                final_top_k=final_top_k,
                hybrid_enabled=self.settings.documind_rag_hybrid_search_enabled,
                reranking_enabled=self.settings.documind_rag_reranking_enabled,
                neighbor_expansion_enabled=(
                    self.settings.documind_rag_neighbor_expansion_enabled
                ),
                semantic_weight=self.settings.documind_rag_semantic_weight,
                lexical_weight=self.settings.documind_rag_lexical_weight,
                rrf_weight=self.settings.documind_rag_rrf_weight,
                rrf_k=self.settings.documind_rag_rrf_k,
            )
        )
        if result.error:
            if result.error.get("category") == "CONFIGURATION":
                raise EmbeddingConfigurationError(
                    result.error["message"],
                    details={"code": result.error.get("code")},
                )
            raise ServiceUnavailableError(
                str(result.error.get("message", "Retrieval is unavailable.")),
                code=str(result.error.get("code", "RETRIEVAL_UNAVAILABLE")),
            )

        candidates = [
            InspectorCandidate(
                chunk_id=str(chunk.get("chunk_id", "")),
                document_id=str(chunk.get("document_id", "")),
                document_name=str(chunk.get("filename") or "Unknown document"),
                chunk_index=int(chunk.get("chunk_index", 0)),
                page_number=chunk.get("page_number"),
                section_title=chunk.get("section_title"),
                semantic_score=float(chunk.get("semantic_score", 0.0)),
                lexical_score=float(chunk.get("lexical_score", 0.0)),
                rrf_score=float(chunk.get("rrf_score", 0.0)),
                fusion_score=float(chunk.get("fusion_score", 0.0)),
                rerank_score=(
                    float(chunk["rerank_score"])
                    if chunk.get("rerank_score") is not None
                    else None
                ),
                relevance_score=float(chunk.get("relevance_score", 0.0)),
                semantic_rank=chunk.get("semantic_rank"),
                lexical_rank=chunk.get("lexical_rank"),
                fusion_rank=chunk.get("fusion_rank"),
                rerank_rank=chunk.get("rerank_rank"),
                retrieval_sources=list(chunk.get("retrieval_sources", [])),
                content=str(chunk.get("content", "")),
            )
            for chunk in result.candidates
        ]
        chunks = [
            InspectorChunk(
                citation_id=str(chunk.get("citation_id", "")),
                chunk_id=str(chunk.get("chunk_id", "")),
                document_id=str(chunk.get("document_id", "")),
                document_name=str(chunk.get("filename") or "Unknown document"),
                chunk_index=int(chunk.get("chunk_index", 0)),
                page_number=chunk.get("page_number"),
                section_title=chunk.get("section_title"),
                semantic_score=float(chunk.get("semantic_score", 0.0)),
                lexical_score=float(chunk.get("lexical_score", 0.0)),
                fusion_score=float(chunk.get("fusion_score", 0.0)),
                rerank_score=(
                    float(chunk["rerank_score"])
                    if chunk.get("rerank_score") is not None
                    else None
                ),
                relevance_score=float(chunk.get("relevance_score", 0.0)),
                rerank_rank=chunk.get("rerank_rank"),
                retrieval_sources=list(chunk.get("retrieval_sources", [])),
                content=str(chunk.get("content", "")),
                expanded_content=chunk.get("expanded_content"),
                neighbors=_neighbors(chunk),
            )
            for chunk in result.chunks
        ]
        metadata = result.metadata
        return RetrievalInspectResponse(
            query=request.query,
            queries=result.queries,
            strategy=str(metadata.get("retrieval_strategy", "hybrid")),
            duration_ms=float(
                metadata.get(
                    "retrieval_duration_ms",
                    round((perf_counter() - started) * 1000, 2),
                )
            ),
            hybrid_search_enabled=self.settings.documind_rag_hybrid_search_enabled,
            reranking_enabled=self.settings.documind_rag_reranking_enabled,
            neighbor_expansion_enabled=(
                self.settings.documind_rag_neighbor_expansion_enabled
            ),
            settings=RetrievalSettingsSummary(
                top_k=top_k,
                similarity_threshold=threshold,
                hybrid_search_enabled=(
                    self.settings.documind_rag_hybrid_search_enabled
                ),
                semantic_weight=self.settings.documind_rag_semantic_weight,
                lexical_weight=self.settings.documind_rag_lexical_weight,
                rrf_weight=self.settings.documind_rag_rrf_weight,
                rrf_k=self.settings.documind_rag_rrf_k,
                reranking_enabled=self.settings.documind_rag_reranking_enabled,
                rerank_top_k=rerank_top_k,
                final_top_k=final_top_k,
                neighbor_expansion_enabled=(
                    self.settings.documind_rag_neighbor_expansion_enabled
                ),
                embedding_model=self.settings.gemini_embedding_model,
                embedding_dimension=self.settings.gemini_embedding_dimension,
            ),
            per_query=[
                QueryRetrievalTrace(
                    query=str(item.get("query", "")),
                    semantic_count=int(item.get("semantic_count", 0)),
                    lexical_count=int(item.get("lexical_count", 0)),
                    semantic_chunk_ids=list(
                        item.get("semantic_chunk_ids", [])
                    ),
                    lexical_chunk_ids=list(item.get("lexical_chunk_ids", [])),
                    duration_ms=float(item.get("duration_ms", 0.0)),
                )
                for item in result.per_query
            ],
            candidates=candidates,
            chunks=chunks,
            coverage=_coverage(result.coverage),
            warnings=self._warnings(metadata),
            metadata={
                key: value
                for key, value in metadata.items()
                if key
                in {
                    "retrieval_rerank_method",
                    "retrieval_rerank_error",
                    "retrieval_neighbor_chunks",
                    "retrieval_fused_candidate_count",
                    "retrieval_semantic_candidate_count",
                    "retrieval_lexical_candidate_count",
                    "retrieval_index_versions",
                }
            },
        )

    async def evaluate_groundedness(
        self, request: GroundednessEvaluationRequest
    ) -> GroundednessEvaluationResponse:
        started = perf_counter()
        top_k = request.top_k or self.settings.documind_rag_top_k
        threshold = (
            request.threshold
            if request.threshold is not None
            else self.settings.documind_rag_similarity_threshold
        )
        pipeline = AdvancedRetrievalPipeline(
            self.session,
            self.settings,
            indexing_service=self.indexing_service,
            generation_service=self.generation_service,
        )
        result = await pipeline.run(
            RetrievalOptions(
                queries=[request.question],
                document_ids=request.document_ids,
                top_k=top_k,
                threshold=threshold,
                rerank_top_k=self.settings.documind_rag_rerank_top_k,
                final_top_k=self.settings.documind_rag_final_top_k,
                hybrid_enabled=self.settings.documind_rag_hybrid_search_enabled,
                reranking_enabled=self.settings.documind_rag_reranking_enabled,
                neighbor_expansion_enabled=(
                    self.settings.documind_rag_neighbor_expansion_enabled
                ),
                semantic_weight=self.settings.documind_rag_semantic_weight,
                lexical_weight=self.settings.documind_rag_lexical_weight,
                rrf_weight=self.settings.documind_rag_rrf_weight,
                rrf_k=self.settings.documind_rag_rrf_k,
            )
        )
        if result.error:
            if result.error.get("category") == "CONFIGURATION":
                raise EmbeddingConfigurationError(
                    result.error["message"],
                    details={"code": result.error.get("code")},
                )
            raise ServiceUnavailableError(
                str(result.error.get("message", "Retrieval is unavailable.")),
                code=str(result.error.get("code", "RETRIEVAL_UNAVAILABLE")),
            )

        built = build_context(
            result.chunks,
            max_chunks=self.settings.documind_rag_max_context_chunks,
            max_tokens=self.settings.documind_rag_max_context_tokens,
        )
        report = await verify_groundedness(
            question=request.question,
            answer=request.answer,
            context=built.context,
            valid_citation_ids=[
                str(citation.get("citation_id", ""))
                for citation in built.citations
            ],
            service=self.generation_service,
            threshold=self.settings.documind_groundedness_threshold,
        )
        return GroundednessEvaluationResponse(
            question=request.question,
            answer=request.answer,
            status=str(report.get("status", "FAILED")),
            score=report.get("score"),
            threshold=float(report.get("threshold", 0.0)),
            total_claims=int(report.get("total_claims", 0)),
            supported_claims=int(report.get("supported_claims", 0)),
            partial_claims=int(report.get("partial_claims", 0)),
            unsupported_claims=int(report.get("unsupported_claims", 0)),
            claims=[
                GroundednessClaimResponse(
                    claim_id=str(item.get("claim_id", "")),
                    claim=str(item.get("claim", "")),
                    status=str(item.get("status", "")),
                    evidence_ids=list(item.get("evidence_ids", [])),
                    reason=str(item.get("reason", "")),
                )
                for item in report.get("claims", [])
            ],
            issues=list(report.get("issues", [])),
            evidence_citations=[
                str(citation.get("citation_id", ""))
                for citation in built.citations
            ],
            coverage=_coverage(result.coverage),
            duration_ms=round((perf_counter() - started) * 1000, 2),
        )
