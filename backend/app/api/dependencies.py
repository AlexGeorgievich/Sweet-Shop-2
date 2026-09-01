from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.services.auth import Principal, principal_for_token


async def require_user(
    session: Annotated[AsyncSession, Depends(get_session)],
    session_token: Annotated[str | None, Cookie(alias="sweet_shop_session")] = None,
) -> Principal:
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Требуется вход.")
    principal = await principal_for_token(session, session_token)
    if principal is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Сессия недействительна.",
        )
    return principal


CurrentPrincipal = Annotated[Principal, Depends(require_user)]


async def require_crm_write(principal: CurrentPrincipal) -> Principal:
    if principal.role not in {"admin", "lead", "manager"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для изменения заявки.",
        )
    return principal


CrmWritePrincipal = Annotated[Principal, Depends(require_crm_write)]


async def require_admin(principal: CurrentPrincipal) -> Principal:
    if principal.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Требуются права администратора."
        )
    return principal


AdminPrincipal = Annotated[Principal, Depends(require_admin)]


async def require_lead(principal: CurrentPrincipal) -> Principal:
    if principal.role not in {"admin", "lead"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Требуются права руководителя."
        )
    return principal


LeadPrincipal = Annotated[Principal, Depends(require_lead)]
