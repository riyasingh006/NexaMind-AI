from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "DocuMind AI API"
    app_version: str = "1.0.0"
    app_env: Literal["development", "testing", "production"] = "development"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    frontend_url: str = "http://localhost:3000"
    log_level: str = "INFO"
    log_dir: Path = BACKEND_DIR / "logs"
    storage_dir: Path = BACKEND_DIR / "storage"
    extracted_dir: Path = BACKEND_DIR / "data" / "extracted"
    processing_temp_dir: Path = BACKEND_DIR / "data" / "tmp"
    database_url: str = f"sqlite+aiosqlite:///{(BACKEND_DIR / 'data' / 'documind.db').as_posix()}"
    database_echo: bool = False
    database_pool_size: int = 5
    database_max_overflow: int = 10
    max_upload_size: int = Field(default=25 * 1024 * 1024, gt=0)
    processing_timeout_seconds: float = Field(default=120.0, gt=0)
    chunk_size: int = Field(default=1000, gt=0)
    chunk_overlap: int = Field(default=150, ge=0)
    min_chunk_size: int = Field(default=100, gt=0)
    max_chunk_size: int = Field(default=2000, gt=0)
    chunking_strategy: Literal["auto", "recursive", "structure"] = "auto"
    content_preview_characters: int = Field(default=800, ge=100, le=5000)
    content_endpoint_max_characters: int = Field(default=50000, ge=1000)
    documind_gemini_api_key: SecretStr | None = None
    gemini_generation_model: str = "gemini-3.6-flash"
    gemini_generation_temperature: float = Field(default=0.2, ge=0.0, le=1.0)
    gemini_generation_timeout_seconds: float = Field(default=60.0, gt=0)
    gemini_embedding_model: str = "gemini-embedding-001"
    gemini_embedding_dimension: int = Field(default=768, ge=1, le=3072)
    gemini_embedding_batch_size: int = Field(default=32, ge=1, le=100)
    gemini_embedding_timeout_seconds: float = Field(default=30.0, gt=0)
    gemini_embedding_max_retries: int = Field(default=3, ge=0, le=10)
    gemini_embedding_retry_base_seconds: float = Field(default=0.5, ge=0)
    faiss_dir: Path = BACKEND_DIR / "storage" / "faiss"
    faiss_backup_count: int = Field(default=5, ge=0, le=50)
    vector_search_default_top_k: int = Field(default=5, ge=1, le=100)
    vector_search_max_top_k: int = Field(default=50, ge=1, le=100)
    vector_similarity_threshold: float = Field(default=0.0, ge=-1.0, le=1.0)
    vector_index_auto_on_upload: bool = True
    documind_rag_top_k: int = Field(default=8, ge=1, le=50)
    documind_rag_similarity_threshold: float = Field(
        default=0.35, ge=-1.0, le=1.0
    )
    documind_rag_max_context_chunks: int = Field(default=10, ge=1, le=50)
    documind_rag_max_context_tokens: int = Field(default=12000, ge=256)
    documind_rag_max_retrieval_queries: int = Field(default=4, ge=1, le=10)
    documind_rag_multi_query_enabled: bool = True
    documind_rag_hybrid_search_enabled: bool = True
    documind_rag_semantic_weight: float = Field(default=0.45, ge=0.0, le=1.0)
    documind_rag_lexical_weight: float = Field(default=0.30, ge=0.0, le=1.0)
    documind_rag_rrf_weight: float = Field(default=0.25, ge=0.0, le=1.0)
    documind_rag_rrf_k: int = Field(default=60, ge=1, le=1000)
    documind_rag_reranking_enabled: bool = True
    documind_rag_rerank_top_k: int = Field(default=10, ge=1, le=50)
    documind_rag_final_top_k: int = Field(default=5, ge=1, le=50)
    documind_rag_neighbor_expansion_enabled: bool = False
    documind_groundedness_enabled: bool = True
    documind_groundedness_max_retries: int = Field(default=1, ge=0, le=3)
    documind_groundedness_threshold: float = Field(default=0.75, ge=0.0, le=1.0)
    documind_agent_max_retries: int = Field(default=2, ge=0, le=5)
    documind_agent_timeout_seconds: float = Field(default=120.0, gt=0)

    @field_validator("api_v1_prefix")
    @classmethod
    def normalize_api_prefix(cls, value: str) -> str:
        normalized = "/" + value.strip("/")
        if normalized == "/":
            raise ValueError("API_V1_PREFIX must not be empty")
        return normalized

    @field_validator("frontend_url")
    @classmethod
    def normalize_frontend_url(cls, value: str) -> str:
        return value.strip().rstrip("/")

    @field_validator("gemini_generation_model", "gemini_embedding_model")
    @classmethod
    def normalize_model_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Gemini model names must not be empty")
        return normalized

    @model_validator(mode="after")
    def validate_chunking_configuration(self) -> "Settings":
        if self.min_chunk_size > self.chunk_size:
            raise ValueError("MIN_CHUNK_SIZE must not exceed CHUNK_SIZE")
        if self.chunk_size > self.max_chunk_size:
            raise ValueError("CHUNK_SIZE must not exceed MAX_CHUNK_SIZE")
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("CHUNK_OVERLAP must be smaller than CHUNK_SIZE")
        if self.vector_search_default_top_k > self.vector_search_max_top_k:
            raise ValueError(
                "VECTOR_SEARCH_DEFAULT_TOP_K must not exceed VECTOR_SEARCH_MAX_TOP_K"
            )
        if (
            self.documind_rag_semantic_weight
            + self.documind_rag_lexical_weight
            + self.documind_rag_rrf_weight
        ) <= 0:
            raise ValueError("At least one retrieval fusion weight must be positive")
        if self.documind_rag_final_top_k > self.documind_rag_rerank_top_k:
            raise ValueError(
                "DOCUMIND_RAG_FINAL_TOP_K must not exceed DOCUMIND_RAG_RERANK_TOP_K"
            )
        return self

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def cors_origins(self) -> list[str]:
        return [self.frontend_url]

    @property
    def gemini_configured(self) -> bool:
        return bool(
            self.documind_gemini_api_key
            and self.documind_gemini_api_key.get_secret_value().strip()
        )

    def ensure_directories(self) -> None:
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.extracted_dir.mkdir(parents=True, exist_ok=True)
        self.processing_temp_dir.mkdir(parents=True, exist_ok=True)
        self.faiss_dir.mkdir(parents=True, exist_ok=True)
        if self.is_sqlite:
            database_path = self.database_url.rsplit("///", 1)[-1]
            if database_path and database_path != ":memory:":
                Path(database_path).expanduser().resolve().parent.mkdir(
                    parents=True, exist_ok=True
                )


@lru_cache
def get_settings() -> Settings:
    return Settings()
