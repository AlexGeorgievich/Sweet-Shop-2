import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import get_settings
from app.core.http import RequestContextMiddleware


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    get_settings()
    yield


settings = get_settings()
logging.getLogger("sweet_shop.http").setLevel(logging.INFO)
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url="/docs" if settings.app_environment == "local" else None,
    redoc_url="/redoc" if settings.app_environment == "local" else None,
    openapi_url="/openapi.json" if settings.app_environment == "local" else None,
    lifespan=lifespan,
)
app.add_middleware(RequestContextMiddleware)
app.include_router(api_router)
