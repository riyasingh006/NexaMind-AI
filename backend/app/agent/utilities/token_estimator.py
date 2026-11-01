import math


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, math.ceil(len(text) / 4))


def truncate_to_token_budget(text: str, token_budget: int) -> str:
    if token_budget <= 0 or not text:
        return ""
    character_budget = max(1, token_budget * 4)
    if len(text) <= character_budget:
        return text
    truncated = text[:character_budget].rstrip()
    if " " in truncated:
        truncated = truncated.rsplit(" ", 1)[0]
    return truncated + "\n[truncated to fit context budget]"
