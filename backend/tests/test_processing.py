from pathlib import Path

from app.processing.chunking import chunk_document
from app.processing.models import ChunkingConfig
from app.processing.parsers.markdown import MarkdownParser
from app.processing.parsers.pdf import PdfParser
from app.processing.parsers.txt import TextParser
from app.processing.preprocessing import clean_text, preprocess_document


def test_text_parser_supports_utf16_bom(tmp_path: Path):
    path = tmp_path / "unicode.txt"
    path.write_bytes("Hello world\n\nSecond paragraph".encode("utf-16"))

    parsed = TextParser().parse(path)
    assert "Hello world" in parsed.text
    assert parsed.metadata["encoding"] == "utf-16"
    assert len(parsed.blocks) == 2


def test_markdown_parser_preserves_structure_and_hierarchy(tmp_path: Path):
    path = tmp_path / "guide.md"
    path.write_text(
        "# Top\n\nIntro.\n\n## Child\n\n- one\n- two\n\n```python\nprint('ok')\n```\n",
        encoding="utf-8",
    )

    parsed = MarkdownParser().parse(path)
    kinds = [block.kind for block in parsed.blocks]
    assert kinds == ["heading", "paragraph", "heading", "list", "code"]
    child = next(block for block in parsed.blocks if block.section_title == "Child")
    assert child.section_hierarchy == ("Top", "Child")
    assert parsed.metadata["heading_count"] == 2
    assert parsed.metadata["code_block_count"] == 1


def test_preprocessing_normalizes_without_destroying_structure():
    cleaned, removed = clean_text("Line\u00a0one\u200b\r\n\r\n\r\nLine two\x00")
    assert cleaned == "Line one\n\nLine two"
    assert removed == 2


def test_chunking_respects_limits_and_overlap(tmp_path: Path):
    text = " ".join(f"Sentence {index} has useful technical content." for index in range(80))
    path = tmp_path / "chunk-source.txt"
    path.write_text(text, encoding="utf-8")
    parsed = TextParser().parse(path)
    processed = preprocess_document(parsed)
    chunks = chunk_document(
        processed,
        ChunkingConfig(
            chunk_size=120,
            chunk_overlap=20,
            min_chunk_size=40,
            max_chunk_size=200,
            strategy="recursive",
        ),
    )

    assert len(chunks) > 2
    assert all(0 < len(chunk.content) <= 200 for chunk in chunks)
    assert all(chunk.token_count_estimate > 0 for chunk in chunks)
    assert any(
        left.content[-20:] in right.content
        for left, right in zip(chunks, chunks[1:])
    )


def test_pdf_parser_reports_pages_and_metadata(tmp_path: Path):
    import pymupdf

    path = tmp_path / "sample.pdf"
    document = pymupdf.open()
    first = document.new_page()
    first.insert_text((72, 72), "Page one content", fontsize=11)
    second = document.new_page()
    second.insert_text((72, 72), "Page two content", fontsize=11)
    document.set_metadata({"title": "Example", "author": "Tester"})
    document.save(path)
    document.close()

    parsed = PdfParser().parse(path)
    assert parsed.page_count == 2
    assert parsed.title == "Example"
    assert parsed.author == "Tester"
    assert [page.page_number for page in parsed.pages] == [1, 2]
    assert not parsed.requires_ocr
