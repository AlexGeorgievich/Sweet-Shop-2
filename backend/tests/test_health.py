import httpx
import pytest

from app.api import health
from app.main import app

pytestmark = pytest.mark.asyncio


async def get(path: str) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def test_live_reports_process_health() -> None:
    response = await get("/health/live")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["database"] == "not_checked"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["x-request-id"]


async def test_valid_request_id_is_preserved() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health/live", headers={"X-Request-ID": "release-check-123"})
    assert response.headers["x-request-id"] == "release-check-123"


async def test_ready_reports_database_health(monkeypatch) -> None:
    async def available() -> bool:
        return True

    monkeypatch.setattr(health, "database_is_ready", available)
    response = await get("/health/ready")

    assert response.status_code == 200
    assert response.json()["database"] == "ready"


async def test_ready_rejects_unavailable_database(monkeypatch) -> None:
    async def unavailable() -> bool:
        return False

    monkeypatch.setattr(health, "database_is_ready", unavailable)
    response = await get("/health/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "unavailable"
