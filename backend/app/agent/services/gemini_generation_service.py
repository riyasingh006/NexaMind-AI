import asyncio
import json
import logging
import re
import time
from collections.abc import AsyncIterator, Callable
from typing import Any, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError, ConfigurationError
from app.services.provider_health import (
    record_generation_failure,
    record_generation_success,
)

logger = logging.getLogger(__name__)

SchemaT = TypeVar("SchemaT", bound=BaseModel)
ClientFactory = Callable[[], Any]
_SECRET_PATTERN = re.compile(
    r"(?i)(api[_-]?key|authorization|bearer)\s*[=:]?\s*[^\s,;]+"
)


class GenerationError(AppError):
    status_code = 502
    code = "GEMINI_GENERATION_FAILED"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        status_code: int | None = None,
        retryable: bool | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            message,
            code=code,
            status_code=status_code,
            details=details or {},
        )
        self.retryable = (
            retryable
            if retryable is not None
            else bool(getattr(type(self), "retryable", False))
        )


class GenerationNotConfiguredError(ConfigurationError):
    status_code = 503
    code = "GEMINI_NOT_CONFIGURED"


class GenerationUnavailableError(GenerationError):
    status_code = 503
    code = "GEMINI_UNAVAILABLE"


class GenerationTimeoutError(GenerationError):
    status_code = 504
    code = "GEMINI_TIMEOUT"
    retryable = True


class GenerationRateLimitError(GenerationError):
    status_code = 429
    code = "GEMINI_RATE_LIMITED"
    retryable = True


class GenerationResponseError(GenerationError):
    status_code = 502
    code = "GEMINI_RESPONSE_INVALID"
    retryable = True


