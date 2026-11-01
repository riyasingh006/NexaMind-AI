from typing import Any


class DocumentProcessingError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        stage: str,
        details: dict[str, Any] | None = None,
        retryable: bool = False,
        requires_ocr: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.stage = stage
        self.details = details or {}
        self.retryable = retryable
        self.requires_ocr = requires_ocr


class DocumentParseError(DocumentProcessingError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        details: dict[str, Any] | None = None,
        retryable: bool = False,
        requires_ocr: bool = False,
    ) -> None:
        super().__init__(
            code,
            message,
            stage="extracting",
            details=details,
            retryable=retryable,
            requires_ocr=requires_ocr,
        )
