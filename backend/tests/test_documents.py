from pathlib import Path
from uuid import uuid4

import pymupdf

from app.core.config import get_settings


def _pdf_bytes(
    pages: list[str] | None = None,
    *,
    image_only: bool = False,
    encrypted: bool = False,
) -> bytes:
    document = pymupdf.open()
    page_texts = pages or ["DocuMind PDF test content."]
    for text in page_texts:
        page = document.new_page()
        if image_only:
            pixmap = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 100, 100), False)
            pixmap.clear_with(255)
            page.insert_image(page.rect, pixmap=pixmap)
        else:
            page.insert_textbox(pymupdf.Rect(72, 72, 520, 720), text, fontsize=11)
    options = {}
    if encrypted:
        options = {
            "encryption": pymupdf.PDF_ENCRYPT_AES_256,
            "owner_pw": "owner-password",
            "user_pw": "user-password",
        }
    data = document.tobytes(**options)
    document.close()
    return data


async def _upload(
    client,
    name: str = "sample.txt",
    content: bytes = b"DocuMind backend test content.",
    content_type: str = "text/plain",
):
    return await client.post(
        "/api/v1/documents/upload",
        files={"file": (name, content, content_type)},
    )


async def test_upload_processes_text_and_persists_extracted_content(client):
    response = await _upload(client, "../../sample.txt")
    assert response.status_code == 201
    body = response.json()
    document = body["document"]
    assert body["success"] is True
    assert document["original_filename"] == "sample.txt"
    assert document["file_type"] == "TXT"
    assert document["status"] == "indexed"
    assert document["total_chunks"] == 1
    assert document["processing_state"] == "COMPLETED"
    assert document["metadata"]["checksum_sha256"]
    assert document["metadata"]["extension"] == ".txt"
    assert document["total_characters"] == len(b"DocuMind backend test content.")
    assert body["processing"]["pipeline_status"] == "OPERATIONAL"
    assert "chunked" in body["processing"]["detail"].lower()

    stored_files = list(get_settings().storage_dir.iterdir())
    assert len(stored_files) == 1
    assert stored_files[0].read_bytes() == b"DocuMind backend test content."
    assert (get_settings().extracted_dir / f"{document['id']}.normalized.txt").exists()

    listing = await client.get("/api/v1/documents")
    assert listing.status_code == 200
    assert listing.json()["total"] == 1
    assert listing.json()["items"][0]["id"] == document["id"]

    detail = await client.get(f"/api/v1/documents/{document['id']}")
    assert detail.status_code == 200
    assert detail.json()["filename"] == document["filename"]
    assert detail.json()["processing_state"] == "COMPLETED"


async def test_document_search_and_filters(client):
    await _upload(client, "notes.md", b"# Notes\nTest", "text/markdown")
    await _upload(
        client,
        "report.pdf",
        _pdf_bytes(),
        "application/pdf",
    )

    filtered = await client.get("/api/v1/documents?file_type=PDF")
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1
    assert filtered.json()["items"][0]["file_type"] == "PDF"

    searched = await client.get("/api/v1/documents?search=notes")
    assert searched.status_code == 200
    assert searched.json()["total"] == 1
    assert searched.json()["items"][0]["original_filename"] == "notes.md"

    queued = await client.get("/api/v1/documents?status=queued")
    assert queued.status_code == 200
    assert queued.json()["total"] == 0

    indexed = await client.get("/api/v1/documents?status=indexed")
    assert indexed.status_code == 200
    assert indexed.json()["total"] == 2


async def test_reindex_reprocesses_document(client):
    upload = await _upload(client)
    document_id = upload.json()["document"]["id"]

    response = await client.post(f"/api/v1/documents/{document_id}/reindex")
    assert response.status_code == 202
    body = response.json()
    assert body["processing"]["status"] == "indexed"
    assert body["processing"]["processing_state"] == "COMPLETED"
    assert body["processing"]["pipeline_status"] == "OPERATIONAL"
    assert body["processing"]["total_chunks"] == 1


