from pathlib import Path

from markdown_it import MarkdownIt

from app.processing.models import ParsedBlock, ParsedDocument, ParsedSection, ProcessingWarning
from app.processing.parsers.base import BaseParser
from app.processing.parsers.text_io import read_text_file

BLOCK_TOKEN_TYPES = {
    "heading_open": "heading",
    "paragraph_open": "paragraph",
    "bullet_list_open": "list",
    "ordered_list_open": "list",
    "blockquote_open": "quote",
    "table_open": "table",
    "fence": "code",
    "code_block": "code",
    "html_block": "html",
}


class MarkdownParser(BaseParser):
    file_type = "MD"

    def __init__(self) -> None:
        self.parser = MarkdownIt("commonmark").enable("table")

    def parse(self, path: Path) -> ParsedDocument:
        text, encoding = read_text_file(path)
        tokens = self.parser.parse(text)
        lines = text.splitlines(keepends=True)
        line_offsets = [0]
        for line in lines:
            line_offsets.append(line_offsets[-1] + len(line))

        blocks: list[ParsedBlock] = []
        warnings: list[ProcessingWarning] = []
        section_stack: list[tuple[int, str]] = []
        section_starters: list[dict[str, object]] = []
        heading_count = 0
        code_block_count = 0
        table_count = 0
        link_count = sum(1 for token in tokens if token.type == "link_open")
        title: str | None = None
        inline_by_line: dict[int, str] = {}

        for index, token in enumerate(tokens):
            if token.type == "inline" and token.map and token.map[0] not in inline_by_line:
                inline_by_line[token.map[0]] = token.content

            if token.level != 0 or not token.map:
                continue
            kind = BLOCK_TOKEN_TYPES.get(token.type)
            if kind is None:
                continue

            start_line, end_line = token.map
            source = "".join(lines[start_line:end_line])
            raw_start = line_offsets[start_line]
            leading = len(source) - len(source.lstrip())
            trailing = len(source) - len(source.rstrip())
            block_text = source.strip()
            if not block_text:
                continue
            block_start = raw_start + leading
            block_end = raw_start + len(source) - trailing

            heading_level: int | None = None
            if kind == "heading":
                heading_level = int(token.tag[1])
                heading_count += 1
                heading_text = inline_by_line.get(start_line) or block_text.lstrip("#").strip()
                heading_text = " ".join(heading_text.split())
                if not heading_text:
                    heading_text = f"Heading {heading_count}"
                while section_stack and section_stack[-1][0] >= heading_level:
                    section_stack.pop()
                section_stack.append((heading_level, heading_text))
                section_starters.append(
                    {
                        "title": heading_text,
                        "level": heading_level,
                        "hierarchy": tuple(title for _, title in section_stack),
                        "start_offset": block_start,
                        "end_offset": len(text),
                    }
                )
                if title is None and heading_level == 1:
                    title = heading_text
            elif kind == "code":
                code_block_count += 1
            elif kind == "table":
                table_count += 1

            hierarchy = tuple(title for _, title in section_stack)
            section_title = hierarchy[-1] if hierarchy else None
            blocks.append(
                ParsedBlock(
                    kind=kind,
                    text=block_text,
                    start_offset=block_start,
                    end_offset=block_end,
                    section_title=section_title,
                    section_hierarchy=hierarchy,
                    heading_level=heading_level,
                )
            )

        sections = self._sections(section_starters, len(text))

        if not blocks:
            warnings.append(
                ProcessingWarning(
                    "EMPTY_DOCUMENT",
                    "The Markdown document does not contain meaningful content.",
                )
            )
        elif not sections:
            warnings.append(
                ProcessingWarning(
                    "NO_HEADINGS",
                    "The Markdown document has no headings, so section metadata is unavailable.",
                )
            )

        return ParsedDocument(
            text=text,
            blocks=tuple(blocks),
            sections=sections,
            metadata={
                "extraction_method": "markdown-it-py",
                "encoding": encoding,
                "heading_count": heading_count,
                "code_block_count": code_block_count,
                "table_count": table_count,
                "link_count": link_count,
            },
            warnings=tuple(warnings),
            title=title,
        )

    def _sections(
        self, starters: list[dict[str, object]], document_end: int
    ) -> tuple[ParsedSection, ...]:
        sections: list[ParsedSection] = []
        for index, item in enumerate(starters):
            end_offset = (
                int(starters[index + 1]["start_offset"])
                if index + 1 < len(starters)
                else document_end
            )
            sections.append(
                ParsedSection(
                    title=str(item["title"]),
                    level=int(item["level"]),
                    hierarchy=tuple(item["hierarchy"]),
                    start_offset=int(item["start_offset"]),
                    end_offset=end_offset,
                )
            )
        return tuple(sections)