class GeminiGenerationService:
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
    def model(self) -> str:
        return self.settings.gemini_generation_model

    async def generate_json(
        self,
        *,
        prompt: str,
        system_instruction: str,
        schema: type[SchemaT],
        temperature: float | None = None,
    ) -> SchemaT:
        if not self.configured:
            raise GenerationNotConfiguredError(
                "DOCUMIND_GEMINI_API_KEY is not configured; answer generation is unavailable.",
                details={"model": self.model},
            )
        if not prompt.strip():
            raise GenerationResponseError("The generation prompt is empty.")
        if not system_instruction.strip():
            raise GenerationResponseError("The system instruction is empty.")

        attempts = self.settings.documind_agent_max_retries + 1
        for attempt in range(attempts):
            started = time.perf_counter()
            try:
                response = await asyncio.wait_for(
                    self._request(
                        prompt=prompt,
                        system_instruction=system_instruction,
                        schema=schema,
                        temperature=temperature,
                    ),
                    timeout=self.settings.gemini_generation_timeout_seconds,
                )
                parsed = self._parse_response(response, schema)
                self._last_error = None
                record_generation_success(self.model)
                logger.info(
                    "agent.gemini_generation_completed",
                    extra={
                        "component": "agent",
                        "generation_model": self.model,
                        "duration_ms": round(
                            (time.perf_counter() - started) * 1000, 2
                        ),
                        "attempt": attempt + 1,
                    },
                )
                return parsed
            except GenerationError as exc:
                self._last_error = exc.code
                if not exc.retryable or attempt >= attempts - 1:
                    record_generation_failure(self.model, exc.code)
                    raise
            except TimeoutError as exc:
                self._last_error = "timeout"
                if attempt >= attempts - 1:
                    record_generation_failure(self.model, "GEMINI_TIMEOUT")
                    raise GenerationTimeoutError(
                        "Gemini answer generation timed out.",
                        details={"model": self.model},
                    ) from exc
            except ValidationError as exc:
                self._last_error = "invalid_response"
                if attempt >= attempts - 1:
                    record_generation_failure(self.model, "GEMINI_RESPONSE_INVALID")
                    raise GenerationResponseError(
                        "Gemini returned a response that does not match the required schema.",
                        details={
                            "model": self.model,
                            "issues": len(exc.errors()),
                        },
                    ) from exc
            except Exception as exc:
                retryable = self._is_retryable(exc)
                self._last_error = self._safe_error_message(exc)
                if attempt >= attempts - 1 or not retryable:
                    mapped_error = self._map_exception(exc)
                    record_generation_failure(self.model, mapped_error.code)
                    raise mapped_error from exc

            delay = 0.5 * (2**attempt)
            logger.info(
                "agent.gemini_generation_retry",
                extra={
                    "component": "agent",
                    "generation_model": self.model,
                    "attempt": attempt + 1,
                    "delay_seconds": delay,
                },
            )
            if delay:
                await asyncio.sleep(delay)

        raise GenerationUnavailableError(
            "Gemini answer generation is unavailable.",
            details={"model": self.model},
        )

    async def stream_text(
        self,
        *,
        prompt: str,
        system_instruction: str,
        temperature: float | None = None,
    ) -> AsyncIterator[str]:
        if not self.configured:
            raise GenerationNotConfiguredError(
                "DOCUMIND_GEMINI_API_KEY is not configured; streaming answer generation is unavailable.",
                details={"model": self.model},
            )
        if not prompt.strip():
            raise GenerationResponseError("The generation prompt is empty.")
        if not system_instruction.strip():
            raise GenerationResponseError("The system instruction is empty.")

        started = time.perf_counter()
        emitted = False
        iterator: Any | None = None
        try:
            config = types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=(
                    self.settings.gemini_generation_temperature
                    if temperature is None
                    else temperature
                ),
            )
            iterator = await asyncio.wait_for(
                self._get_client().aio.models.generate_content_stream(
                    model=self.model,
                    contents=prompt,
                    config=config,
                ),
                timeout=self.settings.gemini_generation_timeout_seconds,
            )
            while True:
                try:
                    chunk = await asyncio.wait_for(
                        anext(iterator),
                        timeout=self.settings.gemini_generation_timeout_seconds,
                    )
                except StopAsyncIteration:
                    break
                try:
                    text = getattr(chunk, "text", None)
                except Exception:
                    text = None
                if isinstance(text, str) and text:
                    emitted = True
                    yield text
            if not emitted:
                raise GenerationResponseError(
                    "Gemini returned an empty streaming response.",
                    details={"model": self.model},
                )
            self._last_error = None
            record_generation_success(self.model)
            logger.info(
                "agent.gemini_stream_completed",
                extra={
                    "component": "agent",
                    "generation_model": self.model,
                    "duration_ms": round(
                        (time.perf_counter() - started) * 1000, 2
                    ),
                },
            )
        except TimeoutError as exc:
            self._last_error = "timeout"
            record_generation_failure(self.model, "GEMINI_TIMEOUT")
            raise GenerationTimeoutError(
                "Gemini streaming answer generation timed out.",
                details={"model": self.model},
            ) from exc
        except GenerationError as exc:
            self._last_error = exc.code
            record_generation_failure(self.model, exc.code)
            raise
        except Exception as exc:
            mapped_error = self._map_exception(exc)
            self._last_error = mapped_error.code
            record_generation_failure(self.model, mapped_error.code)
            raise mapped_error from exc
        finally:
            close = getattr(iterator, "aclose", None)
            if callable(close):
                try:
                    await close()
                except Exception:
                    logger.debug(
                        "agent.gemini_stream_close_failed",
                        exc_info=True,
                    )

    async def _request(
        self,
        *,
        prompt: str,
        system_instruction: str,
        schema: type[BaseModel],
        temperature: float | None,
    ) -> Any:
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=(
                self.settings.gemini_generation_temperature
                if temperature is None
                else temperature
            ),
            response_mime_type="application/json",
            response_schema=schema,
        )
        return await self._get_client().aio.models.generate_content(
            model=self.model,
            contents=prompt,
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
                timeout=int(self.settings.gemini_generation_timeout_seconds * 1000)
            ),
        )
        return self._client

    def _parse_response(
        self, response: Any, schema: type[SchemaT]
    ) -> SchemaT:
        parsed = getattr(response, "parsed", None)
        if isinstance(parsed, schema):
            return parsed
        if isinstance(parsed, dict):
            try:
                return schema.model_validate(parsed)
            except ValidationError as exc:
                raise GenerationResponseError(
                    "Gemini returned an invalid structured response.",
                    details={"issues": len(exc.errors())},
                ) from exc

        text = getattr(response, "text", None)
        if not isinstance(text, str) or not text.strip():
            raise GenerationResponseError(
                "Gemini returned an empty response."
            )
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        try:
            payload = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
            if match is None:
                raise GenerationResponseError(
                    "Gemini did not return valid JSON."
                ) from exc
            try:
                payload = json.loads(match.group(0))
            except json.JSONDecodeError as nested:
                raise GenerationResponseError(
                    "Gemini did not return valid JSON."
                ) from nested
        try:
            return schema.model_validate(payload)
        except ValidationError as exc:
            raise GenerationResponseError(
                "Gemini returned an invalid structured response.",
                details={"issues": len(exc.errors())},
            ) from exc

    def _is_retryable(self, exc: Exception) -> bool:
        if isinstance(exc, TimeoutError | ConnectionError | OSError):
            return True
        status = getattr(exc, "status", None)
        if status is None:
            status = getattr(exc, "status_code", None)
        if status is None:
            status = getattr(exc, "code", None)
        try:
            status_code = int(status) if status is not None else None
        except (TypeError, ValueError):
            status_code = None
        return status_code in {408, 429, 500, 502, 503, 504}

    def _map_exception(self, exc: Exception) -> GenerationError:
        if isinstance(exc, TimeoutError):
            return GenerationTimeoutError("Gemini answer generation timed out.")
        status = getattr(exc, "status", None)
        if status is None:
            status = getattr(exc, "status_code", None)
        if status is None:
            status = getattr(exc, "code", None)
        try:
            status_code = int(status) if status is not None else None
        except (TypeError, ValueError):
            status_code = None
        if status_code == 429:
            return GenerationRateLimitError(
                "Gemini rate limit exceeded. Please retry shortly.",
                details={"model": self.model},
            )
        return GenerationUnavailableError(
            "Gemini answer generation is temporarily unavailable.",
            retryable=self._is_retryable(exc),
            details={
                "model": self.model,
                "reason": self._safe_error_message(exc),
            },
        )

    def _safe_error_message(self, exc: Exception) -> str:
        message = str(exc).strip() or exc.__class__.__name__
        message = _SECRET_PATTERN.sub(r"\1 [redacted]", message)
        return message[:500]
