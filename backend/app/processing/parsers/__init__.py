from app.processing.parsers.base import BaseParser
from app.processing.parsers.markdown import MarkdownParser
from app.processing.parsers.pdf import PdfParser
from app.processing.parsers.txt import TextParser

PARSERS: dict[str, BaseParser] = {
    "PDF": PdfParser(),
    "TXT": TextParser(),
    "MD": MarkdownParser(),
}


def get_parser(file_type: str) -> BaseParser:
    parser = PARSERS.get(file_type.upper())
    if parser is None:
        raise ValueError(f"Unsupported file type: {file_type}")
    return parser


__all__ = [
    "BaseParser",
    "MarkdownParser",
    "PARSERS",
    "PdfParser",
    "TextParser",
    "get_parser",
]
