async def test_unknown_route_uses_consistent_error_contract(client):
    response = await client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "RESOURCE_NOT_FOUND"
    assert body["request_id"] == response.headers["X-Request-ID"]


async def test_method_not_allowed_uses_consistent_error_contract(client):
    response = await client.delete("/api/v1/health")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "METHOD_NOT_ALLOWED"


async def test_request_validation_returns_structured_details(client):
    response = await client.post("/api/v1/chat/query", json={})
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert isinstance(body["error"]["details"], list)
    assert body["error"]["details"][0]["field"]
    assert body["error"]["details"][0]["message"]


async def test_root_reports_service_metadata(client):
    response = await client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "DocuMind AI API"
    assert body["api"] == "/api/v1"
    assert body["docs"] == "/docs"
