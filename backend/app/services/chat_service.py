import asyncio
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.agent_service import AgentService
from app.agent.graph import AgentEventSink
from app.agent.services.gemini_generation_service import (
    GenerationNotConfiguredError,
)
from app.agent.state import AgentRunInput, AgentRunResult, EvidenceStatus
from app.core.config import Settings, get_settings
from app.core.exceptions import (
    AppError,
    BadRequestError,
    ConflictError,
    NotFoundError,
)
from app.models.conversation import Conversation
from app.models.message import Message
from app.repositories.conversation_repository import ConversationRepository
from app.repositories.document_repository import DocumentRepository
from app.schemas.chat import (
    AgentWorkflowMetadata,
    ChatMessageMetadata,
    ChatMessageResponse,
    ChatQueryRequest,
    ChatQueryResponse,
    ChatSource,
    ConversationResponse,
    RetrievalMetadata,
    RetrievedChunk,
)
from app.schemas.chat_stream import (
    ChatStreamEvent,
    ChatStreamEventType,
    ChatStreamRequest,
)
from app.schemas.common import IntegrationStatus
from app.utils.datetime import utc_now
from app.utils.text import summarize_prompt

logger = logging.getLogger(__name__)

CHAT_INTEGRATION_DETAIL = (
    "Use POST /api/v1/chat/query for a non-streaming grounded LangGraph "
    "response or POST /api/v1/chat/stream for live SSE events."
)


@dataclass(frozen=True)
class QuerySubmission:
    conversation: Conversation
    user_message: Message


@dataclass(frozen=True)
class StreamSubmission:
    request_id: str
    conversation: Conversation
    user_message: Message
    user_message_reused: bool
    replace_assistant_message_id: UUID | None
    agent_input: AgentRunInput


