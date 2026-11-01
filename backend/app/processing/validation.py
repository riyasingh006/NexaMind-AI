import hashlib
import mimetypes
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path, PurePath

from app.core.exceptions import (
    FileValidationError,
    PayloadTooLargeError,
    UnsupportedMediaTypeError,
)
from app.processing.models import ProcessingWarning

EXTENSION_MAP = {
    ".pdf": "PDF",
    ".txt": "TXT",
    ".md": "MD",
    ".markdown": "MD",
}

CANONICAL_EXTENSIONS = {"PDF": ".pdf", "TXT": ".txt", "MD": ".md"}

MIME_TYPES = {
    "PDF": {
        "application/pdf",
        "application/x-pdf",
        "application/acrobat",
        "applications/vnd.pdf",
        "text/pdf",
        "application/octet-stream",
        "",
    },
    "TXT": {
        "text/plain",
        "text/x-log",
        "application/octet-stream",
        "",
    },
    "MD": {
        "text/markdown",
        "text/x-markdown",
        "application/markdown",
        "text/plain",
        "application/octet-stream",
        "",
    },
}

BINARY_SIGNATURES = (
    b"\x89PNG\r\n\x1a\n",
    b"\xff\xd8\xff",
    b"GIF87a",
    b"GIF89a",
    b"PK\x03\x04",
    b"%!PS",
    b"\x1f\x8b",
    b"BZh",
    b"\x7fELF",
    b"MZ",
    b"RIFF",
    b"\x00\x00\x00",
)

WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{number}" for number in range(1, 10)),
    *(f"LPT{number}" for number in range(1, 10)),
}


@dataclass(frozen=True)
class ValidatedUpload:
    original_filename: str
    safe_filename: str
    file_type: str
    extension: str
    mime_type: str
    size: int
    checksum_sha256: str
    warnings: tuple[ProcessingWarning, ...] = field(default_factory=tuple)


def sanitize_filename(filename: str) -> str:
    normalized = unicodedata.normalize("NFC", filename).replace("\\", "/")
    name = PurePath(normalized).name.strip()
    cleaned = "".join(character for character in name if character >= " " and character != "\x7f")
    cleaned = cleaned.replace("/", "_").replace("\\", "_").strip(" .")
    if not cleaned:
        raise FileValidationError(
            "The filename is invalid.",
            code="INVALID_FILENAME",
        )
    if len(cleaned) > 255:
        suffix = PurePath(cleaned).suffix
        stem_limit = max(1, 255 - len(suffix))
        cleaned = f"{PurePath(cleaned).stem[:stem_limit]}{suffix}"
    if PurePath(cleaned).stem.upper() in WINDOWS_RESERVED_NAMES:
        cleaned = f"_{cleaned}"
    return cleaned


def validate_uploaded_file(
    path: Path,
    original_filename: str,
    declared_mime_type: str | None,
    max_size: int,
) -> ValidatedUpload:
    safe_filename = sanitize_filename(original_filename)
    extension = PurePath(safe_filename).suffix.lower()
    file_type = EXTENSION_MAP.get(extension)
    if file_type is None:
        raise UnsupportedMediaTypeError(
            "Only PDF, TXT, and Markdown files are supported.",
            details={"supported_extensions": sorted(EXTENSION_MAP)},
        )

    try:
        size = path.stat().st_size
    except OSError as exc:
        raise FileValidationError(
            "The uploaded file could not be inspected.",
            code="UPLOAD_INSPECTION_FAILED",
            details={"reason": str(exc)},
        ) from exc

    if size <= 0:
        raise FileValidationError(
            "The uploaded file is empty.",
            code="FILE_EMPTY",
        )
    if size > max_size:
        raise PayloadTooLargeError(
            f"The uploaded file exceeds the {max_size} byte limit.",
            details={"size": size, "max_size": max_size},
        )

    mime_type = (declared_mime_type or "").split(";", 1)[0].strip().lower()
    if mime_type == "application/octet-stream":
        guessed_mime_type, _ = mimetypes.guess_type(safe_filename)
        mime_type = (guessed_mime_type or mime_type).lower()
    if mime_type not in MIME_TYPES[file_type]:
        raise FileValidationError(
            "The declared file type does not match the filename extension.",
            code="MIME_TYPE_MISMATCH",
            details={"declared_mime_type": mime_type, "extension": extension},
        )

    try:
        with path.open("rb") as handle:
            header = handle.read(4096)
    except OSError as exc:
        raise FileValidationError(
            "The uploaded file could not be read.",
            code="UPLOAD_INSPECTION_FAILED",
            details={"reason": str(exc)},
        ) from exc

    if len(header) < min(size, 8):
        raise FileValidationError(
            "The uploaded file is truncated or unreadable.",
            code="FILE_TRUNCATED",
        )

    if file_type == "PDF":
        if b"%PDF-" not in header[:1024]:
            raise FileValidationError(
                "The file does not contain a valid PDF signature.",
                code="INVALID_PDF_SIGNATURE",
            )
    else:
        if b"%PDF-" in header[:1024]:
            raise FileValidationError(
                "The file contents do not match the text filename extension.",
                code="FILE_SIGNATURE_MISMATCH",
            )
        has_unicode_bom = header.startswith((b"\xff\xfe", b"\xfe\xff"))
        if any(header.startswith(signature) for signature in BINARY_SIGNATURES):
            raise FileValidationError(
                "The file appears to contain binary data rather than text.",
                code="BINARY_CONTENT_REJECTED",
            )
        if not has_unicode_bom and b"\x00" in header:
            raise FileValidationError(
                "The file appears to contain binary data rather than text.",
                code="BINARY_CONTENT_REJECTED",
            )
        if not header.strip():
            raise FileValidationError(
                "The uploaded text file is empty.",
                code="FILE_EMPTY",
            )

    checksum = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                checksum.update(block)
    except OSError as exc:
        raise FileValidationError(
            "The uploaded file could not be hashed.",
            code="UPLOAD_INSPECTION_FAILED",
            details={"reason": str(exc)},
        ) from exc

    warnings: list[ProcessingWarning] = []
    if safe_filename != original_filename:
        warnings.append(
            ProcessingWarning(
                "FILENAME_SANITIZED",
                "Unsafe characters were removed from the filename.",
            )
        )

    return ValidatedUpload(
        original_filename=original_filename,
        safe_filename=safe_filename,
        file_type=file_type,
        extension=extension,
        mime_type=mime_type,
        size=size,
        checksum_sha256=checksum.hexdigest(),
        warnings=tuple(warnings),
    )
