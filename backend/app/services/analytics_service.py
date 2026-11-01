from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.conversation_repository import ConversationRepository
from app.repositories.document_repository import DocumentRepository
from app.schemas.analytics import (
    AnalyticsRange,
    DashboardAnalyticsResponse,
    DocumentAnalyticsResponse,
    DocumentStatistics,
    RetrievalAnalytics,
    RetrievalAnalyticsResponse,
)
from app.schemas.common import IntegrationStatus
from app.utils.datetime import utc_now

RETRIEVAL_DETAIL = (
    "Grounded semantic retrieval is available through the LangGraph chat "
    "endpoint. Aggregate query counts are recorded; per-query latency "
    "distributions and similarity analytics are not yet exposed."
)


class AnalyticsService:
    def __init__(self, session: AsyncSession) -> None:
        self.document_repository = DocumentRepository(session)
        self.conversation_repository = ConversationRepository(session)

    async def dashboard(self, time_range: AnalyticsRange) -> DashboardAnalyticsResponse:
        generated_at = utc_now()
        since = self._range_start(time_range)
        statistics = await self._document_statistics(since)
        total_conversations = await self.conversation_repository.count_conversations(
            since
        )
        total_messages = await self.conversation_repository.count_messages(since)
        total_user_queries = await self.conversation_repository.count_user_queries(
            since
        )

        return DashboardAnalyticsResponse(
            range=time_range,
            generated_at=generated_at,
            documents=statistics,
            total_conversations=total_conversations,
            total_messages=total_messages,
            total_user_queries=total_user_queries,
            retrieval=self._retrieval_analytics(total_user_queries),
        )

    async def retrieval(
        self, time_range: AnalyticsRange
    ) -> RetrievalAnalyticsResponse:
        since = self._range_start(time_range)
        total_user_queries = await self.conversation_repository.count_user_queries(
            since
        )
        return RetrievalAnalyticsResponse(
            range=time_range,
            generated_at=utc_now(),
            retrieval=self._retrieval_analytics(total_user_queries),
        )

    async def documents(
        self, time_range: AnalyticsRange
    ) -> DocumentAnalyticsResponse:
        since = self._range_start(time_range)
        statistics = await self._document_statistics(since)
        return DocumentAnalyticsResponse(
            range=time_range,
            generated_at=utc_now(),
            statistics=statistics,
        )

    async def _document_statistics(self, since) -> DocumentStatistics:
        aggregate = await self.document_repository.statistics(since)
        average_file_size = (
            aggregate.total_storage_bytes / aggregate.total_documents
            if aggregate.total_documents
            else 0.0
        )
        return DocumentStatistics(
            total_documents=aggregate.total_documents,
            queued_documents=aggregate.queued_documents,
            processing_documents=aggregate.processing_documents,
            indexed_documents=aggregate.indexed_documents,
            failed_documents=aggregate.failed_documents,
            total_chunks=aggregate.total_chunks,
            total_storage_bytes=aggregate.total_storage_bytes,
            average_file_size_bytes=round(average_file_size, 2),
        )

    def _retrieval_analytics(self, queries_recorded: int) -> RetrievalAnalytics:
        return RetrievalAnalytics(
            status=IntegrationStatus.OPERATIONAL,
            queries_recorded=queries_recorded,
            detail=RETRIEVAL_DETAIL,
        )

    def _range_start(self, time_range: AnalyticsRange):
        days = {"7d": 7, "30d": 30, "90d": 90}[time_range]
        return utc_now() - timedelta(days=days)
