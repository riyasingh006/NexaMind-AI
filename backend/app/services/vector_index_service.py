import hashlib
import json
import logging
import math
import os
import shutil
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import faiss
import numpy as np

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.schemas.common import VectorIndexState
from app.utils.datetime import utc_now

logger = logging.getLogger(__name__)

INDEX_FILENAME = "index.faiss"
METADATA_FILENAME = "index_metadata.json"
MANIFEST_FILENAME = "index_manifest.json"
BACKUP_DIRNAME = "backups"
FORMAT_VERSION = 1
_INDEX_LOCK = threading.RLock()


class VectorIndexError(AppError):
    status_code = 503
    code = "VECTOR_INDEX_ERROR"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, code=code, details=details or {})


@dataclass(frozen=True)
class VectorRecord:
    chunk_id: UUID
    document_id: UUID
    chunk_index: int
    filename: str
    source_type: str
    page_number: int | None
    section_title: str | None
    section_hierarchy: list[str] = field(default_factory=list)
    vector: np.ndarray = field(default_factory=lambda: np.empty(0, dtype=np.float32))


@dataclass(frozen=True)
class VectorMatch:
    position: int
    score: float
    metadata: dict[str, Any]


@dataclass(frozen=True)
class IndexSnapshot:
    status: VectorIndexState
    vector_count: int
    indexed_documents: int
    version: str | None
    created_at: datetime | None
    updated_at: datetime | None
    recovered: bool
    detail: str


@dataclass(frozen=True)
class _LoadedIndex:
    index: faiss.IndexFlatIP
    metadata: dict[str, Any]
    manifest: dict[str, Any]
    state: VectorIndexState
    detail: str
    recovered: bool = False

    @property
    def vector_count(self) -> int:
        return int(self.index.ntotal)


