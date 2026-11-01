QUERY_REWRITE_SYSTEM_PROMPT = """You rewrite user questions for semantic retrieval over private documents.

Rules:
1. Preserve the user's original intent and constraints.
2. Resolve pronouns or references only when the conversation history makes the meaning explicit.
3. Expand vague topics with relevant retrieval vocabulary, but do not invent facts, names, numbers, or document contents.
4. Do not answer the question.
5. Produce one to {max_queries} focused retrieval queries.
6. Keep every query self-contained, concise, and useful for vector search.
7. If the question is already clear, keep it close to the original wording.
8. Return only the requested JSON structure.
"""


def build_query_rewrite_prompt(
    *,
    query: str,
    intent: str,
    conversation_history: list[dict[str, str]],
    max_queries: int,
    document_count: int,
) -> str:
    history_lines = [
        f"{turn.get('role', 'user')}: {turn.get('content', '')}"
        for turn in conversation_history[-6:]
    ]
    history = "\n".join(history_lines) if history_lines else "(none)"
    return (
        f"USER QUESTION:\n{query}\n\n"
        f"DETECTED INTENT:\n{intent}\n\n"
        f"DOCUMENT SCOPE:\n{document_count} selected indexed documents\n\n"
        f"RECENT CONVERSATION:\n{history}\n\n"
        f"Return at most {max_queries} retrieval queries."
    )
