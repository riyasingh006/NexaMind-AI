import logging
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

import app.models
from app.core.config import get_settings
from app.database.base import Base

logger = logging.getLogger(__name__)
settings = get_settings()


def _create_engine() -> AsyncEngine:
    engine_options: dict[str, Any] = {
        "echo": settings.database_echo,
        "pool_pre_ping": True,
    }
    if settings.is_sqlite:
        engine_options["connect_args"] = {"check_same_thread": False}
    else:
        engine_options["pool_size"] = settings.database_pool_size
        engine_options["max_overflow"] = settings.database_max_overflow
    return create_async_engine(settings.database_url, **engine_options)


engine = _create_engine()

if settings.is_sqlite:

    @event.listens_for(engine.sync_engine, "connect")
    def _enable_sqlite_foreign_keys(
        dbapi_connection: Any, connection_record: Any
    ) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        if settings.is_sqlite:
            await _migrate_phase4_columns(connection)


async def _migrate_phase4_columns(connection: Any) -> None:
    result = await connection.execute(text("PRAGMA table_info(document_chunks)"))
    existing = {str(row[1]) for row in result.all()}
    additions = {
        "embedding_status": "VARCHAR(24) NOT NULL DEFAULT 'PENDING'",
        "embedding_model": "VARCHAR(128)",
        "embedding_dimension": "INTEGER",
        "embedded_at": "DATETIME",
    }
    for name, definition in additions.items():
        if name not in existing:
            await connection.execute(
                text(f"ALTER TABLE document_chunks ADD COLUMN {name} {definition}")
            )
    await connection.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding_status "
            "ON document_chunks (embedding_status)"
        )
    )


async def dispose_db() -> None:
    await engine.dispose()
