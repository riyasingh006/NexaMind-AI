import atexit
import os
import shutil
import tempfile
from pathlib import Path

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

TEST_ROOT = Path(tempfile.mkdtemp(prefix="documind-backend-tests-"))

os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["DATABASE_URL"] = (
    f"sqlite+aiosqlite:///{(TEST_ROOT / 'documind-test.db').as_posix()}"
)
os.environ["DATABASE_ECHO"] = "false"
os.environ["STORAGE_DIR"] = str(TEST_ROOT / "storage")
os.environ["EXTRACTED_DIR"] = str(TEST_ROOT / "extracted")
os.environ["PROCESSING_TEMP_DIR"] = str(TEST_ROOT / "tmp")
os.environ["FAISS_DIR"] = str(TEST_ROOT / "faiss")
os.environ["LOG_DIR"] = str(TEST_ROOT / "logs")
os.environ["LOG_LEVEL"] = "CRITICAL"
os.environ["FRONTEND_URL"] = "http://localhost:3000"
os.environ["DOCUMIND_GEMINI_API_KEY"] = ""

from app.core.config import get_settings
from app.database.base import Base
from app.database.session import engine
from app.main import app


def _cleanup_test_root() -> None:
    shutil.rmtree(TEST_ROOT, ignore_errors=True)


atexit.register(_cleanup_test_root)


@pytest_asyncio.fixture
async def client():
    settings = get_settings()
    shutil.rmtree(settings.storage_dir, ignore_errors=True)
    shutil.rmtree(settings.extracted_dir, ignore_errors=True)
    shutil.rmtree(settings.processing_temp_dir, ignore_errors=True)
    shutil.rmtree(settings.faiss_dir, ignore_errors=True)
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    settings.extracted_dir.mkdir(parents=True, exist_ok=True)
    settings.processing_temp_dir.mkdir(parents=True, exist_ok=True)
    settings.faiss_dir.mkdir(parents=True, exist_ok=True)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)

    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as test_client:
            yield test_client

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