class ChatService:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings | None = None,
        *,
        agent_service: AgentService | None = None,
    ) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self.conversation_repository = ConversationRepository(session)
        self.document_repository = DocumentRepository(session)
        self.agent_service = agent_service or AgentService(
            session,
            self.settings,
        )

    async def process_query(
        self,
        payload: ChatQueryRequest,
        *,
        request_id: str = "-",
    ) -> ChatQueryResponse:
        if not self.settings.gemini_configured:
            raise GenerationNotConfiguredError(
                "DOCUMIND_GEMINI_API_KEY is not configured; chat generation is unavailable.",
                details={
                    "model": self.settings.gemini_generation_model,
                    "configured": False,
                },
            )
        await self._validate_documents(payload.document_ids)

        conversation = await self._resolve_conversation(payload)
        history = await self._conversation_history(conversation)

        user_message = Message(
            conversation_id=conversation.id,
            role="user",
            content=payload.prompt,
            message_metadata=ChatMessageMetadata(
                integration_status=IntegrationStatus.OPERATIONAL,
                document_ids=payload.document_ids,
            ).model_dump(mode="json"),
        )
        await self.conversation_repository.add_message(user_message)
        conversation.updated_at = utc_now()
        try:
            await self.conversation_repository.commit()
        except Exception:
            await self.conversation_repository.rollback()
            raise

        result = await self.agent_service.run(
            AgentRunInput(
                request_id=request_id,
                user_query=payload.prompt,
                document_ids=payload.document_ids,
                conversation_id=conversation.id,
                conversation_history=history,
                top_k=payload.top_k,
                similarity_threshold=payload.similarity_threshold,
                temperature=payload.temperature,
            )
        )

        sources = self._sources(result)
        assistant_message = Message(
            conversation_id=conversation.id,
            role="assistant",
            content=result.answer,
            message_metadata=ChatMessageMetadata(
                integration_status=IntegrationStatus.OPERATIONAL,
                model=result.generation_model,
                sources_count=len(sources),
                latency_ms=result.processing_time_ms,
                evidence_status=result.evidence_status.value,
                validation_status=result.validation_status.value,
                query_rewritten=result.query_rewritten,
                groundedness_status=(
                    str(result.groundedness.get("status"))
                    if result.groundedness
                    else None
                ),
                groundedness_score=(
                    result.groundedness.get("score")
                    if result.groundedness
                    else None
                ),
                evidence_coverage_status=(
                    str(result.evidence_coverage.get("status"))
                    if result.evidence_coverage
                    else None
                ),
                evidence_coverage_score=(
                    result.evidence_coverage.get("score")
                    if result.evidence_coverage
                    else None
                ),
                citations=sources,
            ).model_dump(mode="json"),
        )
        await self.conversation_repository.add_message(assistant_message)
        conversation.updated_at = utc_now()
        try:
            await self.conversation_repository.commit()
        except Exception:
            await self.conversation_repository.rollback()
            raise

        logger.info(
            "chat.query_completed",
            extra={
                "conversation_id": str(conversation.id),
                "message_id": str(assistant_message.id),
                "evidence_status": result.evidence_status.value,
                "validation_status": result.validation_status.value,
                "source_count": len(sources),
                "latency_ms": result.processing_time_ms,
            },
        )
        return self._query_response(
            conversation=conversation,
            user_message=user_message,
            assistant_message=assistant_message,
            result=result,
            sources=sources,
        )

    async def submit_query(self, payload: ChatQueryRequest) -> QuerySubmission:
        await self._validate_documents(payload.document_ids)
        conversation = await self._resolve_conversation(payload)
        message = Message(
            conversation_id=conversation.id,
            role="user",
            content=payload.prompt,
            message_metadata=ChatMessageMetadata(
                integration_status=IntegrationStatus.OPERATIONAL,
                document_ids=payload.document_ids,
            ).model_dump(mode="json"),
        )
        await self.conversation_repository.add_message(message)
        conversation.updated_at = utc_now()
        try:
            await self.conversation_repository.commit()
        except Exception:
            await self.conversation_repository.rollback()
            raise

        logger.info(
            "chat.query_recorded",
            extra={
                "conversation_id": str(conversation.id),
                "message_id": str(message.id),
            },
        )
        return QuerySubmission(conversation=conversation, user_message=message)

    async def prepare_stream(
        self,
        payload: ChatStreamRequest,
        *,
        request_id: str,
    ) -> StreamSubmission:
        if not self.settings.gemini_configured:
            raise GenerationNotConfiguredError(
                "DOCUMIND_GEMINI_API_KEY is not configured; chat generation is unavailable.",
                details={
                    "model": self.settings.gemini_generation_model,
                    "configured": False,
                },
            )
        await self._validate_documents(payload.document_ids)

        if payload.regenerate and payload.conversation_id is None:
            raise BadRequestError(
                "Regenerating an answer requires an existing conversation.",
                code="CONVERSATION_REQUIRED",
            )

        conversation = await self._resolve_conversation(payload)
        messages = list(conversation.messages)
        last_message = messages[-1] if messages else None
        last_user = next(
            (
                message
                for message in reversed(messages)
                if message.role == "user"
            ),
            None,
        )
        prompt = payload.prompt
        replace_assistant_message_id: UUID | None = None
        excluded_message_ids: set[UUID] = set()

        if payload.regenerate:
            if last_user is None:
                raise BadRequestError(
                    "There is no previous user message to regenerate.",
                    code="NO_USER_MESSAGE",
                )
            prompt = last_user.content
            excluded_message_ids.add(last_user.id)
            if last_message is not None and last_message.role == "assistant":
                replace_assistant_message_id = last_message.id
                excluded_message_ids.add(last_message.id)

        reuse_user_message = (
            not payload.regenerate
            and last_message is not None
            and last_message.role == "user"
            and last_message.content.strip() == prompt
        )

        if (reuse_user_message or payload.regenerate) and last_user is not None:
            user_message = last_user
            excluded_message_ids.add(user_message.id)
            metadata = ChatMessageMetadata.model_validate(
                user_message.message_metadata or {}
            )
            metadata.integration_status = IntegrationStatus.OPERATIONAL
            metadata.document_ids = payload.document_ids
            user_message.message_metadata = metadata.model_dump(mode="json")
        else:
            user_message = Message(
                conversation_id=conversation.id,
                role="user",
                content=prompt,
                message_metadata=ChatMessageMetadata(
                    integration_status=IntegrationStatus.OPERATIONAL,
                    document_ids=payload.document_ids,
                ).model_dump(mode="json"),
            )
            await self.conversation_repository.add_message(user_message)

        conversation.updated_at = utc_now()
        try:
            await self.conversation_repository.commit()
        except Exception:
            await self.conversation_repository.rollback()
            raise

        history = self._history_from_messages(
            messages,
            excluded_message_ids=excluded_message_ids,
        )
        logger.info(
            "chat.stream_prepared",
            extra={
                "conversation_id": str(conversation.id),
                "message_id": str(user_message.id),
                "reused_user_message": reuse_user_message,
                "regenerate": payload.regenerate,
            },
        )
        return StreamSubmission(
            request_id=request_id,
            conversation=conversation,
            user_message=user_message,
            user_message_reused=reuse_user_message,
            replace_assistant_message_id=replace_assistant_message_id,
            agent_input=AgentRunInput(
                request_id=request_id,
                user_query=prompt,
                document_ids=payload.document_ids,
                conversation_id=conversation.id,
                conversation_history=history,
                top_k=payload.top_k,
                similarity_threshold=payload.similarity_threshold,
                temperature=payload.temperature,
            ),
        )

    async def stream_events(
        self,
        submission: StreamSubmission,
    ) -> AsyncIterator[ChatStreamEvent]:
        sequence = 0

        def make_event(
            event: str,
            data: dict[str, Any],
        ) -> ChatStreamEvent:
            nonlocal sequence
            sequence += 1
            return ChatStreamEvent(
                event=ChatStreamEventType(event),
                sequence=sequence,
                request_id=submission.request_id,
                timestamp=utc_now(),
                data=data,
            )

        yield make_event(
            "workflow_started",
            {
                "conversation_id": str(submission.conversation.id),
                "conversation_title": submission.conversation.title,
                "user_message_id": str(submission.user_message.id),
                "reused_user_message": submission.user_message_reused,
                "model": self.settings.gemini_generation_model,
                "document_ids": [
                    str(value)
                    for value in submission.agent_input.document_ids
                ],
                "top_k": submission.agent_input.top_k,
            },
        )

        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        result_marker = "__result__"
        error_marker = "__error__"

        def emit(event: str, payload: dict[str, Any]) -> None:
            queue.put_nowait((event, payload))

        async def runner() -> None:
            try:
                result = await self.agent_service.run_stream(
                    submission.agent_input,
                    emit,
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                queue.put_nowait((error_marker, exc))
                return
            queue.put_nowait((result_marker, result))

        task = asyncio.create_task(runner())
        partial_generated = False
        try:
            while True:
                event, payload = await queue.get()
                if event == result_marker:
                    result = payload
                    break
                if event == error_marker:
                    yield make_event(
                        "error",
                        self._stream_error_data(
                            payload,
                            submission=submission,
                            partial_generated=partial_generated,
                        ),
                    )
                    return
                if event == "token" and str(payload.get("token", "")):
                    partial_generated = True
                yield make_event(event, payload)

            sources = self._sources(result)
            assistant_message, response = await self._persist_stream_result(
                submission=submission,
                result=result,
                sources=sources,
            )
            logger.info(
                "chat.stream_completed",
                extra={
                    "conversation_id": str(submission.conversation.id),
                    "message_id": str(assistant_message.id),
                    "evidence_status": result.evidence_status.value,
                    "validation_status": result.validation_status.value,
                    "source_count": len(sources),
                    "latency_ms": result.processing_time_ms,
                },
            )
            yield make_event(
                "completed",
                response.model_dump(mode="json"),
            )
        finally:
            if not task.done():
                task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception(
                    "chat.stream_runner_cleanup_failed",
                    extra={
                        "conversation_id": str(
                            submission.conversation.id
                        )
                    },
                )

    async def _persist_stream_result(
        self,
        *,
        submission: StreamSubmission,
        result: AgentRunResult,
        sources: list[ChatSource],
    ) -> tuple[Message, ChatQueryResponse]:
        if submission.replace_assistant_message_id is not None:
            previous = await self.conversation_repository.get_message(
                submission.replace_assistant_message_id
            )
            if (
                previous is not None
                and previous.conversation_id == submission.conversation.id
            ):
                await self.conversation_repository.delete_message(previous)

        assistant_message = Message(
            conversation_id=submission.conversation.id,
            role="assistant",
            content=result.answer,
            message_metadata=ChatMessageMetadata(
                integration_status=IntegrationStatus.OPERATIONAL,
                model=result.generation_model,
                sources_count=len(sources),
                latency_ms=result.processing_time_ms,
                evidence_status=result.evidence_status.value,
                validation_status=result.validation_status.value,
                query_rewritten=result.query_rewritten,
                groundedness_status=(
                    str(result.groundedness.get("status"))
                    if result.groundedness
                    else None
                ),
                groundedness_score=(
                    result.groundedness.get("score")
                    if result.groundedness
                    else None
                ),
                evidence_coverage_status=(
                    str(result.evidence_coverage.get("status"))
                    if result.evidence_coverage
                    else None
                ),
                evidence_coverage_score=(
                    result.evidence_coverage.get("score")
                    if result.evidence_coverage
                    else None
                ),
                document_ids=[
                    str(value)
                    for value in submission.agent_input.document_ids
                ],
                citations=sources,
            ).model_dump(mode="json"),
        )
        await self.conversation_repository.add_message(assistant_message)
        submission.conversation.updated_at = utc_now()
        try:
            await self.conversation_repository.commit()
        except Exception:
            await self.conversation_repository.rollback()
            raise

        response = self._query_response(
            conversation=submission.conversation,
            user_message=submission.user_message,
            assistant_message=assistant_message,
            result=result,
            sources=sources,
            regenerated_message_id=submission.replace_assistant_message_id,
        )
        return assistant_message, response

    def _stream_error_data(
        self,
        error: Exception,
        *,
        submission: StreamSubmission,
        partial_generated: bool,
    ) -> dict[str, Any]:
        if isinstance(error, AppError):
            message = error.message
            code = error.code
            details = error.details
            retryable = bool(getattr(error, "retryable", False))
        else:
            message = (
                "The streamed agent response failed before a validated "
                "answer could be completed."
            )
            code = "CHAT_STREAM_FAILED"
            details = None
            retryable = False
        logger.warning(
            "chat.stream_failed",
            extra={
                "conversation_id": str(submission.conversation.id),
                "error_code": code,
                "partial_generated": partial_generated,
            },
        )
        return {
            "code": code,
            "message": message,
            "details": details,
            "retryable": retryable,
            "conversation_id": str(submission.conversation.id),
            "user_message_id": str(submission.user_message.id),
            "partial": partial_generated,
        }

    @staticmethod
    def _history_from_messages(
        messages: list[Message],
        *,
        excluded_message_ids: set[UUID],
    ) -> list[dict[str, str]]:
        history: list[dict[str, str]] = []
        for message in messages[-12:]:
            if message.id in excluded_message_ids:
                continue
            if message.role not in {"user", "assistant"}:
                continue
            history.append(
                {
                    "role": message.role,
                    "content": message.content[:1200],
                }
            )
        return history

    async def list_conversations(
        self, *, limit: int, offset: int
    ) -> tuple[list[Conversation], int]:
        conversations = await self.conversation_repository.list(
            limit=limit, offset=offset
        )
        total = await self.conversation_repository.count()
        return conversations, total

    async def get_conversation(self, conversation_id: UUID) -> Conversation:
        conversation = await self.conversation_repository.get_detail(
            conversation_id
        )
        if conversation is None:
            raise NotFoundError("Conversation not found")
        return conversation

    async def clear_conversation(self, conversation_id: UUID) -> Conversation:
        conversation = await self.get_conversation(conversation_id)
        try:
            await self.conversation_repository.delete_messages(conversation_id)
            conversation.updated_at = utc_now()
            await self.conversation_repository.commit()
        except Exception:
            await self.conversation_repository.rollback()
            raise
        conversation.messages = []
        logger.info(
            "chat.conversation_cleared",
            extra={"conversation_id": str(conversation_id)},
        )
        return conversation

    async def delete_conversation(self, conversation_id: UUID) -> Conversation:
        conversation = await self.get_conversation(conversation_id)
        try:
            await self.conversation_repository.delete(conversation)
            await self.conversation_repository.commit()
        except Exception:
            await self.conversation_repository.rollback()
            raise

        logger.info(
            "chat.conversation_deleted",
            extra={"conversation_id": str(conversation_id)},
        )
        return conversation

    def conversation_response(
        self, conversation: Conversation
    ) -> ConversationResponse:
        messages = [
            ChatMessageResponse.model_validate(message)
            for message in conversation.messages
        ]
        return ConversationResponse(
            id=conversation.id,
            title=conversation.title,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            message_count=len(messages),
            document_ids=self._conversation_document_ids(conversation),
            messages=messages,
        )

    async def rename_conversation(
        self, conversation_id: UUID, title: str
    ) -> Conversation:
        conversation = await self.get_conversation(conversation_id)
        conversation.title = title
        conversation.updated_at = utc_now()
        try:
            await self.conversation_repository.commit()
        except Exception:
            await self.conversation_repository.rollback()
            raise
        logger.info(
            "chat.conversation_renamed",
            extra={"conversation_id": str(conversation_id)},
        )
        return conversation

    @staticmethod
    def _conversation_document_ids(
        conversation: Conversation,
    ) -> list[UUID]:
        for message in reversed(conversation.messages):
            if message.role != "user":
                continue
            metadata = message.message_metadata or {}
            if "document_ids" not in metadata:
                continue
            document_ids: list[UUID] = []
            for value in metadata.get("document_ids") or []:
                try:
                    document_ids.append(UUID(str(value)))
                except (TypeError, ValueError):
                    continue
            return list(dict.fromkeys(document_ids))

        document_ids: list[UUID] = []
        for message in reversed(conversation.messages):
            if message.role != "assistant":
                continue
            for citation in (message.message_metadata or {}).get(
                "citations", []
            ):
                try:
                    document_ids.append(
                        UUID(str(citation.get("document_id")))
                    )
                except (TypeError, ValueError, AttributeError):
                    continue
        return list(dict.fromkeys(document_ids))

    async def _resolve_conversation(
        self, payload: ChatQueryRequest
    ) -> Conversation:
        if payload.conversation_id:
            conversation = await self.conversation_repository.get_detail(
                payload.conversation_id
            )
            if conversation is None:
                raise NotFoundError("Conversation not found")
            return conversation

        conversation = Conversation(
            title=summarize_prompt(payload.prompt),
            messages=[],
        )
        await self.conversation_repository.add(conversation)
        return conversation

    async def _conversation_history(
        self, conversation: Conversation
    ) -> list[dict[str, str]]:
        messages = await self.conversation_repository.recent_messages(
            conversation.id
        )
        history: list[dict[str, str]] = []
        for message in messages:
            if message.role not in {"user", "assistant"}:
                continue
            history.append(
                {
                    "role": message.role,
                    "content": message.content[:1200],
                }
            )
        return history

    async def _validate_documents(self, document_ids: list[UUID]) -> None:
        if not document_ids:
            return
        existing_ids = await self.document_repository.exists_many(document_ids)
        missing_ids = [
            str(document_id)
            for document_id in document_ids
            if document_id not in existing_ids
        ]
        if missing_ids:
            raise NotFoundError(
                "One or more selected documents were not found",
                code="DOCUMENT_NOT_FOUND",
                details={"missing_document_ids": missing_ids},
            )

        unavailable: list[dict[str, str]] = []
        for document_id in document_ids:
            document = await self.document_repository.get(document_id)
            if document is not None and document.status != "indexed":
                unavailable.append(
                    {
                        "document_id": str(document.id),
                        "filename": document.original_filename,
                        "status": document.status,
                    }
                )
        if unavailable:
            raise ConflictError(
                "All selected documents must be indexed before chatting.",
                code="DOCUMENTS_NOT_READY",
                details={"documents": unavailable},
            )

    def _sources(self, result: AgentRunResult) -> list[ChatSource]:
        sources: list[ChatSource] = []
        for citation in result.citations:
            try:
                document_id = UUID(str(citation.get("document_id")))
            except (TypeError, ValueError):
                continue
            sources.append(
                ChatSource(
                    id=str(citation.get("citation_id", "")),
                    document_id=document_id,
                    document_name=str(
                        citation.get("filename") or "Unknown document"
                    ),
                    page=citation.get("page_number"),
                    chunk_id=str(citation.get("chunk_id", "")),
                    chunk_index=int(citation.get("chunk_index", 0)),
                    section_title=citation.get("section_title"),
                    similarity=float(citation.get("similarity_score", 0.0)),
                    excerpt=str(citation.get("relevant_excerpt", "")),
                )
            )
        return sources

    def _query_response(
        self,
        *,
        conversation: Conversation,
        user_message: Message,
        assistant_message: Message,
        result: AgentRunResult,
        sources: list[ChatSource],
        regenerated_message_id: UUID | None = None,
    ) -> ChatQueryResponse:
        metadata = result.processing_metadata
        retrieval_chunks = [
            RetrievedChunk(
                id=str(chunk.get("chunk_id", "")),
                document_id=UUID(str(chunk.get("document_id"))),
                document_name=str(chunk.get("filename") or "Unknown document"),
                page=chunk.get("page_number"),
                chunk_index=int(chunk.get("chunk_index", 0)),
                section_title=chunk.get("section_title"),
                similarity=float(chunk.get("similarity_score", 0.0)),
                rerank_position=position + 1,
                content=str(chunk.get("content", "")),
            )
            for position, chunk in enumerate(result.filtered_chunks)
        ]
        retrieval_duration = float(metadata.get("retrieval_duration_ms", 0.0))
        return ChatQueryResponse(
            status=IntegrationStatus.OPERATIONAL,
            conversation_id=conversation.id,
            user_message=ChatMessageResponse.model_validate(user_message),
            assistant_message=ChatMessageResponse.model_validate(
                assistant_message
            ),
            answer=result.answer,
            sources=sources,
            retrieval=RetrievalMetadata(
                rewritten_query=result.rewritten_query,
                retrieval_queries=result.retrieval_queries,
                duration_ms=retrieval_duration,
                chunks=retrieval_chunks,
                strategy=str(
                    metadata.get(
                        "retrieval_strategy",
                        "langgraph_multi_query_faiss",
                    )
                ),
            ),
            agent=AgentWorkflowMetadata(
                query_intent=result.query_intent.value,
                evidence_status=result.evidence_status.value,
                validation_status=result.validation_status.value,
                query_rewritten=result.query_rewritten,
                rewritten_query=result.rewritten_query,
                retrieval_queries=result.retrieval_queries,
                retrieved_chunk_count=len(result.retrieved_chunks),
                filtered_chunk_count=len(result.filtered_chunks),
                citation_count=len(sources),
                context_token_count=result.context_token_count,
                retry_count=result.retry_count,
                generation_model=result.generation_model,
                groundedness_status=(
                    str(result.groundedness.get("status"))
                    if result.groundedness
                    else None
                ),
                groundedness_score=(
                    result.groundedness.get("score")
                    if result.groundedness
                    else None
                ),
                groundedness_claim_count=(
                    int(result.groundedness.get("total_claims", 0))
                    if result.groundedness
                    else 0
                ),
                groundedness_unsupported_claims=(
                    int(result.groundedness.get("unsupported_claims", 0))
                    if result.groundedness
                    else 0
                ),
                evidence_coverage_status=(
                    str(result.evidence_coverage.get("status"))
                    if result.evidence_coverage
                    else None
                ),
                evidence_coverage_score=(
                    float(result.evidence_coverage.get("score", 0.0))
                    if result.evidence_coverage
                    else None
                ),
                latency_ms=result.processing_time_ms,
            ),
            detail=self._response_detail(result),
            regenerated_message_id=regenerated_message_id,
        )

    @staticmethod
    def _response_detail(result: AgentRunResult) -> str:
        if result.validation_status.value == "VALID":
            return "Grounded answer generated from indexed document evidence."
        if result.evidence_status == EvidenceStatus.RETRIEVAL_UNAVAILABLE:
            return (
                "The agent could not retrieve document evidence, so no answer "
                "was generated from document content."
            )
        if result.evidence_status == EvidenceStatus.NO_RESULTS:
            return (
                "No sufficiently relevant evidence was found, so the agent did "
                "not guess."
            )
        if result.evidence_status == EvidenceStatus.INSUFFICIENT:
            return (
                "The retrieved evidence was insufficient for a reliable "
                "document-grounded answer."
            )
        if result.groundedness and result.groundedness.get("status") in {
            "NOT_GROUNDED",
            "FAILED",
        }:
            return (
                "The generated answer did not pass claim-level groundedness "
                "verification, so it was withheld."
            )
        return (
            "The agent abstained because the generated response did not pass "
            "evidence and citation validation."
        )

