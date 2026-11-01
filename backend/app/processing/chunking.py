import math
from dataclasses import dataclass, field

from app.processing.models import (
    ChunkDraft,
    ChunkingConfig,
    ProcessedBlock,
    ProcessedDocument,
)


@dataclass
class _Segment:
    text: str
    start_offset: int
    end_offset: int
    page_number: int | None
    section_title: str | None
    section_hierarchy: tuple[str, ...]
    kind: str
    heading_level: int | None
    is_overlap: bool = False


@dataclass
class _ChunkBuilder:
    segments: list[_Segment] = field(default_factory=list)

    @property
    def content(self) -> str:
        return "\n\n".join(segment.text for segment in self.segments if segment.text)

    @property
    def length(self) -> int:
        if not self.segments:
            return 0
        return sum(len(segment.text) for segment in self.segments) + 2 * (
            len(self.segments) - 1
        )

    @property
    def meaningful_segments(self) -> list[_Segment]:
        segments = [segment for segment in self.segments if not segment.is_overlap]
        return segments or self.segments

    def to_draft(self, strategy: str) -> ChunkDraft:
        content = self.content
        meaningful = self.meaningful_segments
        first = self.segments[0]
        last = self.segments[-1]
        pages = [
            segment.page_number for segment in meaningful if segment.page_number is not None
        ]
        section_segment = next(
            (
                segment
                for segment in meaningful
                if segment.section_title or segment.section_hierarchy
            ),
            meaningful[0],
        )
        block_kinds = tuple(
            dict.fromkeys(segment.kind for segment in meaningful if segment.kind)
        )
        metadata = {
            "strategy": strategy,
            "page_number_end": max(pages) if pages else None,
            "block_kinds": list(block_kinds),
            "token_count_method": "characters_div_4_estimate",
            "contains_overlap": any(segment.is_overlap for segment in self.segments),
            "segment_count": len(meaningful),
        }
        return ChunkDraft(
            content=content,
            start_offset=first.start_offset,
            end_offset=last.end_offset,
            page_number=pages[0] if pages else first.page_number,
            section_title=section_segment.section_title,
            section_hierarchy=section_segment.section_hierarchy,
            block_kinds=block_kinds,
            token_count_estimate=estimate_tokens(content),
            metadata=metadata,
        )


def chunk_document(
    document: ProcessedDocument,
    config: ChunkingConfig | None = None,
) -> list[ChunkDraft]:
    settings = config or ChunkingConfig()
    strategy = resolve_strategy(document, settings.strategy)
    use_structure = strategy == "structure"
    segments = _build_segments(document.blocks, settings.max_chunk_size, settings.chunk_overlap)
    builders: list[_ChunkBuilder] = []
    current = _ChunkBuilder()
    pending_overlap: _Segment | None = None
    overlap_size = min(settings.chunk_overlap, settings.chunk_size // 2)

    def flush(*, allow_overlap: bool) -> None:
        nonlocal current, pending_overlap
        if not current.segments:
            return
        draft = current.to_draft(strategy)
        builders.append(_ChunkBuilder(segments=list(current.segments)))
        if allow_overlap and overlap_size > 0 and len(draft.content) > overlap_size:
            tail = draft.content[-overlap_size:]
            pending_overlap = _Segment(
                text=tail,
                start_offset=max(0, draft.end_offset - overlap_size),
                end_offset=draft.end_offset,
                page_number=draft.page_number,
                section_title=draft.section_title,
                section_hierarchy=draft.section_hierarchy,
                kind="overlap",
                heading_level=None,
                is_overlap=True,
            )
        else:
            pending_overlap = None
        current = _ChunkBuilder()

    for segment in segments:
        starts_section = use_structure and segment.kind == "heading" and current.segments
        changes_page = (
            use_structure
            and current.segments
            and segment.page_number is not None
            and current.meaningful_segments[-1].page_number is not None
            and segment.page_number != current.meaningful_segments[-1].page_number
            and current.length >= settings.min_chunk_size
        )
        if starts_section or changes_page:
            flush(allow_overlap=False)

        proposed_length = (
            current.length + 2 + len(segment.text) if current.segments else len(segment.text)
        )
        if current.segments and proposed_length > settings.max_chunk_size:
            flush(allow_overlap=True)

        if not current.segments and pending_overlap is not None:
            overlap = pending_overlap
            pending_overlap = None
            if len(overlap.text) + 2 + len(segment.text) <= settings.max_chunk_size:
                current.segments.append(overlap)

        if current.segments and current.length + 2 + len(segment.text) > settings.max_chunk_size:
            flush(allow_overlap=False)

        current.segments.append(segment)

    flush(allow_overlap=False)

    if (
        len(builders) > 1
        and len(builders[-1].content) < settings.min_chunk_size
        and builders[-1].segments[0].kind != "heading"
        and len(builders[-2].content) + 2 + len(builders[-1].content)
        <= settings.max_chunk_size
    ):
        builders[-2].segments.extend(builders[-1].segments)
        builders.pop()

    return [builder.to_draft(strategy) for builder in builders]


def resolve_strategy(document: ProcessedDocument, requested: str) -> str:
    if requested in {"recursive", "structure"}:
        return requested
    has_structure = any(block.section_hierarchy for block in document.blocks) or any(
        block.page_number is not None for block in document.blocks
    )
    return "structure" if has_structure else "recursive"


def estimate_tokens(content: str) -> int:
    return max(1, math.ceil(len(content) / 4))


def _build_segments(
    blocks: tuple[ProcessedBlock, ...],
    max_chunk_size: int,
    overlap: int,
) -> list[_Segment]:
    segments: list[_Segment] = []
    for block in blocks:
        base = _Segment(
            text=block.text,
            start_offset=block.start_offset,
            end_offset=block.end_offset,
            page_number=block.page_number,
            section_title=block.section_title,
            section_hierarchy=block.section_hierarchy,
            kind=block.kind,
            heading_level=block.heading_level,
        )
        if len(block.text) <= max_chunk_size:
            segments.append(base)
            continue
        for start, end in _split_ranges(block.text, max_chunk_size, overlap):
            segments.append(
                _Segment(
                    text=block.text[start:end],
                    start_offset=block.start_offset + start,
                    end_offset=block.start_offset + end,
                    page_number=block.page_number,
                    section_title=block.section_title,
                    section_hierarchy=block.section_hierarchy,
                    kind=block.kind,
                    heading_level=block.heading_level,
                )
            )
    return segments


def _split_ranges(text: str, max_size: int, overlap: int) -> list[tuple[int, int]]:
    ranges: list[tuple[int, int]] = []
    start = 0
    text_length = len(text)
    overlap = min(overlap, max_size // 2)

    while start < text_length:
        end = min(start + max_size, text_length)
        if end < text_length:
            end = _find_break(text, start, end, max_size)
        if end <= start:
            end = min(start + max_size, text_length)
        ranges.append((start, end))
        if end >= text_length:
            break
        next_start = max(start + 1, end - overlap)
        if next_start <= start:
            next_start = end
        start = next_start

    return ranges


def _find_break(text: str, start: int, end: int, max_size: int) -> int:
    minimum = start + max(1, int(max_size * 0.6))
    for separator in ("\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " "):
        index = text.rfind(separator, minimum, end)
        if index >= minimum:
            return index + len(separator)
    return end
