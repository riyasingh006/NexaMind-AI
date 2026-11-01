import re
import unicodedata

from app.processing.models import (
    ParsedDocument,
    ProcessedBlock,
    ProcessedDocument,
    ProcessingWarning,
)

LINE_ENDING_PATTERN = re.compile(r"\r\n?|\u2028|\u2029")
EXCESS_BLANK_LINES = re.compile(r"\n{3,}")
TRAILING_WHITESPACE = re.compile(r"[ \t]+$", re.MULTILINE)
REMOVED_FORMAT_CHARACTERS = {
    "\u200b",
    "\u200c",
    "\u200e",
    "\u200f",
    "\u202a",
    "\u202b",
    "\u202c",
    "\u202d",
    "\u202e",
    "\u2060",
    "\u2066",
    "\u2067",
    "\u2068",
    "\u2069",
    "\ufeff",
}


def preprocess_document(parsed: ParsedDocument) -> ProcessedDocument:
    processed_blocks: list[ProcessedBlock] = []
    warnings = list(parsed.warnings)
    cursor = 0
    removed_control_characters = 0

    for block in parsed.blocks:
        cleaned, removed = clean_text(block.text, preserve_formatting=block.kind == "code")
        removed_control_characters += removed
        if not cleaned.strip():
            continue
        start = cursor
        end = start + len(cleaned)
        processed_blocks.append(
            ProcessedBlock(
                kind=block.kind,
                text=cleaned,
                start_offset=start,
                end_offset=end,
                page_number=block.page_number,
                section_title=block.section_title,
                section_hierarchy=block.section_hierarchy,
                heading_level=block.heading_level,
                metadata=block.metadata,
            )
        )
        cursor = end + 2

    normalized_text = "\n\n".join(block.text for block in processed_blocks)
    if not normalized_text.strip() and not parsed.requires_ocr:
        warnings.append(
            ProcessingWarning(
                "EMPTY_AFTER_PREPROCESSING",
                "No meaningful text remained after preprocessing.",
            )
        )
    if removed_control_characters:
        warnings.append(
            ProcessingWarning(
                "CONTROL_CHARACTERS_REMOVED",
                f"Removed {removed_control_characters} unsupported control characters.",
            )
        )

    metadata = {
        **parsed.metadata,
        "preprocessing_version": 1,
        "normalized_character_count": len(normalized_text),
    }

    return ProcessedDocument(
        raw_text=parsed.text,
        normalized_text=normalized_text,
        blocks=tuple(processed_blocks),
        warnings=tuple(warnings),
        metadata=metadata,
        page_count=parsed.page_count,
        title=parsed.title,
        author=parsed.author,
        requires_ocr=parsed.requires_ocr,
    )


def clean_text(value: str, *, preserve_formatting: bool = False) -> tuple[str, int]:
    normalized = unicodedata.normalize("NFC", value)
    normalized = LINE_ENDING_PATTERN.sub("\n", normalized)
    normalized = normalized.replace("\u00a0", " ").replace("\u00ad", "")
    output: list[str] = []
    removed = 0

    for character in normalized:
        if character in REMOVED_FORMAT_CHARACTERS:
            removed += 1
            continue
        category = unicodedata.category(character)
        if character in {"\n", "\t"}:
            output.append(character)
        elif category in {"Cc", "Cs"}:
            removed += 1
        else:
            output.append(character)

    result = "".join(output).strip()
    result = TRAILING_WHITESPACE.sub("", result)
    if not preserve_formatting:
        result = EXCESS_BLANK_LINES.sub("\n\n", result)
    return result, removed
