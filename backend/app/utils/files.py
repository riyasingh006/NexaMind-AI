import re
from pathlib import Path

ALLOWED_EXTENSIONS = {
    ".pdf": ("PDF", "application/pdf"),
    ".txt": ("TXT", "text/plain"),
    ".md": ("MD", "text/markdown"),
    ".markdown": ("MD", "text/markdown"),
}

GENERIC_CONTENT_TYPES = {
    "",
    "application/octet-stream",
    "binary/octet-stream",
}


def sanitize_filename(filename: str) -> str:
    basename = Path(filename).name.strip()
    cleaned = re.sub(r"[^A-Za-z0-9._ -]", "_", basename).strip(" .")
    if not cleaned:
        return "document"
    return cleaned[:255]


def file_metadata_for(filename: str) -> tuple[str, str, str]:
    extension = Path(filename).suffix.lower()
    file_info = ALLOWED_EXTENSIONS.get(extension)
    if file_info is None:
        return "", extension, ""
    file_type, content_type = file_info
    return file_type, extension, content_type


def is_generic_content_type(content_type: str | None) -> bool:
    return (content_type or "").lower() in GENERIC_CONTENT_TYPES
