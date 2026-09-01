from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import CrmWritePrincipal, CurrentPrincipal
from app.db.session import get_session
from app.services.crm import LEGACY_TO_MODERN, list_legacy_orders, update_legacy_status

router = APIRouter(prefix="/api/v1/crm/orders", tags=["crm-compatibility"])


@router.get("")
async def get_orders(
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    return {"orders": await list_legacy_orders(session, principal.data_mode)}


@router.patch("", response_model=None)
async def patch_order(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: CrmWritePrincipal,
) -> dict[str, Any] | JSONResponse:
    try:
        payload = await request.json()
    except ValueError:
        return JSONResponse(
            status_code=400,
            content={"error": "Не удалось прочитать изменение статуса."},
        )
    number = payload.get("id") if isinstance(payload, dict) else None
    status = payload.get("status") if isinstance(payload, dict) else None
    if not isinstance(number, str) or status not in LEGACY_TO_MODERN:
        return JSONResponse(
            status_code=400,
            content={"error": "Укажите корректные номер заявки и статус."},
        )
    order = await update_legacy_status(session, number, status, principal.data_mode)
    if order is None:
        return JSONResponse(status_code=404, content={"error": "Заявка не найдена."})
    return {"order": order}
