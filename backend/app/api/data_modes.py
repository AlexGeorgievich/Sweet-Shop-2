from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.dependencies import AdminPrincipal
from app.db.models import DemoGeneration, UserSession
from app.db.session import get_session
from app.schemas.data_modes import (
    DataModeRequest,
    DataModeResponse,
    DemoGenerateRequest,
    DemoSummaryResponse,
)
from app.services.demo_factory import DemoOptions
from app.services.demo_seed import DemoSeedBusyError, seed_demo

router = APIRouter(prefix="/api/v1/admin", tags=["data-modes"])


@router.get("/data-mode", response_model=DataModeResponse)
async def get_data_mode(principal: AdminPrincipal) -> DataModeResponse:
    return DataModeResponse(dataMode=principal.data_mode, canUseDemo=True)


@router.post("/data-mode", response_model=DataModeResponse)
async def set_data_mode(
    payload: DataModeRequest,
    principal: AdminPrincipal,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DataModeResponse:
    stored_session = await session.get(UserSession, principal.session_id)
    if stored_session is None or stored_session.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Сессия недействительна.",
        )
    stored_session.active_data_mode = payload.dataMode.value
    await session.commit()
    return DataModeResponse(dataMode=payload.dataMode, canUseDemo=True)


@router.get("/demo", response_model=DemoSummaryResponse)
async def get_demo_summary(
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
    _principal: AdminPrincipal,
) -> DemoSummaryResponse:
    response.headers["Cache-Control"] = "no-store"
    generation = await session.scalar(
        select(DemoGeneration).order_by(DemoGeneration.generated_at.desc()).limit(1)
    )
    if generation is None:
        raise HTTPException(status_code=404, detail="Демонстрационные данные ещё не созданы.")
    digest = str(generation.summary.get("digest", ""))
    summary = {
        key: int(value)
        for key, value in generation.summary.items()
        if key != "digest"
    }
    return DemoSummaryResponse(
        seed=generation.seed,
        asOf=generation.as_of,
        generatedAt=generation.generated_at,
        count=generation.count,
        digest=digest,
        summary=summary,
    )


@router.post("/demo/generate", response_model=DemoSummaryResponse)
async def generate_demo(
    payload: DemoGenerateRequest,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
    _principal: AdminPrincipal,
) -> DemoSummaryResponse:
    response.headers["Cache-Control"] = "no-store"
    if session.bind is None:
        raise HTTPException(status_code=503, detail="Подключение к базе данных недоступно.")
    factory = async_sessionmaker(bind=session.bind, expire_on_commit=False)
    try:
        report = await seed_demo(
            factory,
            DemoOptions(count=payload.count, seed=payload.seed, as_of=payload.asOf),
        )
    except DemoSeedBusyError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return DemoSummaryResponse(
        seed=report.seed,
        asOf=report.as_of,
        generatedAt=report.generated_at,
        count=report.count,
        digest=report.digest,
        summary=report.summary,
    )
