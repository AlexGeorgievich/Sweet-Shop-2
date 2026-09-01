import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import DataMode, OrderStatus
from app.db.models import Customer, Order, OrderStatusHistory
from app.schemas.orders import normalize_phone

STATUS_MAP = {
    "new": OrderStatus.NEW.value,
    "contacted": OrderStatus.CONTACTED.value,
    "agreement": OrderStatus.APPROVAL.value,
    "paid": OrderStatus.PAID.value,
    "rejected": OrderStatus.LOST.value,
}
PRODUCTION = DataMode.PRODUCTION.value


@dataclass
class ImportReport:
    discovered: int = 0
    imported: int = 0
    skipped: int = 0
    invalid: int = 0
    errors: list[str] = field(default_factory=list)


def parse_datetime(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ValueError("timestamp is missing")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def read_records(directory: Path) -> tuple[list[dict[str, Any]], ImportReport]:
    report = ImportReport()
    records: list[dict[str, Any]] = []
    for path in sorted(directory.glob("SI-*.json")):
        report.discovered += 1
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("root must be an object")
            payload["_source_file"] = path.name
            records.append(payload)
        except (OSError, ValueError) as error:
            report.invalid += 1
            report.errors.append(f"{path.name}: {error}")
    return records, report


async def import_records(
    session: AsyncSession,
    records: list[dict[str, Any]],
    report: ImportReport,
    *,
    dry_run: bool,
) -> ImportReport:
    for record in records:
        number = record.get("id")
        try:
            if not isinstance(number, str) or not number.startswith("SI-"):
                raise ValueError("invalid order id")
            if await session.scalar(
                select(Order.id).where(
                    Order.number == number,
                    Order.data_mode == PRODUCTION,
                )
            ):
                report.skipped += 1
                continue
            phone_display = str(record.get("phone", "")).strip()
            phone = normalize_phone(phone_display)
            if len(phone) < 11:
                raise ValueError("invalid phone")
            created_at = parse_datetime(record.get("createdAt"))
            updated_at = parse_datetime(record.get("updatedAt", record.get("createdAt")))
            event_date = date.fromisoformat(str(record.get("eventDate")))
            guests = int(record.get("guests", 1))
            if guests < 1 or guests > 500:
                raise ValueError("guests must be between 1 and 500")
            amount_rub = record.get("amountRub")
            amount_kopecks = int(float(amount_rub) * 100) if amount_rub is not None else None
            weight_kg = record.get("weightKg")
            weight_grams = int(float(weight_kg) * 1000) if weight_kg else None
            first_response = record.get("firstResponseAt")
            first_response_at = parse_datetime(first_response) if first_response else None
            telegram = record.get("telegram") if isinstance(record.get("telegram"), dict) else {}
            telegram_delivered_at = (
                parse_datetime(telegram.get("deliveredAt")) if telegram.get("deliveredAt") else None
            )
            customer = await session.scalar(
                select(Customer).where(
                    Customer.phone_normalized == phone,
                    Customer.data_mode == PRODUCTION,
                )
            )
            if customer is None:
                customer = Customer(
                    name=str(record.get("name", "")).strip() or "Без имени",
                    phone_normalized=phone,
                    phone_display=phone_display,
                    consent_at=created_at,
                    data_mode=PRODUCTION,
                )
                session.add(customer)
                await session.flush()
            raw = json.dumps(record, ensure_ascii=False, sort_keys=True, default=str)
            order = Order(
                number=number,
                idempotency_key=f"legacy:{number}",
                request_fingerprint=hashlib.sha256(raw.encode()).hexdigest(),
                customer_id=customer.id,
                dessert=str(record.get("dessert", "")).strip() or "Не указан",
                event_date=event_date,
                guests=guests,
                details=str(record.get("details", "")),
                prize=str(record.get("prize", "")),
                consultant_summary=str(record.get("consultantSummary", "")),
                source=str(record.get("source", "legacy_json")),
                amount_kopecks=amount_kopecks,
                status=STATUS_MAP.get(str(record.get("status")), OrderStatus.NEW.value),
                first_response_at=first_response_at,
                weight_grams=weight_grams,
                decor=str(record.get("decor", "")),
                customer_type=("repeat" if record.get("customerType") == "repeat" else "new"),
                telegram_delivered=bool(telegram.get("delivered", False)),
                telegram_delivered_at=telegram_delivered_at,
                telegram_last_error=str(telegram.get("lastError") or ""),
                created_at=created_at,
                updated_at=updated_at,
                data_mode=PRODUCTION,
            )
            session.add(order)
            await session.flush()
            session.add(
                OrderStatusHistory(
                    order_id=order.id,
                    from_status=None,
                    to_status=order.status,
                    reason="legacy_json_import",
                    comment=str(record.get("_source_file", "")),
                    created_at=created_at,
                    data_mode=PRODUCTION,
                )
            )
            report.imported += 1
        except (TypeError, ValueError) as error:
            report.invalid += 1
            report.errors.append(f"{record.get('_source_file', number)}: {error}")

    if dry_run:
        await session.rollback()
    else:
        await session.commit()
    return report
