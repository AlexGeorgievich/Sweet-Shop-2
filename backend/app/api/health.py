from typing import Literal

import psycopg
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.config import get_settings

router = APIRouter(prefix="/health", tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok", "unavailable"]
    service: str
    version: str
    database: Literal["not_checked", "ready", "unavailable"]


async def database_is_ready() -> bool:
    settings = get_settings()
    try:
        connection = await psycopg.AsyncConnection.connect(
            settings.psycopg_database_url,
            connect_timeout=2,
        )
        async with connection:
            await connection.execute("SELECT 1")
        return True
    except psycopg.Error:
        return False


@router.get("/live", response_model=HealthResponse)
async def live() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        database="not_checked",
    )


@router.get("/ready", response_model=HealthResponse)
async def ready() -> HealthResponse | JSONResponse:
    settings = get_settings()
    if not await database_is_ready():
        content = HealthResponse(
            status="unavailable",
            service=settings.app_name,
            version=settings.app_version,
            database="unavailable",
        ).model_dump()
        return JSONResponse(status_code=503, content=content)

    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        database="ready",
    )