async def test_delete_removes_database_record_and_stored_files(client):
    upload = await _upload(client)
    document = upload.json()["document"]
    stored_path = Path(get_settings().storage_dir / document["filename"])
    extracted_path = get_settings().extracted_dir / f"{document['id']}.normalized.txt"
    assert stored_path.exists()
    assert extracted_path.exists()

    deleted = await client.delete(f"/api/v1/documents/{document['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["document_id"] == document["id"]
    assert not stored_path.exists()
    assert not extracted_path.exists()

    missing = await client.get(f"/api/v1/documents/{document['id']}")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "RESOURCE_NOT_FOUND"


async def test_upload_validation_rejects_invalid_files(client):
    unsupported = await _upload(client, "malware.exe", b"bad", "application/octet-stream")
    assert unsupported.status_code == 415
    assert unsupported.json()["error"]["code"] == "UNSUPPORTED_FILE_TYPE"

    mismatch = await _upload(client, "report.pdf", b"not a pdf", "text/plain")
    assert mismatch.status_code == 400
    assert mismatch.json()["error"]["code"] == "MIME_TYPE_MISMATCH"

    empty = await _upload(client, "empty.txt", b"", "text/plain")
    assert empty.status_code == 400
    assert empty.json()["error"]["code"] == "FILE_EMPTY"

    whitespace = await _upload(client, "blank.txt", b"   \n\t", "text/plain")
    assert whitespace.status_code == 400
    assert whitespace.json()["error"]["code"] == "FILE_EMPTY"

    binary = await _upload(client, "fake.txt", b"\x89PNG\r\n\x1a\n", "text/plain")
    assert binary.status_code == 400
    assert binary.json()["error"]["code"] == "BINARY_CONTENT_REJECTED"

    traversal = await _upload(client, "../../../safe.txt")
    assert traversal.status_code == 201
    assert traversal.json()["document"]["original_filename"] == "safe.txt"


async def test_duplicate_upload_is_rejected(client):
    first = await _upload(client, "first.txt", b"same content")
    assert first.status_code == 201

    duplicate = await _upload(client, "second.txt", b"same content")
    assert duplicate.status_code == 409
    body = duplicate.json()
    assert body["error"]["code"] == "DUPLICATE_DOCUMENT"
    assert body["error"]["details"]["document_id"] == first.json()["document"]["id"]


async def test_chunks_content_status_reprocess_and_statistics(client):
    markdown = (
        "# Guide\n\n"
        "This introduction contains enough detail to begin the guide.\n\n"
        "## Setup\n\n"
        + ("Install the local dependencies and configure the application. " * 12)
    )
    upload = await _upload(
        client,
        "guide.md",
        markdown.encode("utf-8"),
        "text/markdown",
    )
    assert upload.status_code == 201
    upload_body = upload.json()
    document_id = upload_body["document"]["id"]
    assert upload_body["document"]["total_chunks"] >= 2

    chunks = await client.get(f"/api/v1/documents/{document_id}/chunks")
    assert chunks.status_code == 200
    chunk_body = chunks.json()
    assert chunk_body["total"] == upload_body["document"]["total_chunks"]
    assert chunk_body["items"][0]["content_hash"]
    assert chunk_body["items"][0]["token_count_estimate"] > 0
    first_metadata = chunk_body["items"][0]["metadata"]
    assert first_metadata["document_id"] == document_id
    assert first_metadata["filename"] == "guide.md"
    assert first_metadata["source_type"] == "MD"
    assert any(item["section_title"] == "Setup" for item in chunk_body["items"])
    assert all(item["character_count"] <= 2000 for item in chunk_body["items"])

    content = await client.get(f"/api/v1/documents/{document_id}/content")
    assert content.status_code == 200
    assert "# Guide" in content.json()["content"]
    assert content.json()["truncated"] is False

    status = await client.get(f"/api/v1/documents/{document_id}/status")
    assert status.status_code == 200
    assert status.json()["processing_state"] == "COMPLETED"

    statistics = await client.get("/api/v1/documents/processing/statistics")
    assert statistics.status_code == 200
    stats = statistics.json()
    assert stats["total_documents"] == 1
    assert stats["state_counts"]["COMPLETED"] == 1
    assert stats["total_chunks"] == upload_body["document"]["total_chunks"]
    assert stats["documents_with_chunks"] == 1
    assert stats["pipeline_status"] == "OPERATIONAL"

    reprocess = await client.post(f"/api/v1/documents/{document_id}/reprocess")
    assert reprocess.status_code == 200
    assert reprocess.json()["processing"]["processing_state"] == "COMPLETED"
    assert reprocess.json()["document"]["total_chunks"] == chunk_body["total"]

    after = await client.get(f"/api/v1/documents/{document_id}/chunks")
    assert after.json()["total"] == chunk_body["total"]


async def test_pdf_page_metadata_and_markdown_structure(client):
    first_page = "First page sentence. " * 10
    second_page = "Second page sentence. " * 10
    pdf = await _upload(
        client,
        "multi-page.pdf",
        _pdf_bytes([first_page, second_page]),
        "application/pdf",
    )
    assert pdf.status_code == 201
    pdf_body = pdf.json()["document"]
    assert pdf_body["page_count"] == 2
    assert pdf_body["processing_state"] == "COMPLETED"

    chunks = await client.get(f"/api/v1/documents/{pdf_body['id']}/chunks")
    assert chunks.status_code == 200
    page_numbers = {
        item["page_number"] for item in chunks.json()["items"] if item["page_number"]
    }
    assert page_numbers == {1, 2}

    markdown = await _upload(
        client,
        "structured.md",
        b"# Top\n\nIntro.\n\n## Child\n\nBody text.\n",
        "text/markdown",
    )
    markdown_chunks = await client.get(
        f"/api/v1/documents/{markdown.json()['document']['id']}/chunks"
    )
    setup_chunk = next(
        item
        for item in markdown_chunks.json()["items"]
        if item["section_title"] == "Child"
    )
    assert setup_chunk["section_hierarchy"] == ["Top", "Child"]


async def test_image_only_pdf_requires_ocr(client):
    response = await _upload(
        client,
        "scan.pdf",
        _pdf_bytes(image_only=True),
        "application/pdf",
    )
    assert response.status_code == 201
    body = response.json()
    assert body["document"]["status"] == "failed"
    assert body["processing_state"] == "REQUIRES_OCR"
    assert body["error"]["code"] == "OCR_REQUIRED"
    assert body["page_count"] == 1
    assert any(item["code"] == "OCR_REQUIRED" for item in body["warnings"])

    content = await client.get(f"/api/v1/documents/{body['document']['id']}/content")
    assert content.status_code == 404
    assert content.json()["error"]["code"] == "DOCUMENT_CONTENT_NOT_AVAILABLE"


async def test_corrupt_and_encrypted_pdfs_fail_cleanly(client):
    corrupt = await _upload(
        client,
        "corrupt.pdf",
        b"%PDF-1.4\nnot really a pdf",
        "application/pdf",
    )
    assert corrupt.status_code == 201
    assert corrupt.json()["processing_state"] == "FAILED"
    assert corrupt.json()["error"]["code"] == "CORRUPTED_PDF"

    encrypted = await _upload(
        client,
        "protected.pdf",
        _pdf_bytes(encrypted=True),
        "application/pdf",
    )
    assert encrypted.status_code == 201
    assert encrypted.json()["processing_state"] == "FAILED"
    assert encrypted.json()["error"]["code"] == "ENCRYPTED_PDF"


async def test_unknown_document_returns_consistent_error(client):
    response = await client.get(f"/api/v1/documents/{uuid4()}")
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "RESOURCE_NOT_FOUND"
    assert body["request_id"] == response.headers["X-Request-ID"]
