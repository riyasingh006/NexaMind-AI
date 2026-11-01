from pathlib import Path

from app.processing.models import ParsedBlock, ParsedDocument, ProcessingWarning
from app.processing.parsers.base import BaseParser
from app.processing.parsers.text_io import paragraph_spans, read_text_file


class TextParser(BaseParser):
    file_type = "TXT"

    def parse(self, path: Path) -> ParsedDocument:
        text, encoding = read_text_file(path)
        blocks: list[ParsedBlock] = []
        warnings: list[ProcessingWarning] = []

        for start, end, paragraph in paragraph_spans(text):
            blocks.append(
                ParsedBlock(
                    kind="paragraph",
                    text=paragraph,
                    start_offset=start,
                    end_offset=end,
                )
            )

        if not text.strip():
            warnings.append(
                ProcessingWarning(
                    "EMPTY_DOCUMENT",
                    "The text document does not contain meaningful content.",
                )
            )
        elif encoding not in {"utf-8", "utf-8-sig"}:
            warnings.append(
                ProcessingWarning(
                    "TEXT_ENCODING_DETECTED",
                    f"The document was decoded using {encoding}.",
                )
            )

        return ParsedDocument(
            text=text,
            blocks=tuple(blocks),
            metadata={
                "extraction_method": "standard-library-text",
                "encoding": encoding,
            },
            warnings=tuple(warnings),
        )
