import math
import re
from dataclasses import dataclass
from typing import Iterable

_TOKEN_PATTERN = re.compile(r"[a-z0-9][a-z0-9_-]{1,}")
_STOPWORDS = {
    "a",
    "about",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "can",
    "could",
    "did",
    "do",
    "does",
    "for",
    "from",
    "had",
    "has",
    "have",
    "how",
    "i",
    "in",
    "into",
    "is",
    "it",
    "its",
    "may",
    "of",
    "on",
    "or",
    "our",
    "should",
    "that",
    "the",
    "their",
    "this",
    "to",
    "was",
    "were",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "will",
    "with",
    "would",
}


def tokenize(text: str) -> list[str]:
    return [
        token
        for token in _TOKEN_PATTERN.findall(text.lower())
        if token not in _STOPWORDS and len(token) > 1
    ]


def query_terms(text: str) -> list[str]:
    return list(dict.fromkeys(tokenize(text)))


@dataclass(frozen=True)
class LexicalDocument:
    chunk_id: str
    content: str


@dataclass(frozen=True)
class LexicalMatch:
    chunk_id: str
    score: float
    rank: int


def bm25_search(
    query: str,
    documents: Iterable[LexicalDocument],
    *,
    top_k: int = 10,
    k1: float = 1.5,
    b: float = 0.75,
) -> list[LexicalMatch]:
    terms = query_terms(query)
    corpus = list(documents)
    if not terms or not corpus:
        return []

    tokenized = [tokenize(document.content) for document in corpus]
    lengths = [len(tokens) for tokens in tokenized]
    average_length = sum(lengths) / len(lengths) if lengths else 0.0
    if average_length <= 0:
        return []

    document_frequency: dict[str, int] = {}
    for tokens in tokenized:
        for term in set(tokens):
            if term in terms:
                document_frequency[term] = document_frequency.get(term, 0) + 1

    total_documents = len(corpus)
    idf = {
        term: math.log(1 + (total_documents - frequency + 0.5) / (frequency + 0.5))
        for term, frequency in document_frequency.items()
    }

    scored: list[tuple[float, str]] = []
    for document, tokens, length in zip(corpus, tokenized, lengths, strict=True):
        frequencies: dict[str, int] = {}
        for token in tokens:
            if token in terms:
                frequencies[token] = frequencies.get(token, 0) + 1
        if not frequencies:
            continue
        score = 0.0
        normalization = k1 * (1 - b + b * (length / average_length))
        for term, frequency in frequencies.items():
            numerator = frequency * (k1 + 1)
            score += idf.get(term, 0.0) * (numerator / (frequency + normalization))
        if score > 0:
            scored.append((score, document.chunk_id))

    scored.sort(key=lambda item: (-item[0], item[1]))
    return [
        LexicalMatch(chunk_id=chunk_id, score=round(score, 6), rank=position + 1)
        for position, (score, chunk_id) in enumerate(scored[:top_k])
    ]


def lexical_overlap(content: str, query: str) -> float:
    terms = query_terms(query)
    if not terms:
        return 0.0
    content_terms = set(tokenize(content))
    return sum(1 for term in terms if term in content_terms) / len(terms)
