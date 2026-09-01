import hashlib
import json
import secrets
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utc_now
from app.db.enums import DataMode, OrderStatus
from app.db.models import Customer, Order, OrderStatusHistory, OutboxEvent
from app.schemas.orders import OrderCreate, normalize_phone

MOSCOW = ZoneInfo("Europe/Moscow")
PRODUCTION = DataMode.PRODUCTION.value


class IdempotencyConflictError(Exception):
    pass


@dataclass(frozen=True)
class CreatedOrder:
    number: str
    duplicate: bool


def request_fingerprint(data: OrderCreate) -> str:
    canonical = json.dumps(
        data.model_dump(mode="json", by_alias=True),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def create_order_number(now: datetime | None = None) -> str:
    local_now = (now or utc_now()).astimezone(MOSCOW)
    return f"SI-{local_now:%Y%m%d}-{secrets.token_hex(3).upper()}"


async def existing_order(session: AsyncSession, key: str) -> Order | None:
    return await session.scalar(
        select(Order).where(
            Order.idempotency_key == key,
            Order.data_mode == PRODUCTION,
        )
    )


async def create_order(
    session: AsyncSession,
    data: OrderCreate,
    idempotency_key: str,
) -> CreatedOrder:
    fingerprint = request_fingerprint(data)
    duplicate = await existing_order(session, idempotency_key)
    if duplicate:
        if duplicate.request_fingerprint != fingerprint:
            raise IdempotencyConflictError
        return CreatedOrder(number=duplicate.number, duplicate=True)

    now = utc_now()
    phone = normalize_phone(data.phone)
    customer = await session.scalar(
        select(Customer).where(
            Customer.phone_normalized == phone,
            Customer.data_mode == PRODUCTION,
        )
    )
    if customer is None:
        customer = Customer(
            name=data.name,
            phone_normalized=phone,
            phone_display=data.phone,
            consent_at=now,
            data_mode=PRODUCTION,
        )
        session.add(customer)
        await session.flush()
    else:
        customer.name = data.name
        customer.phone_display = data.phone
        customer.consent_at = customer.consent_at or now

    order = Order(
        number=create_order_number(now),
        idempotency_key=idempotency_key,
        request_fingerprint=fingerprint,
        customer_id=customer.id,
        dessert=data.dessert,
        event_date=data.event_date,
        guests=data.guests,
        details=data.details,
        prize=data.prize,
        consultant_summary=data.consultant_summary,
        source="Сайт · колесо подарков" if data.prize else "Сайт · форма заявки",
        status=OrderStatus.NEW.value,
        data_mode=PRODUCTION,
    )
    session.add(order)
    await session.flush()
    session.add(
        OrderStatusHistory(
            order_id=order.id,
            from_status=None,
            to_status=OrderStatus.NEW.value,
            reason="order_created",
            created_at=now,
            data_mode=PRODUCTION,
        )
    )
    session.add(
        OutboxEvent(
            topic="telegram.order.created",
            aggregate_type="order",
            aggregate_id=order.id,
            payload={"order_id": str(order.id), "order_number": order.number},
            available_at=now,
            created_at=now,
            data_mode=PRODUCTION,
        )
    )

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        duplicate = await existing_order(session, idempotency_key)
        if duplicate and duplicate.request_fingerprint == fingerprint:
            return CreatedOrder(number=duplicate.number, duplicate=True)
        raise

    return CreatedOrder(number=order.number, duplicate=False)
