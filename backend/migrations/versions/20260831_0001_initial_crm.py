"""Initial CRM schema.

Revision ID: 20260831_0001
Revises:
Create Date: 2026-08-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260831_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "roles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("description", sa.String(300), nullable=False),
        *timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_roles"),
        sa.UniqueConstraint("name", name="uq_roles_name"),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        *timestamps(),
        sa.ForeignKeyConstraint(
            ["role_id"], ["roles.id"], name="fk_users_role_id_roles", ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_role_id", "users", ["role_id"])
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_user_sessions_user_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_user_sessions"),
        sa.UniqueConstraint("token_hash", name="uq_user_sessions_token_hash"),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_expires_at", "user_sessions", ["expires_at"])
    op.create_table(
        "customers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("phone_normalized", sa.String(20), nullable=False),
        sa.Column("phone_display", sa.String(40), nullable=False),
        sa.Column("telegram_id", sa.String(40)),
        sa.Column("email", sa.String(320)),
        sa.Column("preferred_channel", sa.String(30), nullable=False),
        sa.Column("consent_at", sa.DateTime(timezone=True)),
        sa.Column("tags", sa.JSON(), nullable=False),
        *timestamps(),
        sa.CheckConstraint(
            "preferred_channel IN ('phone', 'telegram', 'whatsapp', 'email')",
            name="ck_customers_preferred_channel",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_customers"),
        sa.UniqueConstraint("phone_normalized", name="uq_customers_phone_normalized"),
        sa.UniqueConstraint("telegram_id", name="uq_customers_telegram_id"),
    )
    op.create_index(
        "ix_customers_name_trgm",
        "customers",
        ["name"],
        postgresql_using="gin",
        postgresql_ops={"name": "gin_trgm_ops"},
    )
    op.create_table(
        "orders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("number", sa.String(40), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("assignee_id", sa.Uuid()),
        sa.Column("dessert", sa.String(120), nullable=False),
        sa.Column("event_date", sa.Date(), nullable=False),
        sa.Column("guests", sa.Integer(), nullable=False),
        sa.Column("details", sa.Text(), nullable=False),
        sa.Column("prize", sa.String(160), nullable=False),
        sa.Column("consultant_summary", sa.Text(), nullable=False),
        sa.Column("source", sa.String(80), nullable=False),
        sa.Column("amount_kopecks", sa.Integer()),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("first_response_at", sa.DateTime(timezone=True)),
        *timestamps(),
        sa.CheckConstraint("guests BETWEEN 1 AND 500", name="ck_orders_guests_range"),
        sa.CheckConstraint(
            "amount_kopecks IS NULL OR amount_kopecks >= 0", name="ck_orders_amount_nonnegative"
        ),
        sa.CheckConstraint("priority BETWEEN 0 AND 3", name="ck_orders_priority_range"),
        sa.CheckConstraint("version > 0", name="ck_orders_version_positive"),
        sa.CheckConstraint(
            "status IN ('new','assigned','contacted','qualified','calculation','approval',"
            "'awaiting_payment','paid','production','ready','completed','lost')",
            name="ck_orders_valid_status",
        ),
        sa.ForeignKeyConstraint(
            ["assignee_id"], ["users.id"], name="fk_orders_assignee_id_users", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            name="fk_orders_customer_id_customers",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_orders"),
        sa.UniqueConstraint("number", name="uq_orders_number"),
    )
    for name, columns in [
        ("ix_orders_customer_id", ["customer_id"]),
        ("ix_orders_assignee_id", ["assignee_id"]),
        ("ix_orders_dessert", ["dessert"]),
        ("ix_orders_event_date", ["event_date"]),
        ("ix_orders_source", ["source"]),
        ("ix_orders_status", ["status"]),
        ("ix_orders_status_created_at", ["status", "created_at"]),
        ("ix_orders_assignee_status", ["assignee_id", "status"]),
    ]:
        op.create_index(name, "orders", columns)
    op.create_table(
        "order_status_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("actor_id", sa.Uuid()),
        sa.Column("from_status", sa.String(30)),
        sa.Column("to_status", sa.String(30), nullable=False),
        sa.Column("reason", sa.String(160), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name="fk_order_status_history_actor_id_users",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name="fk_order_status_history_order_id_orders",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_order_status_history"),
    )
    op.create_index("ix_order_status_history_order_id", "order_status_history", ["order_id"])
    op.create_index(
        "ix_order_status_history_order_created", "order_status_history", ["order_id", "created_at"]
    )
    op.create_table(
        "order_comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid()),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_internal", sa.Boolean(), nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            name="fk_order_comments_author_id_users",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name="fk_order_comments_order_id_orders",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_order_comments"),
    )
    op.create_index("ix_order_comments_order_id", "order_comments", ["order_id"])
    op.create_table(
        "tasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid()),
        sa.Column("customer_id", sa.Uuid()),
        sa.Column("assignee_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        *timestamps(),
        sa.CheckConstraint(
            "order_id IS NOT NULL OR customer_id IS NOT NULL", name="ck_tasks_subject_required"
        ),
        sa.CheckConstraint("priority BETWEEN 0 AND 3", name="ck_tasks_priority_range"),
        sa.CheckConstraint("status IN ('open','done','cancelled')", name="ck_tasks_valid_status"),
        sa.ForeignKeyConstraint(
            ["assignee_id"], ["users.id"], name="fk_tasks_assignee_id_users", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            name="fk_tasks_customer_id_customers",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"], name="fk_tasks_order_id_orders", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_tasks"),
    )
    for name, columns in [
        ("ix_tasks_order_id", ["order_id"]),
        ("ix_tasks_customer_id", ["customer_id"]),
        ("ix_tasks_assignee_id", ["assignee_id"]),
        ("ix_tasks_due_at", ["due_at"]),
        ("ix_tasks_status", ["status"]),
    ]:
        op.create_index(name, "tasks", columns)
    op.create_table(
        "outbox_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("topic", sa.String(100), nullable=False),
        sa.Column("aggregate_type", sa.String(60), nullable=False),
        sa.Column("aggregate_id", sa.Uuid(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("locked_at", sa.DateTime(timezone=True)),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("attempts >= 0", name="ck_outbox_events_attempts_nonnegative"),
        sa.CheckConstraint(
            "status IN ('pending','processing','delivered','dead')",
            name="ck_outbox_events_valid_status",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_outbox_events"),
    )
    for name, columns in [
        ("ix_outbox_events_topic", ["topic"]),
        ("ix_outbox_events_aggregate_id", ["aggregate_id"]),
        ("ix_outbox_events_status", ["status"]),
        ("ix_outbox_events_available_at", ["available_at"]),
        ("ix_outbox_events_dispatch", ["status", "available_at"]),
    ]:
        op.create_index(name, "outbox_events", columns)
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("actor_id", sa.Uuid()),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(60), nullable=False),
        sa.Column("entity_id", sa.Uuid()),
        sa.Column("request_id", sa.String(80)),
        sa.Column("changes", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["users.id"], name="fk_audit_log_actor_id_users", ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_audit_log"),
    )
    for column in ["actor_id", "action", "entity_id", "request_id", "created_at"]:
        op.create_index(f"ix_audit_log_{column}", "audit_log", [column])
    op.create_table(
        "conversion_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.String(80), nullable=False),
        sa.Column("visitor_id", sa.String(80), nullable=False),
        sa.Column("session_id", sa.String(80), nullable=False),
        sa.Column("order_id", sa.Uuid()),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("source", sa.String(200), nullable=False),
        sa.Column("campaign", sa.String(200), nullable=False),
        sa.Column("properties", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name="fk_conversion_events_order_id_orders",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_conversion_events"),
        sa.UniqueConstraint("visitor_id", "event_id", name="uq_conversion_visitor_event"),
    )
    for name, columns in [
        ("ix_conversion_events_visitor_id", ["visitor_id"]),
        ("ix_conversion_events_session_id", ["session_id"]),
        ("ix_conversion_events_order_id", ["order_id"]),
        ("ix_conversion_events_name_created", ["name", "created_at"]),
    ]:
        op.create_index(name, "conversion_events", columns)


def downgrade() -> None:
    for table in [
        "conversion_events",
        "audit_log",
        "outbox_events",
        "tasks",
        "order_comments",
        "order_status_history",
        "orders",
        "customers",
        "user_sessions",
        "users",
        "roles",
    ]:
        op.drop_table(table)
