from abc import ABC, abstractmethod
from pathlib import Path

from app.processing.models import ParsedDocument


class BaseParser(ABC):
    file_type: str

    @abstractmethod
    def parse(self, path: Path) -> ParsedDocument:
        raise NotImplementedError
