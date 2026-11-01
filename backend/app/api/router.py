from fastapi import APIRouter

from app.api.routes import (
    analytics,
    chat,
    documents,
    embeddings,
    evaluation,
    health,
    retrieval,
    system,
    vectors,
)

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["Health"])
api_router.include_router(documents.router, prefix="/documents", tags=["Documents"])
api_router.include_router(embeddings.router, prefix="/embeddings", tags=["Embeddings"])
api_router.include_router(vectors.router, prefix="/vectors", tags=["Vectors"])
api_router.include_router(chat.router, prefix="/chat", tags=["Chat"])
api_router.include_router(
    retrieval.router, prefix="/retrieval", tags=["Retrieval"]
)
api_router.include_router(
    evaluation.router, prefix="/evaluation", tags=["Evaluation"]
)
api_router.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
api_router.include_router(system.router, prefix="/system", tags=["System"])

