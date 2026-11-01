from dataclasses import dataclass, field
from typing import Any

from app.agent.state import CitationData, RetrievedChunkData
from app.agent.utilities.token_estimator import (
    estimate_tokens,
    truncate_to_token_budget,
)


@dataclass(frozen=True)
class ContextBuildResult:
    context: str
    included_chunks: list[RetrievedChunkData] = field(default_factory=list)
    citations: list[CitationData] = field(default_factory=list)
    excluded_chunk_ids: list[str] = field(default_factory=list)
    token_count: int = 0


def _citation_excerpt(content: str, limit: int = 500) -> str:
    normalized = " ".join(content.split())
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit].rsplit(" ", 1)[0] + "..."


def _chunk_header(chunk: RetrievedChunkData, citation_id: str) -> str:
    parts = [f"[{citation_id}] document={chunk.get('filename') or 'Unknown'}"]
    page_number = chunk.get("page_number")
    if page_number is not None:
        parts.append(f"page={page_number}")
    section_title = chunk.get("section_title")
    if section_title:
        parts.append(f"section={section_title}")
    hierarchy = chunk.get("section_hierarchy") or []
    if hierarchy:
        parts.append("hierarchy=" + " > ".join(hierarchy))
    parts.append(f"similarity={float(chunk.get('similarity_score', 0.0)):.3f}")
    if chunk.get("fusion_score") is not None:
        parts.append(f"fusion={float(chunk.get('fusion_score', 0.0)):.3f}")
    if chunk.get("rerank_score") is not None:
        parts.append(f"rerank={float(chunk.get('rerank_score', 0.0)):.3f}")
    return " | ".join(parts)


def build_context(
    chunks: list[RetrievedChunkData],
    *,
    max_chunks: int,
    max_tokens: int,
) -> ContextBuildResult:
    if not chunks:
        return ContextBuildResult(context="")

    included: list[RetrievedChunkData] = []
    citations: list[CitationData] = []
    excluded: list[str] = []
    blocks: list[str] = []
    used_tokens = 0

    for position, chunk in enumerate(chunks):
        if len(included) >= max_chunks:
            excluded.append(str(chunk.get("chunk_id")))
            continue

        citation_id = f"S{len(included) + 1}"
        content = str(chunk.get("content", "")).strip()
        context_content = str(
            chunk.get("expanded_content") or content
        ).strip()
        if not content or not context_content:
            excluded.append(str(chunk.get("chunk_id")))
            continue

        header = _chunk_header(chunk, citation_id)
        remaining_tokens = max_tokens - used_tokens
        minimum_tokens = max(64, min(240, remaining_tokens))
        if included and remaining_tokens < minimum_tokens:
            excluded.append(str(chunk.get("chunk_id")))
            continue

        body_budget = max(1, remaining_tokens - estimate_tokens(header) - 8)
        body = truncate_to_token_budget(context_content, body_budget)
        if not body:
            excluded.append(str(chunk.get("chunk_id")))
            continue

        block = f"{header}\n{body}"
        block_tokens = estimate_tokens(block)
        if included and used_tokens + block_tokens > max_tokens:
            excluded.append(str(chunk.get("chunk_id")))
            continue

        included_chunk = RetrievedChunkData(**chunk)
        included_chunk["citation_id"] = citation_id
        included.append(included_chunk)
        blocks.append(block)
        used_tokens += block_tokens
        citations.append(
            CitationData(
                citation_id=citation_id,
                chunk_id=str(chunk.get("chunk_id")),
                document_id=str(chunk.get("document_id")),
                filename=str(chunk.get("filename") or "Unknown document"),
                page_number=chunk.get("page_number"),
                section_title=chunk.get("section_title"),
                relevant_excerpt=_citation_excerpt(content),
                similarity_score=float(chunk.get("similarity_score", 0.0)),
                chunk_index=int(chunk.get("chunk_index", 0)),
            )
        )

    return ContextBuildResult(
        context="\n\n".join(blocks),
        included_chunks=included,
        citations=citations,
        excluded_chunk_ids=excluded,
        token_count=estimate_tokens("\n\n".join(blocks)),
    )


def context_metadata(result: ContextBuildResult) -> dict[str, Any]:
    return {
        "context_token_count": result.token_count,
        "context_included_chunks": len(result.included_chunks),
        "context_excluded_chunks": len(result.excluded_chunk_ids),
        "context_excluded_chunk_ids": result.excluded_chunk_ids[:50],
    }
