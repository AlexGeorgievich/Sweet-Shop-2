from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utc_now
from app.db.enums import OrderStatus
from app.db.models import Customer, Order, OrderStatusHistory

LEGACY_TO_MODERN = {
    "new": OrderStatus.NEW.value,
    "contacted": OrderStatus.CONTACTED.value,
    "agreement": OrderStatus.APPROVAL.value,
    "paid": OrderStatus.PAID.value,
    "rejected": OrderStatus.LOST.value,
}


def aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def legacy_status(status: str) -> str:
    if status in {"new", "assigned"}:
        return "new"
    if status in {"contacted", "qualified"}:
        return "contacted"
    if status in {"calculation", "approval", "awaiting_payment"}:
        return "agreement"
    if status in {"paid", "production", "ready", "completed"}:
        return "paid"
    return "rejected"


def amount_label(order: Order) -> str:
    if order.amount_kopecks is None:
        return "по расчёту менеджера"
    return f"{order.amount_kopecks // 100:,} ₽".replace(",", " ")


def legacy_order(order: Order, customer: Customer) -> dict[str, Any]:
    response_minutes = None
    if order.first_response_at:
        response_minutes = max(
            0,
            round(
                (aware(order.first_response_at).timestamp() - aware(order.created_at).timestamp())
                / 60
            ),
        )
    return {
        "id": order.number,
        "createdAt": order.created_at.isoformat(),
        "updatedAt": order.updated_at.isoformat(),
        "name": customer.name,
        "phone": customer.phone_display,
        "dessert": order.dessert,
        "eventDate": order.event_date.isoformat(),
        "guests": order.guests,
        "details": order.details,
        "prize": order.prize,
        "consultantSummary": order.consultant_summary,
        "source": order.source,
        "amountLabel": amount_label(order),
        "amountRub": order.amount_kopecks // 100 if order.amount_kopecks is not None else None,
        "weightKg": order.weight_grams / 1000 if order.weight_grams else None,
        "decor": order.decor or None,
        "customerType": order.customer_type,
        "firstResponseAt": order.first_response_at.isoformat() if order.first_response_at else None,
        "responseMinutes": response_minutes,
        "status": legacy_status(order.status),
        "telegram": {
            "delivered": order.telegram_delivered,
            "deliveredAt": (
                order.telegram_delivered_at.isoformat() if order.telegram_delivered_at else None
            ),
            "lastError": order.telegram_last_error or None,
        },
    }


async def list_legacy_orders(
    session: AsyncSession,
    data_mode: str,
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            select(Order, Customer)
            .join(Customer, Customer.id == Order.customer_id)
            .where(Order.data_mode == data_mode, Customer.data_mode == data_mode)
            .order_by(Order.created_at.desc())
        )
    ).all()
    return [legacy_order(order, customer) for order, customer in rows]


async def update_legacy_status(
    session: AsyncSession,
    number: str,
    status: str,
    data_mode: str,
) -> dict[str, Any] | None:
    row = (
        await session.execute(
            select(Order, Customer)
            .join(Customer, Customer.id == Order.customer_id)
            .where(
                Order.number == number,
                Order.data_mode == data_mode,
                Customer.data_mode == data_mode,
            )
        )
    ).one_or_none()
    if row is None:
        return None
    order, customer = row
    previous = order.status
    order.status = LEGACY_TO_MODERN[status]
    order.version += 1
    order.updated_at = utc_now()
    if status == "contacted" and order.first_response_at is None:
        order.first_response_at = utc_now()
    session.add(
        OrderStatusHistory(
            order_id=order.id,
            from_status=previous,
            to_status=order.status,
            reason="legacy_crm_update",
            created_at=utc_now(),
            data_mode=data_mode,
        )
    )
    await session.commit()
    return legacy_order(order, customer)
