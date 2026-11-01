from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import Field, field_validator

from app.schemas.chat import ChatQueryRequest
from app.schemas.common import APIModel


class ChatStreamEventType(str, Enum):
    WORKFLOW_STARTED = "workflow_started"
    QUERY_ANALYZED = "query_analyzed"
    RETRIEVAL_STARTED = "retrieval_started"
    RETRIEVAL_COMPLETED = "retrieval_completed"
    RERANKING_COMPLETED = "reranking_completed"
    EVIDENCE_EVALUATED = "evidence_evaluated"
    GENERATION_STARTED = "generation_started"
    TOKEN = "token"
    CITATION = "citation"
    GROUNDEDNESS_COMPLETED = "groundedness_completed"
    COMPLETED = "completed"
    ERROR = "error"


class ChatStreamRequest(ChatQueryRequest):
    regenerate: bool = False


class ChatStreamEvent(APIModel):
    event: ChatStreamEventType
    sequence: int = Field(ge=1)
    request_id: str
    timestamp: datetime
    data: dict[str, Any] = Field(default_factory=dict)


class ConversationUpdateRequest(APIModel):
    title: str = Field(min_length=1, max_length=200)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("Title must not be blank")
        return normalized
