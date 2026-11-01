import re

from app.agent.state import CitationData

_CITATION_PATTERN = re.compile(r"\[(S\d+)\]", flags=re.IGNORECASE)


def extract_citation_ids(answer: str) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for match in _CITATION_PATTERN.finditer(answer):
        citation_id = match.group(1).upper()
        if citation_id in seen:
            continue
        seen.add(citation_id)
        ordered.append(citation_id)
    return ordered


def normalize_citation_ids(values: list[str]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for value in values:
        citation_id = str(value).strip().upper()
        if not re.fullmatch(r"S\d+", citation_id):
            continue
        if citation_id in seen:
            continue
        seen.add(citation_id)
        normalized.append(citation_id)
    return normalized


def build_citations(
    candidates: list[CitationData],
    used_ids: list[str],
) -> list[CitationData]:
    candidates_by_id = {
        str(candidate.get("citation_id", "")).upper(): candidate
        for candidate in candidates
        if candidate.get("citation_id")
    }
    citations: list[CitationData] = []
    seen: set[str] = set()
    for citation_id in normalize_citation_ids(used_ids):
        if citation_id in seen:
            continue
        candidate = candidates_by_id.get(citation_id)
        if candidate is None:
            continue
        seen.add(citation_id)
        citations.append(CitationData(**candidate))
    return citations
