import time
from collections import defaultdict, deque
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import CurrentPrincipal
from app.core.config import get_settings
from app.db.session import get_session
from app.schemas.auth import CurrentUser, LoginRequest
from app.services.auth import (
    authenticate,
    create_session,
    principal_for_token,
    revoke_session,
)

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])
login_failures: dict[str, deque[float]] = defaultdict(deque)


def check_login_limit(email: str, maximum: int, window: int) -> None:
    now = time.monotonic()
    attempts = login_failures[email.strip().lower()]
    while attempts and attempts[0] <= now - window:
        attempts.popleft()
    if len(attempts) >= maximum:
        raise HTTPException(
            status_code=429,
            detail="Слишком много попыток. Повторите позже.",
            headers={"Retry-After": str(window)},
        )


def record_login_failure(email: str) -> None:
    login_failures[email.strip().lower()].append(time.monotonic())


@router.post("/login", response_model=CurrentUser)
async def login(
    payload: LoginRequest,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CurrentUser:
    settings = get_settings()
    check_login_limit(
        str(payload.email), settings.login_max_attempts, settings.login_window_seconds
    )
    user = await authenticate(session, payload.email, payload.password)
    if user is None:
        record_login_failure(str(payload.email))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль.",
        )
    token = await create_session(session, user, settings.session_hours)
    login_failures.pop(str(payload.email).strip().lower(), None)
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_hours * 3600,
        httponly=True,
        secure=settings.app_environment != "local",
        samesite="strict",
        path="/",
    )
    principal = await principal_for_token(session, token)
    if principal is None:
        raise RuntimeError("New session could not be loaded.")
    return CurrentUser(
        id=str(principal.id),
        email=principal.email,
        fullName=principal.full_name,
        role=principal.role,
        dataMode=principal.data_mode,
    )


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
    token: Annotated[str | None, Cookie(alias="sweet_shop_session")] = None,
) -> None:
    settings = get_settings()
    if token:
        await revoke_session(session, token)
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        secure=settings.app_environment != "local",
        httponly=True,
        samesite="strict",
    )


@router.get("/me", response_model=CurrentUser)
async def me(principal: CurrentPrincipal) -> CurrentUser:
    return CurrentUser(
        id=str(principal.id),
        email=principal.email,
        fullName=principal.full_name,
        role=principal.role,
        dataMode=principal.data_mode,
    )
