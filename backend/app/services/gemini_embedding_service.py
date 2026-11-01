import asyncio
import logging
import math
from collections.abc import Awaitable, Callable
from typing import Any, Literal

import numpy as np
from google import genai
from google.genai import types

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError, ConfigurationError
from app.schemas.common import EmbeddingState

logger = logging.getLogger(__name__)

TaskType = Literal["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]
ClientFactory = Callable[[], Any]


class EmbeddingGenerationError(AppError):
    status_code = 502
    code = "EMBEDDING_GENERATION_FAILED"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        retryable: bool = False,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, code=code, details=details or {})
        self.retryable = retryable


class EmbeddingConfigurationError(ConfigurationError):
    status_code = 503
    code = "EMBEDDING_NOT_CONFIGURED"


class GeminiEmbeddingService:
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        client: Any | None = None,
        client_factory: ClientFactory | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self._client = client
        self._client_factory = client_factory
        self._last_error: str | None = None

    @property
    def configured(self) -> bool:
        return self.settings.gemini_configured

    @property
    def state(self) -> EmbeddingState:
        if not self.configured:
            return EmbeddingState.NOT_CONFIGURED
        if self._last_error:
            return EmbeddingState.DEGRADED
        return EmbeddingState.READY

    async def embed_documents(
        self, texts: list[str], *, title: str | None = None
    ) -> list[list[float]]:
        return await self._embed(
            texts,
            task_type="RETRIEVAL_DOCUMENT",
            title=title,
        )

    async def embed_query(self, query: str) -> list[float]:
        vectors = await self._embed(
            [query],
            task_type="RETRIEVAL_QUERY",
            title=None,
        )
        return vectors[0]

    async def _embed(
        self,
        texts: list[str],
        *,
        task_type: TaskType,
        title: str | None,
    ) -> list[list[float]]:
        if not self.configured:
            raise EmbeddingConfigurationError(
                "DOCUMIND_GEMINI_API_KEY is not configured; embeddings are unavailable.",
                details={
                    "model": self.settings.gemini_embedding_model,
                    "dimension": self.settings.gemini_embedding_dimension,
                },
            )
        if not texts:
            raise EmbeddingGenerationError(
                "At least one text is required for embedding generation.",
                code="EMBEDDING_INPUT_EMPTY",
            )
        if any(not text.strip() for text in texts):
            raise EmbeddingGenerationError(
                "Embedding input must not contain blank text.",
                code="EMBEDDING_INPUT_INVALID",
            )

        vectors: list[list[float]] = []
        batch_size = self.settings.gemini_embedding_batch_size
        for start in range(0, len(texts), batch_size):
            batch = texts[start : start + batch_size]
            vectors.extend(
                await self._embed_batch(
                    batch,
                    task_type=task_type,
                    title=title,
                )
            )

        self._last_error = None
        return vectors

    async def _embed_batch(
        self,
        texts: list[str],
        *,
        task_type: TaskType,
        title: str | None,
    ) -> list[list[float]]:
        attempt = 0
        while True:
            try:
                response = await asyncio.wait_for(
                    self._request(texts, task_type=task_type, title=title),
                    timeout=self.settings.gemini_embedding_timeout_seconds,
                )
                return self._parse_response(response, expected_count=len(texts))
            except EmbeddingGenerationError:
                raise
            except Exception as exc:
                retryable = self._is_retryable(exc)
                if attempt >= self.settings.gemini_embedding_max_retries or not retryable:
                    self._last_error = self._safe_error_message(exc)
                    logger.warning(
                        "embedding.request_failed",
                        extra={
                            "model": self.settings.gemini_embedding_model,
                            "task_type": task_type,
                            "batch_size": len(texts),
                            "retryable": retryable,
                            "attempt": attempt + 1,
                        },
                    )
                    raise EmbeddingGenerationError(
                        "Gemini embedding generation failed.",
                        retryable=retryable,
                        details={
                            "reason": self._safe_error_message(exc),
                            "model": self.settings.gemini_embedding_model,
                            "task_type": task_type,
                        },
                    ) from exc

                delay = self.settings.gemini_embedding_retry_base_seconds * (
                    2**attempt
                )
                logger.info(
                    "embedding.request_retry",
                    extra={
                        "attempt": attempt + 1,
                        "delay_seconds": delay,
                        "task_type": task_type,
                    },
                )
                if delay:
                    await asyncio.sleep(delay)
                attempt += 1

    async def _request(
        self,
        texts: list[str],
        *,
        task_type: TaskType,
        title: str | None,
    ) -> Any:
        config = types.EmbedContentConfig(
            task_type=task_type,
            output_dimensionality=self.settings.gemini_embedding_dimension,
            title=title,
        )
        return await self._get_client().aio.models.embed_content(
            model=self.settings.gemini_embedding_model,
            contents=texts,
            config=config,
        )

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        if self._client_factory is not None:
            self._client = self._client_factory()
            return self._client

        api_key = (
            self.settings.documind_gemini_api_key.get_secret_value().strip()
            if self.settings.documind_gemini_api_key
            else ""
        )
        self._client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(
                timeout=int(self.settings.gemini_embedding_timeout_seconds * 1000)
            ),
        )
        return self._client

    def _parse_response(
        self, response: Any, *, expected_count: int
    ) -> list[list[float]]:
        embeddings = getattr(response, "embeddings", None)
        if embeddings is None or len(embeddings) != expected_count:
            raise EmbeddingGenerationError(
                "Gemini returned an unexpected number of embeddings.",
                code="EMBEDDING_RESPONSE_INVALID",
                details={
                    "expected": expected_count,
                    "received": len(embeddings) if embeddings is not None else 0,
                },
            )

        dimension = self.settings.gemini_embedding_dimension
        normalized: list[list[float]] = []
        for embedding in embeddings:
            values = getattr(embedding, "values", None)
            if values is None:
                raise EmbeddingGenerationError(
                    "Gemini returned an embedding without values.",
                    code="EMBEDDING_RESPONSE_INVALID",
                )
            if len(values) != dimension:
                raise EmbeddingGenerationError(
                    "Gemini returned an embedding with an unexpected dimension.",
                    code="EMBEDDING_DIMENSION_MISMATCH",
                    details={
                        "expected_dimension": dimension,
                        "received_dimension": len(values),
                    },
                )
            vector = np.asarray(values, dtype=np.float32)
            if not np.all(np.isfinite(vector)):
                raise EmbeddingGenerationError(
                    "Gemini returned a non-finite embedding vector.",
                    code="EMBEDDING_VECTOR_INVALID",
                )
            norm = float(np.linalg.norm(vector))
            if not math.isfinite(norm) or norm <= 1e-12:
                raise EmbeddingGenerationError(
                    "Gemini returned a zero-length embedding vector.",
                    code="EMBEDDING_VECTOR_INVALID",
                )
            normalized.append((vector / norm).astype(np.float32).tolist())

        return normalized

    def _is_retryable(self, exc: Exception) -> bool:
        if isinstance(exc, TimeoutError | ConnectionError | OSError):
            return True
        status = getattr(exc, "status", None)
        if status is None:
            status = getattr(exc, "code", None)
        try:
            status_code = int(status) if status is not None else None
        except (TypeError, ValueError):
            status_code = None
        return status_code in {408, 429, 500, 502, 503, 504}

    def _safe_error_message(self, exc: Exception) -> str:
        message = str(exc).strip()
        if not message:
            return exc.__class__.__name__
        return message[:500]


async def embed_with_retry(
    operation: Callable[[], Awaitable[list[list[float]]]],
    *,
    max_attempts: int,
    base_delay: float,
) -> list[list[float]]:
    attempt = 0
    while True:
        try:
            return await operation()
        except EmbeddingGenerationError as exc:
            if not exc.retryable or attempt >= max_attempts - 1:
                raise
            delay = base_delay * (2**attempt)
            if delay:
                await asyncio.sleep(delay)
            attempt += 1
