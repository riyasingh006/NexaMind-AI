from datetime import datetime
from typing import Literal

from app.schemas.common import APIModel, IntegrationStatus

AnalyticsRange = Literal["7d", "30d", "90d"]


class DocumentStatistics(APIModel):
    total_documents: int
    queued_documents: int
    processing_documents: int
    indexed_documents: int
    failed_documents: int
    total_chunks: int
    total_storage_bytes: int
    average_file_size_bytes: float


class RetrievalAnalytics(APIModel):
    status: IntegrationStatus
    queries_recorded: int
    average_retrieval_latency_ms: float | None = None
    average_response_latency_ms: float | None = None
    success_rate: float | None = None
    chunks_retrieved: int = 0
    detail: str


class DashboardAnalyticsResponse(APIModel):
    success: Literal[True] = True
    range: AnalyticsRange
    generated_at: datetime
    documents: DocumentStatistics
    total_conversations: int
    total_messages: int
    total_user_queries: int
    retrieval: RetrievalAnalytics


class RetrievalAnalyticsResponse(APIModel):
    success: Literal[True] = True
    range: AnalyticsRange
    generated_at: datetime
    retrieval: RetrievalAnalytics


class DocumentAnalyticsResponse(APIModel):
    success: Literal[True] = True
    range: AnalyticsRange
    generated_at: datetime
    statistics: DocumentStatistics
