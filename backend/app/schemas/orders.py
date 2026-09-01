import re
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.domain.catalog import DESSERTS

MOSCOW = ZoneInfo("Europe/Moscow")

FIELD_MESSAGES = {
    "name": "Укажите имя — минимум 2 символа.",
    "phone": "Введите телефон полностью, например +7 927 000-00-00.",
    "dessert": "Выберите десерт из каталога.",
    "date": "Выберите сегодняшнюю или будущую дату.",
    "guests": "Укажите количество гостей от 1 до 500.",
    "details": "Напишите коротко о начинке или оформлении.",
    "consent": "Подтвердите согласие на обработку данных.",
}


class OrderCreate(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=8, max_length=30)
    dessert: str = Field(max_length=80)
    event_date: date = Field(alias="date")
    guests: int = Field(ge=1, le=500)
    details: str = Field(min_length=3, max_length=1_000)
    consent: bool
    consultant_summary: str = Field(default="", alias="consultantSummary", max_length=1_200)
    prize: str = Field(default="", max_length=100)
    website: str = Field(default="", max_length=200)

    @field_validator("phone")
    @classmethod
    def valid_phone(cls, value: str) -> str:
        if not re.fullmatch(r"[+\d][\d\s()\-]{7,29}", value):
            raise ValueError("invalid phone")
        return value

    @field_validator("dessert")
    @classmethod
    def known_dessert(cls, value: str) -> str:
        if value not in DESSERTS:
            raise ValueError("unknown dessert")
        return value

    @field_validator("event_date")
    @classmethod
    def future_event(cls, value: date) -> date:
        if value < datetime.now(MOSCOW).date():
            raise ValueError("past event")
        return value

    @field_validator("consent")
    @classmethod
    def consent_required(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("consent required")
        return value


def parse_order(payload: Any) -> tuple[OrderCreate | None, dict[str, str]]:
    try:
        return OrderCreate.model_validate(payload), {}
    except ValidationError as error:
        fields: dict[str, str] = {}
        for issue in error.errors():
            field = str(issue["loc"][0]) if issue["loc"] else ""
            public_field = "date" if field == "event_date" else field
            if public_field in FIELD_MESSAGES:
                fields[public_field] = FIELD_MESSAGES[public_field]
        return None, fields


def normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) == 11 and digits.startswith("8"):
        digits = f"7{digits[1:]}"
    elif len(digits) == 10:
        digits = f"7{digits}"
    return f"+{digits}"


class OrderCreated(BaseModel):
    ok: bool = True
    orderId: str
    notificationDelivered: bool = False
    notificationQueued: bool = True
