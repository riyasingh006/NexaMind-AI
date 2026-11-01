import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from pydantic import BaseModel, Field

from app.agent.prompts.answer_generation import (
    ANSWER_GENERATION_SYSTEM_PROMPT,
    STREAMING_ANSWER_SYSTEM_PROMPT,
    build_answer_generation_prompt,
)
from app.agent.services.gemini_generation_service import (
    GenerationResponseError,
    GeminiGenerationService,
)
from app.agent.state import AgentState
from app.agent.utilities.citation_builder import (
    extract_citation_ids,
    normalize_citation_ids,
)

logger = logging.getLogger(__name__)

TokenCallback = Callable[[str], Awaitable[None] | None]


class AnswerOutput(BaseModel):
    answer: str = Field(min_length=1, max_length=20000)
    used_citation_ids: list[str] = Field(default_factory=list, max_length=30)


async def generate_answer(
    state: AgentState,
    *,
    service: GeminiGenerationService,
    temperature: float,
) -> dict[str, Any]:
    started = time.perf_counter()
    output = await service.generate_json(
        prompt=build_answer_generation_prompt(
            query=str(state.get("user_query", "")),
            rewritten_query=str(state.get("rewritten_query", "")),
            intent=str(state.get("query_intent", "")),
            evidence_status=str(state.get("evidence_status", "")),
            context=str(state.get("context", "")),
            conversation_history=list(state.get("conversation_history", [])),
            validation_issues=list(state.get("validation_issues", [])),
        ),
        system_instruction=ANSWER_GENERATION_SYSTEM_PROMPT,
        schema=AnswerOutput,
        temperature=temperature,
    )
    answer = output.answer.strip()
    metadata = {
        **state.get("processing_metadata", {}),
        "generation_model": service.model,
        "generation_duration_ms": round(
            (time.perf_counter() - started) * 1000, 2
        ),
        "generation_used_citation_ids": normalize_citation_ids(
            output.used_citation_ids
        ),
    }
    logger.info(
        "agent.answer_generated",
        extra={
            "component": "agent",
            "conversation_id": state.get("conversation_id"),
            "generation_model": service.model,
            "answer_characters": len(answer),
        },
    )
    return {
        "generation_result": {
            "answer": answer,
            "used_citation_ids": normalize_citation_ids(
                output.used_citation_ids
            ),
        },
        "final_answer": answer,
        "processing_metadata": metadata,
    }


async def generate_answer_stream(
    state: AgentState,
    *,
    service: GeminiGenerationService,
    temperature: float,
    on_token: TokenCallback | None = None,
) -> dict[str, Any]:
    started = time.perf_counter()
    first_token_ms: float | None = None
    chunks: list[str] = []
    async for token in service.stream_text(
        prompt=build_answer_generation_prompt(
            query=str(state.get("user_query", "")),
            rewritten_query=str(state.get("rewritten_query", "")),
            intent=str(state.get("query_intent", "")),
            evidence_status=str(state.get("evidence_status", "")),
            context=str(state.get("context", "")),
            conversation_history=list(state.get("conversation_history", [])),
            validation_issues=list(state.get("validation_issues", [])),
            streaming=True,
        ),
        system_instruction=STREAMING_ANSWER_SYSTEM_PROMPT,
        temperature=temperature,
    ):
        if not token:
            continue
        if first_token_ms is None:
            first_token_ms = round(
                (time.perf_counter() - started) * 1000, 2
            )
        chunks.append(token)
        if on_token is not None:
            callback_result = on_token(token)
            if callback_result is not None:
                await callback_result

    answer = "".join(chunks).strip()
    if not answer:
        raise GenerationResponseError(
            "Gemini returned an empty streaming response.",
            details={"model": service.model},
        )

    used_citation_ids = extract_citation_ids(answer)
    metadata = {
        **state.get("processing_metadata", {}),
        "generation_model": service.model,
        "generation_duration_ms": round(
            (time.perf_counter() - started) * 1000, 2
        ),
        "generation_first_token_ms": first_token_ms,
        "generation_streamed": True,
        "generation_used_citation_ids": used_citation_ids,
    }
    logger.info(
        "agent.answer_stream_generated",
        extra={
            "component": "agent",
            "conversation_id": state.get("conversation_id"),
            "generation_model": service.model,
            "answer_characters": len(answer),
            "first_token_ms": first_token_ms,
        },
    )
    return {
        "generation_result": {
            "answer": answer,
            "used_citation_ids": used_citation_ids,
        },
        "final_answer": answer,
        "processing_metadata": metadata,
    }
