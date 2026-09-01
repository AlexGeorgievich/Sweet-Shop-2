from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.schemas.orders import OrderCreated, parse_order
from app.services.orders import IdempotencyConflictError, create_order, create_order_number

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])


@router.post("", response_model=OrderCreated, status_code=201)
async def post_order(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> OrderCreated | JSONResponse:
    try:
        payload: Any = await request.json()
    except ValueError:
        return JSONResponse(
            status_code=400, content={"error": "Не удалось прочитать данные заявки."}
        )

    if isinstance(payload, dict) and str(payload.get("website", "")).strip():
        return OrderCreated(orderId=create_order_number(), notificationQueued=False)

    order, fields = parse_order(payload)
    if order is None:
        return JSONResponse(
            status_code=400,
            content={"error": "Проверьте обязательные поля заявки.", "fields": fields},
        )

    key = (idempotency_key or f"server-{uuid4()}").strip()[:100]
    if not key:
        return JSONResponse(status_code=400, content={"error": "Некорректный ключ отправки."})

    try:
        created = await create_order(session, order, key)
    except IdempotencyConflictError:
        return JSONResponse(
            status_code=409,
            content={"error": "Этот ключ отправки уже использован для другой заявки."},
        )

    return OrderCreated(orderId=created.number)
