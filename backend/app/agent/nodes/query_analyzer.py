import logging
import re
import time
from typing import Any

from pydantic import BaseModel, Field

from app.agent.state import AgentState, QueryIntent

logger = logging.getLogger(__name__)

_STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "what",
    "which",
    "who",
    "when",
    "where",
    "why",
    "how",
    "does",
    "did",
    "are",
    "was",
    "were",
    "about",
    "into",
    "over",
    "under",
    "between",
    "explain",
    "describe",
    "tell",
    "please",
    "document",
    "documents",
    "report",
    "paper",
}
_FOLLOW_UP_MARKERS = {
    "it",
    "its",
    "they",
    "them",
    "their",
    "that",
    "this",
    "those",
    "these",
    "above",
    "previous",
    "former",
    "latter",
    "same",
    "also",
    "more",
}
_VAGUE_TERMS = {
    "security",
    "requirements",
    "policy",
    "results",
    "findings",
    "details",
    "information",
    "things",
    "stuff",
    "summary",
    "overview",
}
_GREETING_PATTERN = re.compile(
    r"^(hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you)\b",
    flags=re.IGNORECASE,
)
_OUT_OF_SCOPE_PATTERN = re.compile(
    r"\b(weather|joke|who are you|what can you do|your model|your prompt)\b",
    flags=re.IGNORECASE,
)


class QueryAnalysis(BaseModel):
    intent: QueryIntent
    requires_documents: bool
    needs_rewrite: bool
    is_ambiguous: bool
    uses_conversation_history: bool
    keywords: list[str] = Field(default_factory=list)
    entities: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)


def _keywords(query: str) -> list[str]:
    tokens = re.findall(r"[A-Za-z0-9][A-Za-z0-9_-]{2,}", query.lower())
    seen: set[str] = set()
    values: list[str] = []
    for token in tokens:
        if token in _STOPWORDS or token in seen:
            continue
        seen.add(token)
        values.append(token)
        if len(values) >= 12:
            break
    return values


def _entities(query: str) -> list[str]:
    values = re.findall(r"\b[A-Z][A-Za-z0-9_-]{1,}\b", query)
    quoted = re.findall(r"[\"']([^\"']{2,80})[\"']", query)
    ordered: list[str] = []
    seen: set[str] = set()
    for value in [*quoted, *values]:
        normalized = value.strip()
        if normalized.lower() in _STOPWORDS or normalized in seen:
            continue
        seen.add(normalized)
        ordered.append(normalized)
        if len(ordered) >= 8:
            break
    return ordered


def analyze_query_text(
    query: str, conversation_history: list[dict[str, str]]
) -> QueryAnalysis:
    normalized = " ".join(query.split())
    lower = normalized.lower()
    tokens = re.findall(r"[A-Za-z0-9][A-Za-z0-9_-]*", lower)
    token_set = set(tokens)
    has_history = bool(conversation_history)

    if _GREETING_PATTERN.search(normalized):
        return QueryAnalysis(
            intent=QueryIntent.OUT_OF_SCOPE,
            requires_documents=False,
            needs_rewrite=False,
            is_ambiguous=False,
            uses_conversation_history=False,
        )
    if _OUT_OF_SCOPE_PATTERN.search(normalized):
        return QueryAnalysis(
            intent=QueryIntent.OUT_OF_SCOPE,
            requires_documents=False,
            needs_rewrite=False,
            is_ambiguous=False,
            uses_conversation_history=False,
        )

    follow_up = has_history and (
        bool(token_set & _FOLLOW_UP_MARKERS)
        or bool(re.search(r"\b(what about|and also|continue|elaborate)\b", lower))
    )
    vague = bool(token_set & _VAGUE_TERMS)
    pronoun_without_context = bool(
        token_set & {"it", "its", "they", "them", "this", "that", "those"}
    ) and not has_history

    if re.search(r"\b(compare|versus|vs\.?|difference|contrast)\b", lower):
        intent = QueryIntent.COMPARISON
    elif re.search(r"\b(summarize|summary|overview|key points)\b", lower):
        intent = QueryIntent.SUMMARY
    elif follow_up:
        intent = QueryIntent.FOLLOW_UP
    elif re.search(
        r"\b(and also|then|both|first|second|multiple|step by step)\b", lower
    ):
        intent = QueryIntent.MULTI_HOP_QUESTION
    elif re.search(r"\b(explain|why|how|walk me through)\b", lower):
        intent = QueryIntent.EXPLANATION
    elif re.search(
        r"\b(document|report|paper|section|page|file|attachment)\b", lower
    ):
        intent = QueryIntent.DOCUMENT_ANALYSIS
    elif pronoun_without_context or len(tokens) <= 3 or (vague and len(tokens) <= 5):
        intent = QueryIntent.AMBIGUOUS
    else:
        intent = QueryIntent.FACTUAL_LOOKUP

    needs_rewrite = (
        intent
        in {
            QueryIntent.AMBIGUOUS,
            QueryIntent.FOLLOW_UP,
            QueryIntent.MULTI_HOP_QUESTION,
            QueryIntent.COMPARISON,
        }
        or len(tokens) < 5
        or pronoun_without_context
        or (vague and len(tokens) <= 8)
    )

    constraints = [
        token
        for token in re.findall(r"[A-Za-z0-9][A-Za-z0-9_./%-]*", normalized)
        if any(character.isdigit() for character in token)
        or token.isupper()
        and len(token) > 1
    ][:8]

    return QueryAnalysis(
        intent=intent,
        requires_documents=True,
        needs_rewrite=needs_rewrite,
        is_ambiguous=intent == QueryIntent.AMBIGUOUS,
        uses_conversation_history=follow_up,
        keywords=_keywords(normalized),
        entities=_entities(normalized),
        constraints=constraints,
    )


async def analyze_query(state: AgentState) -> dict[str, Any]:
    started = time.perf_counter()
    query = str(state.get("user_query", "")).strip()
    history = list(state.get("conversation_history", []))
    analysis = analyze_query_text(query, history)
    metadata = {
        **state.get("processing_metadata", {}),
        "analysis": analysis.model_dump(mode="json"),
        "analysis_duration_ms": round(
            (time.perf_counter() - started) * 1000, 2
        ),
    }
    logger.info(
        "agent.query_analyzed",
        extra={
            "component": "agent",
            "conversation_id": state.get("conversation_id"),
            "query_intent": analysis.intent.value,
            "query_rewrite_required": analysis.needs_rewrite,
        },
    )
    return {
        "original_query": query,
        "analyzed_query": query,
        "query_intent": analysis.intent.value,
        "requires_retrieval": analysis.requires_documents,
        "needs_rewrite": analysis.needs_rewrite,
        "out_of_scope": analysis.intent == QueryIntent.OUT_OF_SCOPE,
        "processing_metadata": metadata,
    }
