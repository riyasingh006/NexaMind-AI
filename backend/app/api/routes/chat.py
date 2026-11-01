from collections.abc import AsyncIterator
from dataclasses import dataclass
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    Query,
    Request,
    Response,
    status,
)
from fastapi.sse import EventSourceResponse, ServerSentEvent
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.database import get_session
from app.schemas.chat import (
    ChatQueryRequest,
    ChatQueryResponse,
    ConversationDeleteResponse,
    ConversationListResponse,
    ConversationResponse,
)
from app.schemas.chat_stream import (
    ChatStreamRequest,
    ConversationUpdateRequest,
)
from app.services.chat_service import ChatService, StreamSubmission

router = APIRouter()


@dataclass(frozen=True)
class StreamContext:
    service: ChatService
    submission: StreamSubmission


async def get_stream_context(
    payload: ChatStreamRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> StreamContext:
    response.headers["Connection"] = "keep-alive"
    response.headers["X-Accel-Buffering"] = "no"
    service = ChatService(session)
    submission = await service.prepare_stream(
        payload,
        request_id=getattr(request.state, "request_id", "-"),
    )
    return StreamContext(service=service, submission=submission)


@router.post(
    "/query",
    response_model=ChatQueryResponse,
    status_code=status.HTTP_200_OK,
)
async def query(
    payload: ChatQueryRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> ChatQueryResponse:
    service = ChatService(session)
    return await service.process_query(
        payload,
        request_id=getattr(request.state, "request_id", "-"),
    )


@router.post(
    "/stream",
    response_class=EventSourceResponse,
    status_code=status.HTTP_200_OK,
)
async def stream_chat(
    context: StreamContext = Depends(get_stream_context),
) -> AsyncIterator[ServerSentEvent]:
    async for event in context.service.stream_events(context.submission):
        yield ServerSentEvent(
            data=event,
            event=event.event.value,
            id=str(event.sequence),
        )


@router.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> ConversationListResponse:
    service = ChatService(session)
    conversations, total = await service.list_conversations(
        limit=limit, offset=offset
    )
    return ConversationListResponse(
        items=[
            service.conversation_response(conversation)
            for conversation in conversations
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
)
async def get_conversation(
    conversation_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> ConversationResponse:
    service = ChatService(session)
    conversation = await service.get_conversation(conversation_id)
    return service.conversation_response(conversation)


@router.patch(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
)
async def rename_conversation(
    conversation_id: UUID,
    payload: ConversationUpdateRequest,
    session: AsyncSession = Depends(get_session),
) -> ConversationResponse:
    service = ChatService(session)
    conversation = await service.rename_conversation(
        conversation_id,
        payload.title,
    )
    return service.conversation_response(conversation)


@router.delete(
    "/conversations/{conversation_id}/messages",
    response_model=ConversationResponse,
)
async def clear_conversation(
    conversation_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> ConversationResponse:
    service = ChatService(session)
    conversation = await service.clear_conversation(conversation_id)
    return service.conversation_response(conversation)


@router.delete(
    "/conversations/{conversation_id}",
    response_model=ConversationDeleteResponse,
)
async def delete_conversation(
    conversation_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> ConversationDeleteResponse:
    await ChatService(session).delete_conversation(conversation_id)
    return ConversationDeleteResponse(
        message="Conversation deleted",
        conversation_id=conversation_id,
    )
