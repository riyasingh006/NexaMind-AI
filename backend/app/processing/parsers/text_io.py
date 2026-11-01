from pathlib import Path

from charset_normalizer import from_bytes

from app.processing.errors import DocumentParseError


def normalize_newlines(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")


def decode_text_bytes(data: bytes) -> tuple[str, str]:
    if data.startswith(b"\xef\xbb\xbf"):
        return data.decode("utf-8-sig"), "utf-8-sig"
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        try:
            return data.decode("utf-16"), "utf-16"
        except UnicodeDecodeError as exc:
            raise DocumentParseError(
                "TEXT_DECODING_FAILED",
                "The text file could not be decoded",
                details={"reason": str(exc)},
            ) from exc

    try:
        return data.decode("utf-8"), "utf-8"
    except UnicodeDecodeError:
        pass

    best_match = from_bytes(data).best()
    if best_match is not None and best_match.encoding:
        try:
            return str(best_match), best_match.encoding
        except (UnicodeDecodeError, LookupError):
            pass

    for encoding in ("cp1252", "windows-1252", "latin-1"):
        try:
            return data.decode(encoding), encoding
        except UnicodeDecodeError:
            continue

    raise DocumentParseError(
        "TEXT_DECODING_FAILED",
        "The text file encoding could not be detected safely",
    )


def read_text_file(path: Path) -> tuple[str, str]:
    try:
        data = path.read_bytes()
    except OSError as exc:
        raise DocumentParseError(
            "FILE_READ_FAILED",
            "The stored document could not be read",
            details={"reason": str(exc)},
            retryable=True,
        ) from exc

    text, encoding = decode_text_bytes(data)
    return normalize_newlines(text), encoding


def paragraph_spans(text: str) -> list[tuple[int, int, str]]:
    paragraphs: list[tuple[int, int, str]] = []
    offset = 0
    for part in text.split("\n\n"):
        start = offset
        end = start + len(part)
        stripped = part.strip()
        if stripped:
            leading = len(part) - len(part.lstrip())
            trailing = len(part) - len(part.rstrip())
            paragraphs.append(
                (start + leading, end - trailing, part[leading : len(part) - trailing])
            )
        offset = end + 2
    return paragraphs
