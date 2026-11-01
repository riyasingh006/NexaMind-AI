import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.router import api_router
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.logging import request_id_context
from app.core.middleware import RequestContextMiddleware
from app.database.session import dispose_db, init_db
from app.schemas.common import ErrorDetail, ErrorResponse

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.ensure_directories()
    from app.core.logging import configure_logging

    configure_logging(settings.log_level, settings.log_dir)
    await init_db()
    logger.info(
        "application.startup",
        extra={"component": settings.app_name},
    )
    try:
        yield
    finally:
        await dispose_db()
        logger.info("application.shutdown", extra={"component": settings.app_name})


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", request_id_context.get())


def _error_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    details: Any | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    payload = ErrorResponse(
        error=ErrorDetail(code=code, message=message, details=details),
        request_id=_request_id(request),
    )
    return JSONResponse(
        status_code=status_code,
        content=payload.model_dump(mode="json"),
        headers=headers,
    )


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return _error_response(
        request,
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        details=exc.details,
    )


async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    details = [
        {
            "field": ".".join(str(part) for part in error["loc"]),
            "message": error["msg"],
            "type": error["type"],
        }
        for error in exc.errors()
    ]
    return _error_response(
        request,
        status_code=422,
        code="VALIDATION_ERROR",
        message="Request validation failed",
        details=details,
    )


async def http_error_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    status_code = exc.status_code
    code_by_status = {
        400: "INVALID_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "RESOURCE_NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        409: "RESOURCE_CONFLICT",
        413: "FILE_TOO_LARGE",
        415: "UNSUPPORTED_FILE_TYPE",
        422: "VALIDATION_ERROR",
        503: "SERVICE_UNAVAILABLE",
    }
    return _error_response(
        request,
        status_code=status_code,
        code=code_by_status.get(status_code, "HTTP_ERROR"),
        message=str(exc.detail),
        headers=exc.headers,
    )


async def database_error_handler(
    request: Request, exc: SQLAlchemyError
) -> JSONResponse:
    logger.exception("database.operation_failed")
    return _error_response(
        request,
        status_code=500,
        code="DATABASE_ERROR",
        message="A database operation could not be completed",
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("application.unhandled_error")
    return _error_response(
        request,
        status_code=500,
        code="INTERNAL_SERVER_ERROR",
        message="An unexpected error occurred",
    )


def create_app() -> FastAPI:
    application = FastAPI(
        title="DocuMind AI API",
        description=(
            "Advanced AI-powered document intelligence and Retrieval-Augmented "
            "Generation platform."
        ),
        version=settings.app_version,
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
    application.add_middleware(RequestContextMiddleware)

    application.add_exception_handler(AppError, app_error_handler)
    application.add_exception_handler(
        RequestValidationError, validation_error_handler
    )
    application.add_exception_handler(StarletteHTTPException, http_error_handler)
    application.add_exception_handler(SQLAlchemyError, database_error_handler)
    application.add_exception_handler(Exception, unhandled_error_handler)

    application.include_router(api_router, prefix=settings.api_v1_prefix)

    @application.get("/", include_in_schema=False)
    async def root() -> dict[str, str]:
        return {
            "service": settings.app_name,
            "version": settings.app_version,
            "api": settings.api_v1_prefix,
            "docs": "/docs",
        }

    return application


app = create_app()