class VectorIndexService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.directory = self.settings.faiss_dir
        self.index_path = self.directory / INDEX_FILENAME
        self.metadata_path = self.directory / METADATA_FILENAME
        self.manifest_path = self.directory / MANIFEST_FILENAME
        self.backup_dir = self.directory / BACKUP_DIRNAME

    def get_status(self) -> IndexSnapshot:
        with _INDEX_LOCK:
            loaded = self._load_with_recovery()
            if loaded is None:
                return IndexSnapshot(
                    status=VectorIndexState.INITIALIZING,
                    vector_count=0,
                    indexed_documents=0,
                    version=None,
                    created_at=None,
                    updated_at=None,
                    recovered=False,
                    detail="The FAISS index has not been created yet.",
                )
            return self._snapshot(loaded)

    def document_vector_count(self, document_id: UUID) -> int:
        with _INDEX_LOCK:
            loaded = self._load_with_recovery()
            if loaded is None:
                return 0
            target = str(document_id)
            return sum(
                1
                for item in loaded.metadata.get("vectors", [])
                if isinstance(item, dict)
                and str(item.get("document_id")) == target
            )

    def statistics(self) -> dict[str, Any]:
        with _INDEX_LOCK:
            loaded = self._load_with_recovery()
            storage_bytes = sum(
                path.stat().st_size
                for path in (self.index_path, self.metadata_path, self.manifest_path)
                if path.is_file()
            )
            if loaded is None:
                return {
                    "status": VectorIndexState.INITIALIZING,
                    "vector_count": 0,
                    "indexed_documents": 0,
                    "version": None,
                    "updated_at": None,
                    "storage_bytes": storage_bytes,
                    "detail": "The FAISS index has not been created yet.",
                }
            snapshot = self._snapshot(loaded)
            return {
                "status": snapshot.status,
                "vector_count": snapshot.vector_count,
                "indexed_documents": snapshot.indexed_documents,
                "version": snapshot.version,
                "updated_at": snapshot.updated_at,
                "storage_bytes": storage_bytes,
                "detail": snapshot.detail,
            }

    def search(
        self,
        query_vector: list[float] | np.ndarray,
        *,
        top_k: int,
        threshold: float,
        document_ids: list[UUID] | None = None,
    ) -> tuple[list[VectorMatch], str | None]:
        with _INDEX_LOCK:
            loaded = self._load_with_recovery()
            if loaded is None or loaded.vector_count == 0:
                return [], loaded.manifest.get("version") if loaded else None
            if loaded.state == VectorIndexState.DEGRADED:
                raise VectorIndexError(
                    loaded.detail,
                    code="VECTOR_INDEX_INCOMPATIBLE",
                )

            dimension = self.settings.gemini_embedding_dimension
            vector = np.asarray(query_vector, dtype=np.float32).reshape(1, -1)
            if vector.shape[1] != dimension:
                raise VectorIndexError(
                    "The query embedding dimension does not match the vector index.",
                    code="VECTOR_DIMENSION_MISMATCH",
                    details={
                        "expected": dimension,
                        "received": int(vector.shape[1]),
                    },
                )
            norm = float(np.linalg.norm(vector))
            if not math.isfinite(norm) or norm <= 1e-12:
                raise VectorIndexError(
                    "The query embedding is invalid.",
                    code="VECTOR_QUERY_INVALID",
                )
            vector = vector / norm

            scores, positions = loaded.index.search(vector, loaded.vector_count)
            metadata_items = loaded.metadata.get("vectors", [])
            allowed = {str(document_id) for document_id in document_ids or []}
            matches: list[VectorMatch] = []
            seen_chunks: set[str] = set()

            for score, position in zip(scores[0], positions[0], strict=False):
                position_int = int(position)
                if position_int < 0 or position_int >= len(metadata_items):
                    continue
                metadata = metadata_items[position_int]
                if not isinstance(metadata, dict):
                    continue
                if allowed and str(metadata.get("document_id")) not in allowed:
                    continue
                chunk_key = str(metadata.get("chunk_id"))
                if chunk_key in seen_chunks:
                    continue
                score_value = float(score)
                if not math.isfinite(score_value) or score_value < threshold:
                    continue
                seen_chunks.add(chunk_key)
                matches.append(
                    VectorMatch(
                        position=position_int,
                        score=score_value,
                        metadata=metadata,
                    )
                )
                if len(matches) >= top_k:
                    break

            return matches, loaded.manifest.get("version")

    def upsert_document(
        self, document_id: UUID, records: list[VectorRecord]
    ) -> IndexSnapshot:
        with _INDEX_LOCK:
            loaded = self._load_with_recovery()
            if loaded is not None and loaded.state == VectorIndexState.DEGRADED:
                raise VectorIndexError(
                    loaded.detail,
                    code="VECTOR_INDEX_INCOMPATIBLE",
                )

            existing_vectors: list[np.ndarray] = []
            existing_metadata: list[dict[str, Any]] = []
            created_at = loaded.metadata.get("created_at") if loaded else None
            if loaded is not None and loaded.vector_count:
                existing_vectors = [
                    np.asarray(vector, dtype=np.float32)
                    for vector in loaded.index.reconstruct_n(0, loaded.vector_count)
                ]
                existing_metadata = list(loaded.metadata.get("vectors", []))

            target = str(document_id)
            kept_vectors = [
                vector
                for vector, metadata in zip(
                    existing_vectors, existing_metadata, strict=False
                )
                if str(metadata.get("document_id")) != target
            ]
            kept_metadata = [
                metadata
                for metadata in existing_metadata
                if str(metadata.get("document_id")) != target
            ]

            for record in records:
                kept_vectors.append(self._normalize_record_vector(record.vector))
                kept_metadata.append(self._record_metadata(record))

            loaded_snapshot = self._write_snapshot(
                vectors=kept_vectors,
                metadata_items=kept_metadata,
                created_at=created_at,
                backup_current=loaded is not None,
            )
            return loaded_snapshot

    def remove_document(self, document_id: UUID) -> IndexSnapshot:
        return self.upsert_document(document_id, [])

    def rebuild(self, records: list[VectorRecord]) -> IndexSnapshot:
        with _INDEX_LOCK:
            vectors = [self._normalize_record_vector(record.vector) for record in records]
            metadata_items = [self._record_metadata(record) for record in records]
            return self._write_snapshot(
                vectors=vectors,
                metadata_items=metadata_items,
                created_at=None,
                backup_current=True,
            )

    def _write_snapshot(
        self,
        *,
        vectors: list[np.ndarray],
        metadata_items: list[dict[str, Any]],
        created_at: Any,
        backup_current: bool,
    ) -> IndexSnapshot:
        dimension = self.settings.gemini_embedding_dimension
        if vectors and any(vector.shape[0] != dimension for vector in vectors):
            raise VectorIndexError(
                "One or more vectors do not match the configured embedding dimension.",
                code="VECTOR_DIMENSION_MISMATCH",
                details={"expected": dimension},
            )
        if len(vectors) != len(metadata_items):
            raise VectorIndexError(
                "Vector and metadata counts do not match.",
                code="VECTOR_METADATA_MISMATCH",
            )

        self.directory.mkdir(parents=True, exist_ok=True)
        index = faiss.IndexFlatIP(dimension)
        if vectors:
            matrix = np.ascontiguousarray(
                np.vstack(vectors).astype(np.float32), dtype=np.float32
            )
            index.add(matrix)

        now = utc_now()
        version = uuid.uuid4().hex
        metadata = {
            "format_version": FORMAT_VERSION,
            "embedding_model": self.settings.gemini_embedding_model,
            "embedding_dimension": dimension,
            "metric": "cosine",
            "created_at": created_at or now.isoformat(),
            "updated_at": now.isoformat(),
            "vectors": [
                {**item, "position": position}
                for position, item in enumerate(metadata_items)
            ],
        }

        temp_index = self.directory / f".{INDEX_FILENAME}.{uuid.uuid4().hex}.tmp"
        temp_metadata = (
            self.directory / f".{METADATA_FILENAME}.{uuid.uuid4().hex}.tmp"
        )
        try:
            faiss.write_index(index, str(temp_index))
            self._write_json(temp_metadata, metadata)
            index_checksum = self._sha256(temp_index)
            metadata_checksum = self._sha256(temp_metadata)
            manifest = {
                "format_version": FORMAT_VERSION,
                "version": version,
                "embedding_model": self.settings.gemini_embedding_model,
                "embedding_dimension": dimension,
                "metric": "cosine",
                "vector_count": int(index.ntotal),
                "index_filename": INDEX_FILENAME,
                "metadata_filename": METADATA_FILENAME,
                "index_sha256": index_checksum,
                "metadata_sha256": metadata_checksum,
                "created_at": metadata["created_at"],
                "updated_at": metadata["updated_at"],
            }
            temp_manifest = (
                self.directory / f".{MANIFEST_FILENAME}.{uuid.uuid4().hex}.tmp"
            )
            self._write_json(temp_manifest, manifest)

            if backup_current:
                self._backup_current()
            os.replace(temp_index, self.index_path)
            os.replace(temp_metadata, self.metadata_path)
            os.replace(temp_manifest, self.manifest_path)
        finally:
            for path in (temp_index, temp_metadata):
                path.unlink(missing_ok=True)
            if "temp_manifest" in locals():
                temp_manifest.unlink(missing_ok=True)

        loaded = self._load_valid_snapshot(
            self.index_path,
            self.metadata_path,
            self.manifest_path,
            state=VectorIndexState.READY,
            detail="The FAISS index is ready.",
            recovered=False,
        )
        logger.info(
            "vector_index.persisted",
            extra={
                "vector_count": int(index.ntotal),
                "version": version,
                "dimension": dimension,
            },
        )
        return self._snapshot(loaded)

    def _load_with_recovery(self) -> _LoadedIndex | None:
        exists = (
            self.index_path.exists()
            or self.metadata_path.exists()
            or self.manifest_path.exists()
        )
        if not exists:
            return None

        try:
            loaded = self._load_valid_snapshot(
                self.index_path,
                self.metadata_path,
                self.manifest_path,
                state=VectorIndexState.READY,
                detail="The FAISS index is ready.",
                recovered=False,
            )
            return self._apply_compatibility(loaded)
        except Exception as exc:
            logger.warning(
                "vector_index.live_snapshot_invalid",
                extra={"reason": str(exc)},
            )
            recovered = self._restore_latest_backup()
            if recovered is not None:
                return self._apply_compatibility(recovered)
            return _LoadedIndex(
                index=faiss.IndexFlatIP(
                    self.settings.gemini_embedding_dimension
                ),
                metadata={"vectors": []},
                manifest={},
                state=VectorIndexState.DEGRADED,
                detail=f"The FAISS index is invalid and no valid backup exists: {exc}",
            )

    def _apply_compatibility(self, loaded: _LoadedIndex) -> _LoadedIndex:
        model = loaded.manifest.get("embedding_model")
        dimension = loaded.manifest.get("embedding_dimension")
        if (
            model != self.settings.gemini_embedding_model
            or dimension != self.settings.gemini_embedding_dimension
        ):
            return _LoadedIndex(
                index=loaded.index,
                metadata=loaded.metadata,
                manifest=loaded.manifest,
                state=VectorIndexState.DEGRADED,
                detail=(
                    "The persisted FAISS index uses a different embedding model or "
                    "dimension. Rebuild the index before searching."
                ),
                recovered=loaded.recovered,
            )
        return loaded

    def _load_valid_snapshot(
        self,
        index_path: Path,
        metadata_path: Path,
        manifest_path: Path,
        *,
        state: VectorIndexState,
        detail: str,
        recovered: bool,
    ) -> _LoadedIndex:
        if not index_path.is_file() or not metadata_path.is_file() or not manifest_path.is_file():
            raise VectorIndexError(
                "One or more FAISS index files are missing.",
                code="VECTOR_INDEX_FILES_MISSING",
            )
        manifest = self._read_json(manifest_path)
        metadata = self._read_json(metadata_path)

        if manifest.get("format_version") != FORMAT_VERSION:
            raise VectorIndexError(
                "The FAISS manifest format is unsupported.",
                code="VECTOR_INDEX_FORMAT_UNSUPPORTED",
            )
        if self._sha256(index_path) != manifest.get("index_sha256"):
            raise VectorIndexError(
                "The FAISS index checksum does not match its manifest.",
                code="VECTOR_INDEX_CHECKSUM_MISMATCH",
            )
        if self._sha256(metadata_path) != manifest.get("metadata_sha256"):
            raise VectorIndexError(
                "The FAISS metadata checksum does not match its manifest.",
                code="VECTOR_INDEX_CHECKSUM_MISMATCH",
            )

        index = faiss.read_index(str(index_path))
        if not isinstance(index, faiss.IndexFlatIP):
            raise VectorIndexError(
                "The persisted FAISS index has an unsupported type.",
                code="VECTOR_INDEX_TYPE_UNSUPPORTED",
            )
        vector_count = int(manifest.get("vector_count", -1))
        dimension = int(manifest.get("embedding_dimension", -1))
        if index.ntotal != vector_count:
            raise VectorIndexError(
                "The FAISS vector count does not match its manifest.",
                code="VECTOR_INDEX_COUNT_MISMATCH",
            )
        if index.d != dimension:
            raise VectorIndexError(
                "The FAISS index dimension does not match its manifest.",
                code="VECTOR_INDEX_DIMENSION_MISMATCH",
            )
        if metadata.get("embedding_model") != manifest.get("embedding_model"):
            raise VectorIndexError(
                "The FAISS metadata model does not match its manifest.",
                code="VECTOR_INDEX_METADATA_MISMATCH",
            )
        if metadata.get("embedding_dimension") != dimension:
            raise VectorIndexError(
                "The FAISS metadata dimension does not match its manifest.",
                code="VECTOR_INDEX_METADATA_MISMATCH",
            )
        vectors = metadata.get("vectors")
        if not isinstance(vectors, list) or len(vectors) != vector_count:
            raise VectorIndexError(
                "The FAISS metadata vector count is invalid.",
                code="VECTOR_INDEX_METADATA_MISMATCH",
            )
        for position, item in enumerate(vectors):
            if not isinstance(item, dict) or item.get("position") != position:
                raise VectorIndexError(
                    "The FAISS metadata ordering is invalid.",
                    code="VECTOR_INDEX_METADATA_MISMATCH",
                )
            try:
                UUID(str(item["chunk_id"]))
                UUID(str(item["document_id"]))
            except (KeyError, ValueError) as exc:
                raise VectorIndexError(
                    "The FAISS metadata contains invalid chunk identifiers.",
                    code="VECTOR_INDEX_METADATA_MISMATCH",
                ) from exc

        return _LoadedIndex(
            index=index,
            metadata=metadata,
            manifest=manifest,
            state=state,
            detail=detail,
            recovered=recovered,
        )

    def _restore_latest_backup(self) -> _LoadedIndex | None:
        if not self.backup_dir.is_dir():
            return None
        candidates = sorted(
            (path for path in self.backup_dir.iterdir() if path.is_dir()),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        for candidate in candidates:
            try:
                loaded = self._load_valid_snapshot(
                    candidate / INDEX_FILENAME,
                    candidate / METADATA_FILENAME,
                    candidate / MANIFEST_FILENAME,
                    state=VectorIndexState.READY,
                    detail="The FAISS index was recovered from a validated backup.",
                    recovered=True,
                )
            except Exception as exc:
                logger.warning(
                    "vector_index.backup_invalid",
                    extra={"backup": str(candidate), "reason": str(exc)},
                )
                continue

            self.directory.mkdir(parents=True, exist_ok=True)
            shutil.copy2(candidate / INDEX_FILENAME, self.index_path)
            shutil.copy2(candidate / METADATA_FILENAME, self.metadata_path)
            shutil.copy2(candidate / MANIFEST_FILENAME, self.manifest_path)
            logger.warning(
                "vector_index.recovered_from_backup",
                extra={"backup": str(candidate)},
            )
            return loaded
        return None

    def _backup_current(self) -> None:
        try:
            loaded = self._load_valid_snapshot(
                self.index_path,
                self.metadata_path,
                self.manifest_path,
                state=VectorIndexState.READY,
                detail="Backup source.",
                recovered=False,
            )
        except Exception:
            return
        if loaded.vector_count < 0:
            return

        backup_target = self.backup_dir / (
            f"{utc_now().strftime('%Y%m%dT%H%M%S%f')}-{uuid.uuid4().hex[:8]}"
        )
        backup_target.mkdir(parents=True, exist_ok=True)
        for source, name in (
            (self.index_path, INDEX_FILENAME),
            (self.metadata_path, METADATA_FILENAME),
            (self.manifest_path, MANIFEST_FILENAME),
        ):
            shutil.copy2(source, backup_target / name)
        self._prune_backups()

    def _prune_backups(self) -> None:
        if not self.backup_dir.is_dir():
            return
        backups = sorted(
            (path for path in self.backup_dir.iterdir() if path.is_dir()),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        for stale in backups[self.settings.faiss_backup_count :]:
            shutil.rmtree(stale, ignore_errors=True)

    def _snapshot(self, loaded: _LoadedIndex) -> IndexSnapshot:
        document_ids = {
            str(item.get("document_id"))
            for item in loaded.metadata.get("vectors", [])
            if isinstance(item, dict)
        }
        status = loaded.state
        detail = loaded.detail
        if status == VectorIndexState.READY and loaded.vector_count == 0:
            status = VectorIndexState.INITIALIZING
            detail = "The FAISS index is empty; index a document before retrieval."
        return IndexSnapshot(
            status=status,
            vector_count=loaded.vector_count,
            indexed_documents=len(document_ids),
            version=loaded.manifest.get("version"),
            created_at=self._parse_datetime(loaded.manifest.get("created_at")),
            updated_at=self._parse_datetime(loaded.manifest.get("updated_at")),
            recovered=loaded.recovered,
            detail=detail,
        )

    def _record_metadata(self, record: VectorRecord) -> dict[str, Any]:
        return {
            "chunk_id": str(record.chunk_id),
            "document_id": str(record.document_id),
            "chunk_index": record.chunk_index,
            "filename": record.filename,
            "source_type": record.source_type,
            "page_number": record.page_number,
            "section_title": record.section_title,
            "section_hierarchy": list(record.section_hierarchy),
        }

    def _normalize_record_vector(self, vector: np.ndarray | list[float]) -> np.ndarray:
        values = np.asarray(vector, dtype=np.float32)
        if values.ndim != 1:
            raise VectorIndexError(
                "Vector records must contain one-dimensional embeddings.",
                code="VECTOR_RECORD_INVALID",
            )
        norm = float(np.linalg.norm(values))
        if not math.isfinite(norm) or norm <= 1e-12:
            raise VectorIndexError(
                "Vector records must contain finite, non-zero embeddings.",
                code="VECTOR_RECORD_INVALID",
            )
        return (values / norm).astype(np.float32)

    def _write_json(self, path: Path, payload: dict[str, Any]) -> None:
        path.write_text(
            json.dumps(payload, ensure_ascii=True, separators=(",", ":")),
            encoding="utf-8",
        )

    def _read_json(self, path: Path) -> dict[str, Any]:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise VectorIndexError(
                f"Unable to read vector index metadata: {path.name}",
                code="VECTOR_INDEX_METADATA_INVALID",
            ) from exc
        if not isinstance(payload, dict):
            raise VectorIndexError(
                f"Vector index metadata must be an object: {path.name}",
                code="VECTOR_INDEX_METADATA_INVALID",
            )
        return payload

    def _sha256(self, path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    def _parse_datetime(self, value: Any) -> datetime | None:
        if not isinstance(value, str):
            return None
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
