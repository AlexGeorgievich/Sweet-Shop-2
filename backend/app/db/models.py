from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.enums import OrderStatus, OutboxStatus, TaskStatus

DATA_MODE_TABLES = {
    "audit_log",
    "conversion_events",
    "customers",
    "order_comments",
    "order_status_history",
    "orders",
    "outbox_events",
    "tasks",
}


class DataModeMixin:
    data_mode: Mapped[str] = mapped_column(String(20), default="production", nullable=False)


class Role(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(String(300), default="", nullable=False)


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    role_id: Mapped[UUID] = mapped_column(
        ForeignKey("roles.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UserSession(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "user_sessions"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active_data_mode: Mapped[str] = mapped_column(String(20), default="production", nullable=False)


class Customer(DataModeMixin, UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "customers"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone_normalized: Mapped[str] = mapped_column(String(20), nullable=False)
    phone_display: Mapped[str] = mapped_column(String(40), nullable=False)
    telegram_id: Mapped[str | None] = mapped_column(String(40), unique=True)
    email: Mapped[str | None] = mapped_column(String(320))
    preferred_channel: Mapped[str] = mapped_column(String(30), default="phone", nullable=False)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    __table_args__ = (
        CheckConstraint("data_mode IN ('production','demo')", name="data_mode"),
        UniqueConstraint(
            "data_mode",
            "phone_normalized",
            name="uq_customers_data_mode_phone_normalized",
        ),
        CheckConstraint(
            "preferred_channel IN ('phone', 'telegram', 'whatsapp', 'email')",
            name="preferred_channel",
        ),
        Index(
            "ix_customers_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
    )


class Order(DataModeMixin, UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "orders"

    number: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(100), unique=True)
    request_fingerprint: Mapped[str | None] = mapped_column(String(64))
    customer_id: Mapped[UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    assignee_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    dessert: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    event_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    guests: Mapped[int] = mapped_column(Integer, nullable=False)
    details: Mapped[str] = mapped_column(Text, default="", nullable=False)
    prize: Mapped[str] = mapped_column(String(160), default="", nullable=False)
    consultant_summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    source: Mapped[str] = mapped_column(String(80), default="website", nullable=False, index=True)
    amount_kopecks: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="RUB", nullable=False)
    status: Mapped[str] = mapped_column(
        String(30),
        default=OrderStatus.NEW.value,
        nullable=False,
        index=True,
    )
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    weight_grams: Mapped[int | None] = mapped_column(Integer)
    decor: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    customer_type: Mapped[str] = mapped_column(String(20), default="new", nullable=False)
    telegram_delivered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    telegram_delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    telegram_last_error: Mapped[str] = mapped_column(Text, default="", nullable=False)

    __table_args__ = (
        CheckConstraint("data_mode IN ('production','demo')", name="data_mode"),
        CheckConstraint("guests BETWEEN 1 AND 500", name="guests_range"),
        CheckConstraint("amount_kopecks IS NULL OR amount_kopecks >= 0", name="amount_nonnegative"),
        CheckConstraint("priority BETWEEN 0 AND 3", name="priority_range"),
        CheckConstraint("version > 0", name="version_positive"),
        CheckConstraint("weight_grams IS NULL OR weight_grams > 0", name="weight_positive"),
        CheckConstraint("customer_type IN ('new','repeat')", name="customer_type"),
        CheckConstraint(
            "status IN ('new','assigned','contacted','qualified','calculation','approval',"
            "'awaiting_payment','paid','production','ready','completed','lost')",
            name="valid_status",
        ),
        Index("ix_orders_status_created_at", "status", "created_at"),
        Index("ix_orders_assignee_status", "assignee_id", "status"),
    )


class OrderStatusHistory(DataModeMixin, UUIDPrimaryKeyMixin, Base):
    __tablename__ = "order_status_history"

    order_id: Mapped[UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    from_status: Mapped[str | None] = mapped_column(String(30))
    to_status: Mapped[str] = mapped_column(String(30), nullable=False)
    reason: Mapped[str] = mapped_column(String(160), default="", nullable=False)
    comment: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        CheckConstraint("data_mode IN ('production','demo')", name="data_mode"),
        Index("ix_order_status_history_order_created", "order_id", "created_at"),
    )


class OrderComment(DataModeMixin, UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "order_comments"

    order_id: Mapped[UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    __table_args__ = (CheckConstraint("data_mode IN ('production','demo')", name="data_mode"),)


class Task(DataModeMixin, UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tasks"

    order_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    customer_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"),
        index=True,
    )
    assignee_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        default=TaskStatus.OPEN.value,
        nullable=False,
        index=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("data_mode IN ('production','demo')", name="data_mode"),
        CheckConstraint("order_id IS NOT NULL OR customer_id IS NOT NULL", name="subject_required"),
        CheckConstraint("priority BETWEEN 0 AND 3", name="priority_range"),
        CheckConstraint("status IN ('open','done','cancelled')", name="valid_status"),
    )


class OutboxEvent(DataModeMixin, UUIDPrimaryKeyMixin, Base):
    __tablename__ = "outbox_events"

    topic: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    aggregate_type: Mapped[str] = mapped_column(String(60), nullable=False)
    aggregate_id: Mapped[UUID] = mapped_column(nullable=False, index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        default=OutboxStatus.PENDING.value,
        nullable=False,
        index=True,
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    available_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        CheckConstraint("data_mode IN ('production','demo')", name="data_mode"),
        CheckConstraint("attempts >= 0", name="attempts_nonnegative"),
        CheckConstraint(
            "status IN ('pending','processing','delivered','dead')",
            name="valid_status",
        ),
        Index("ix_outbox_events_dispatch", "status", "available_at"),
    )


class AuditLog(DataModeMixin, UUIDPrimaryKeyMixin, Base):
    __tablename__ = "audit_log"

    actor_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[UUID | None] = mapped_column(index=True)
    request_id: Mapped[str | None] = mapped_column(String(80), index=True)
    changes: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    __table_args__ = (CheckConstraint("data_mode IN ('production','demo')", name="data_mode"),)


class ConversionEvent(DataModeMixin, UUIDPrimaryKeyMixin, Base):
    __tablename__ = "conversion_events"
    __table_args__ = (
        CheckConstraint("data_mode IN ('production','demo')", name="data_mode"),
        UniqueConstraint(
            "data_mode",
            "visitor_id",
            "event_id",
            name="uq_conversion_data_mode_visitor_event",
        ),
        Index("ix_conversion_events_name_created", "name", "created_at"),
    )

    event_id: Mapped[str] = mapped_column(String(80), nullable=False)
    visitor_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    order_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    source: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    campaign: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    properties: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DemoGeneration(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "demo_generations"

    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    as_of: Mapped[date] = mapped_column(Date, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False)
    summary: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
