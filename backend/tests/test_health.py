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
    assert body["next_phase"].startswith("Phase 6")
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
