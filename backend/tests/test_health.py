async def test_health_endpoints_report_real_component_state(client):
    health = await client.get("/api/v1/health")
    assert health.status_code == 200
    health_body = health.json()
    assert health_body["success"] is True
    assert health_body["status"] == "ok"
    assert health_body["environment"] == "testing"
    components = {item["name"]: item for item in health_body["components"]}
    assert components["api"]["status"] == "OPERATIONAL"
    assert components["database"]["status"] == "OPERATIONAL"
    assert components["gemini"]["status"] == "NOT_CONFIGURED"
    assert components["vector_index"]["status"] == "NOT_CONFIGURED"
    assert components["orchestration"]["status"] == "NOT_CONFIGURED"

    live = await client.get("/api/v1/health/live")
    assert live.status_code == 200
    assert live.json()["status"] == "alive"

    ready = await client.get("/api/v1/health/ready")
    assert ready.status_code == 200
    assert ready.json()["status"] == "ready"


async def test_system_status_exposes_integration_boundaries(client):
    response = await client.get("/api/v1/system/status")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "operational"
    assert body["next_phase"] == (
        "Production authentication, authorization, and durable storage verification."
    )
    components = {item["name"]: item for item in body["components"]}
    assert components["document_pipeline"]["status"] == "OPERATIONAL"
    assert components["embeddings"]["status"] == "NOT_CONFIGURED"
    assert components["gemini"]["detail"].startswith(
        "DOCUMIND_GEMINI_API_KEY is not configured"
    )


async def test_request_id_and_cors_are_applied(client):
    response = await client.get(
        "/api/v1/health",
        headers={"X-Request-ID": "test-request-id"},
    )
    assert response.headers["X-Request-ID"] == "test-request-id"

    preflight = await client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == (
        "http://localhost:3000"
    )


def test_cors_origins_accept_comma_separated_production_origins():
    from app.core.config import Settings

    settings = Settings(
        _env_file=None,
        FRONTEND_URL="http://localhost:3000",
        CORS_ORIGINS=(
            "https://nexamind-web.onrender.com, https://app.example.com/"
        ),
    )

    assert settings.cors_origins == [
        "https://nexamind-web.onrender.com",
        "https://app.example.com",
    ]


async def test_cors_allows_configured_frontend_origins(monkeypatch):
    from httpx import ASGITransport, AsyncClient

    from app.core.config import Settings
    from app.main import create_app

    settings = Settings(
        _env_file=None,
        cors_origins_raw=(
            "https://nexamind-web.onrender.com,https://app.example.com"
        ),
    )
    monkeypatch.setattr("app.main.settings", settings)
    application = create_app()

    async with AsyncClient(
        transport=ASGITransport(app=application),
        base_url="http://testserver",
    ) as test_client:
        for origin in settings.cors_origins:
            response = await test_client.options(
                "/api/v1/health",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "GET",
                },
            )
            assert response.status_code == 200
            assert response.headers["access-control-allow-origin"] == origin


def test_gemini_generation_is_not_ready_until_verified():
    from pydantic import SecretStr

    from app.core.config import Settings
    from app.schemas.common import IntegrationStatus
    from app.services.provider_health import (
        record_generation_failure,
        record_generation_success,
        reset_generation_health,
    )
    from app.services.system_service import SystemService

    settings = Settings(
        _env_file=None,
        documind_gemini_api_key=SecretStr("test-key"),
    )
    service = SystemService(settings)
    reset_generation_health()
    try:
        assert (
            service._gemini_component(True)[0]
            == IntegrationStatus.AWAITING_INTEGRATION
        )

        record_generation_failure("gemini-3.6-flash", "GEMINI_UNAVAILABLE")
        status, detail = service._gemini_component(True)
        assert status == IntegrationStatus.DEGRADED
        assert "GEMINI_UNAVAILABLE" in detail

        record_generation_success("gemini-3.6-flash")
        assert (
            service._gemini_component(True)[0]
            == IntegrationStatus.OPERATIONAL
        )
    finally:
        reset_generation_health()


def test_empty_faiss_index_is_awaiting_integration(tmp_path):
    from pydantic import SecretStr

    from app.core.config import Settings
    from app.schemas.common import IntegrationStatus
    from app.services.system_service import SystemService
    from app.services.vector_index_service import VectorIndexService

    settings = Settings(
        _env_file=None,
        documind_gemini_api_key=SecretStr("test-key"),
        faiss_dir=tmp_path / "faiss",
    )
    snapshot = VectorIndexService(settings).rebuild([])

    status, detail = SystemService(settings)._vector_index_component(snapshot)

    assert status == IntegrationStatus.AWAITING_INTEGRATION
    assert "empty" in detail.lower()


async def test_openapi_contains_all_required_routes(client):
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    expected = {
        "/api/v1/health",
        "/api/v1/health/ready",
        "/api/v1/health/live",
        "/api/v1/documents/upload",
        "/api/v1/documents",
        "/api/v1/documents/{document_id}",
        "/api/v1/documents/{document_id}/reindex",
        "/api/v1/chat/query",
        "/api/v1/chat/stream",
        "/api/v1/chat/conversations",
        "/api/v1/chat/conversations/{conversation_id}",
        "/api/v1/analytics/dashboard",
        "/api/v1/analytics/retrieval",
        "/api/v1/analytics/documents",
        "/api/v1/system/status",
    }
    assert expected.issubset(paths.keys())
