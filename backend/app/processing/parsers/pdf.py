from pathlib import Path

import pymupdf

from app.processing.errors import DocumentParseError
from app.processing.models import ParsedBlock, ParsedDocument, ParsedPage, ProcessingWarning
from app.processing.parsers.base import BaseParser
from app.processing.parsers.text_io import paragraph_spans


class PdfParser(BaseParser):
    file_type = "PDF"

    def parse(self, path: Path) -> ParsedDocument:
        try:
            document = pymupdf.open(path)
        except (pymupdf.FileDataError, RuntimeError, ValueError) as exc:
            raise DocumentParseError(
                "CORRUPTED_PDF",
                "The PDF is corrupted or cannot be opened",
                details={"reason": str(exc)},
            ) from exc

        try:
            if document.needs_pass:
                raise DocumentParseError(
                    "ENCRYPTED_PDF",
                    "The PDF is encrypted and requires a password",
                )

            pages: list[ParsedPage] = []
            blocks: list[ParsedBlock] = []
            warnings: list[ProcessingWarning] = []
            raw_parts: list[str] = []
            cursor = 0
            image_only_pages = 0
            extracted_text_total = 0

            for page_index in range(document.page_count):
                page_number = page_index + 1
                try:
                    page = document.load_page(page_index)
                    text = page.get_text("text", sort=True) or ""
                except (RuntimeError, ValueError) as exc:
                    warnings.append(
                        ProcessingWarning(
                            "PAGE_EXTRACTION_FAILED",
                            "Text extraction failed for this page.",
                            page_number,
                        )
                    )
                    text = ""

                text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
                image_count = 0
                try:
                    image_count = len(page.get_images(full=True))
                except (RuntimeError, ValueError):
                    image_count = 0

                is_image_only = not text and image_count > 0
                if is_image_only:
                    image_only_pages += 1
                    warnings.append(
                        ProcessingWarning(
                            "OCR_REQUIRED",
                            "This page appears to contain images but no extractable text. OCR is not available in Phase 3.",
                            page_number,
                        )
                    )
                elif not text:
                    warnings.append(
                        ProcessingWarning(
                            "EMPTY_PAGE",
                            "No extractable text was found on this page.",
                            page_number,
                        )
                    )

                extracted_text_total += len(text)
                pages.append(
                    ParsedPage(
                        page_number=page_number,
                        text=text,
                        character_count=len(text),
                        is_image_only=is_image_only,
                        metadata={"image_count": image_count},
                    )
                )

                page_start = cursor
                for start, end, paragraph in paragraph_spans(text):
                    blocks.append(
                        ParsedBlock(
                            kind="paragraph",
                            text=paragraph,
                            start_offset=page_start + start,
                            end_offset=page_start + end,
                            page_number=page_number,
                        )
                    )
                raw_parts.append(text)
                cursor += len(text) + 2

            raw_text = "\n\n".join(raw_parts)
            metadata = document.metadata or {}
            title = _clean_metadata(metadata.get("title"))
            author = _clean_metadata(metadata.get("author"))
            requires_ocr = extracted_text_total == 0 and image_only_pages > 0

            if document.page_count == 0:
                warnings.append(
                    ProcessingWarning(
                        "EMPTY_DOCUMENT",
                        "The PDF does not contain any pages.",
                    )
                )
            elif extracted_text_total == 0 and not requires_ocr:
                warnings.append(
                    ProcessingWarning(
                        "EMPTY_DOCUMENT",
                        "No extractable text was found in the PDF.",
                    )
                )

            return ParsedDocument(
                text=raw_text,
                blocks=tuple(blocks),
                pages=tuple(pages),
                metadata={
                    "extraction_method": "pymupdf",
                    "pdf_metadata": {
                        "title": title,
                        "author": author,
                        "subject": _clean_metadata(metadata.get("subject")),
                        "creator": _clean_metadata(metadata.get("creator")),
                        "producer": _clean_metadata(metadata.get("producer")),
                    },
                },
                warnings=tuple(warnings),
                page_count=document.page_count,
                title=title,
                author=author,
                requires_ocr=requires_ocr,
            )
        finally:
            document.close()


def _clean_metadata(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = " ".join(value.split()).strip()
    return normalized or None
