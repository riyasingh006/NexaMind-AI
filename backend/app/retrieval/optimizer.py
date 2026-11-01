import hashlib
from dataclasses import dataclass, field

from app.agent.state import RetrievedChunkData
from app.retrieval.lexical import lexical_overlap, tokenize


@dataclass(frozen=True)
class OptimizedContext:
    chunks: list[RetrievedChunkData] = field(default_factory=list)
    removed_duplicates: int = 0
    removed_empty: int = 0
    removed_redundant: int = 0
    removed_excess: int = 0


def _hash(content: str) -> str:
    normalized = " ".join(content.lower().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _jaccard(left: str, right: str) -> float:
    left_terms = set(tokenize(left))
    right_terms = set(tokenize(right))
    if not left_terms or not right_terms:
        return 0.0
    return len(left_terms & right_terms) / len(left_terms | right_terms)


def optimize_chunks(
    chunks: list[RetrievedChunkData],
    *,
    query: str,
    max_chunks: int,
    redundancy_threshold: float = 0.82,
) -> OptimizedContext:
    seen_hashes: set[str] = set()
    candidates: list[RetrievedChunkData] = []
    removed_empty = 0
    removed_duplicates = 0

    for chunk in chunks:
        content = " ".join(str(chunk.get("content", "")).split())
        if len(content) < 20:
            removed_empty += 1
            continue
        digest = _hash(content)
        if digest in seen_hashes:
            removed_duplicates += 1
            continue
        seen_hashes.add(digest)
        normalized = RetrievedChunkData(**chunk)
        normalized["content"] = content
        normalized["relevance_score"] = round(
            float(
                normalized.get("rerank_score")
                or normalized.get("fusion_score")
                or normalized.get("similarity_score", 0.0)
            )
            * 0.75
            + lexical_overlap(content, query) * 0.25,
            6,
        )
        candidates.append(normalized)

    candidates.sort(
        key=lambda item: (
            float(
                item.get("rerank_score")
                or item.get("fusion_score")
                or item.get("similarity_score", 0.0)
            ),
            float(item.get("relevance_score", 0.0)),
        ),
        reverse=True,
    )

    selected: list[RetrievedChunkData] = []
    removed_redundant = 0
    for candidate in candidates:
        if len(selected) >= max_chunks:
            break
        content = str(candidate.get("content", ""))
        if any(
            _jaccard(content, str(item.get("content", ""))) >= redundancy_threshold
            for item in selected
        ):
            removed_redundant += 1
            continue
        selected.append(candidate)

    return OptimizedContext(
        chunks=selected,
        removed_duplicates=removed_duplicates,
        removed_empty=removed_empty,
        removed_redundant=removed_redundant,
        removed_excess=max(0, len(candidates) - len(selected) - removed_redundant),
    )
