from typing import Any


class AppError(Exception):
    status_code = 500
    code = "INTERNAL_SERVER_ERROR"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        status_code: int | None = None,
        details: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code or self.code
        self.status_code = status_code or self.status_code
        self.details = details


class BadRequestError(AppError):
    status_code = 400
    code = "INVALID_REQUEST"


class FileValidationError(BadRequestError):
    code = "FILE_VALIDATION_FAILED"


class NotFoundError(AppError):
    status_code = 404
    code = "RESOURCE_NOT_FOUND"


class ConflictError(AppError):
    status_code = 409
    code = "RESOURCE_CONFLICT"


class DuplicateDocumentError(ConflictError):
    code = "DUPLICATE_DOCUMENT"


class UnprocessableDocumentError(AppError):
    status_code = 422
    code = "FILE_UNPROCESSABLE"


class PayloadTooLargeError(AppError):
    status_code = 413
    code = "FILE_TOO_LARGE"


class UnsupportedMediaTypeError(AppError):
    status_code = 415
    code = "UNSUPPORTED_FILE_TYPE"


class IntegrationNotImplementedError(AppError):
    status_code = 501
    code = "INTEGRATION_NOT_IMPLEMENTED"


class ServiceUnavailableError(AppError):
    status_code = 503
    code = "SERVICE_UNAVAILABLE"


class ConfigurationError(AppError):
    status_code = 500
    code = "CONFIGURATION_ERROR"
