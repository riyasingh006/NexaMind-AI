def summarize_prompt(prompt: str, max_length: int = 72) -> str:
    normalized = " ".join(prompt.split())
    if len(normalized) <= max_length:
        return normalized or "New conversation"
    return normalized[: max_length - 1].rstrip() + "…"
