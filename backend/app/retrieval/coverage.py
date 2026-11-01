from typing import Any

from app.agent.state import RetrievedChunkData
from app.retrieval.lexical import query_terms


def compute_evidence_coverage(
    queries: list[str],
    chunks: list[RetrievedChunkData],
) -> dict[str, Any]:
    terms: list[str] = []
    for query in queries:
        for term in query_terms(query):
            if term not in terms:
                terms.append(term)
    terms = terms[:40]
    if not terms:
        return {
            "status": "UNKNOWN",
            "score": 0.0,
            "covered_terms": 0,
            "total_terms": 0,
            "terms": [],
        }

    searchable: list[tuple[str, str]] = []
    for chunk in chunks:
        content = " ".join(
            [
                str(chunk.get("content", "")),
                str(chunk.get("expanded_content", "")),
                str(chunk.get("section_title", "")),
            ]
        ).lower()
        citation_id = str(chunk.get("citation_id", ""))
        searchable.append((citation_id, content))

    aspects: list[dict[str, Any]] = []
    covered = 0
    for term in terms:
        citation_ids = [
            citation_id
            for citation_id, content in searchable
            if term in content
        ]
        is_covered = bool(citation_ids)
        if is_covered:
            covered += 1
        aspects.append(
            {
                "term": term,
                "covered": is_covered,
                "citation_ids": citation_ids[:5],
            }
        )

    score = covered / len(terms)
    if score >= 0.75:
        status = "COVERED"
    elif score > 0:
        status = "PARTIAL"
    else:
        status = "UNCOVERED"
    return {
        "status": status,
        "score": round(score, 6),
        "covered_terms": covered,
        "total_terms": len(terms),
        "terms": aspects,
    }
