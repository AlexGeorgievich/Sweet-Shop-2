"""Add isolated production and demo data modes."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260831_0005"
down_revision: str | None = "20260831_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MODE_TABLES = (
    "customers",
    "orders",
    "order_status_history",
    "order_comments",
    "tasks",
    "outbox_events",
    "audit_log",
    "conversion_events",
)


def upgrade() -> None:
    for table in MODE_TABLES:
        op.add_column(
            table,
            sa.Column(
                "data_mode",
                sa.String(length=20),
                server_default="production",
                nullable=False,
            ),
        )
        op.create_check_constraint(
            f"{table}_data_mode",
            table,
            "data_mode IN ('production','demo')",
        )
        op.create_index(f"ix_{table}_data_mode", table, ["data_mode"])

    op.add_column(
        "users",
        sa.Column("is_demo", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "user_sessions",
        sa.Column(
            "active_data_mode",
            sa.String(length=20),
            server_default="production",
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "user_sessions_active_data_mode",
        "user_sessions",
        "active_data_mode IN ('production','demo')",
    )

    op.drop_constraint("uq_customers_phone_normalized", "customers", type_="unique")
    op.create_unique_constraint(
        "uq_customers_data_mode_phone_normalized",
        "customers",
        ["data_mode", "phone_normalized"],
    )
    op.drop_constraint("uq_conversion_visitor_event", "conversion_events", type_="unique")
    op.create_unique_constraint(
        "uq_conversion_data_mode_visitor_event",
        "conversion_events",
        ["data_mode", "visitor_id", "event_id"],
    )

    op.create_table(
        "demo_generations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("seed", sa.Integer(), nullable=False),
        sa.Column("as_of", sa.Date(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("summary", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_demo_generations"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    demo_count = bind.execute(
        sa.text("SELECT count(*) FROM orders WHERE data_mode = 'demo'")
    ).scalar_one()
    if demo_count:
        raise RuntimeError("Delete demo data before downgrading 20260831_0005")

    op.drop_table("demo_generations")
    op.drop_constraint("uq_conversion_data_mode_visitor_event", "conversion_events", type_="unique")
    op.create_unique_constraint(
        "uq_conversion_visitor_event",
        "conversion_events",
        ["visitor_id", "event_id"],
    )
    op.drop_constraint(
        "uq_customers_data_mode_phone_normalized", "customers", type_="unique"
    )
    op.create_unique_constraint(
        "uq_customers_phone_normalized", "customers", ["phone_normalized"]
    )
    op.drop_constraint("user_sessions_active_data_mode", "user_sessions", type_="check")
    op.drop_column("user_sessions", "active_data_mode")
    op.drop_column("users", "is_demo")
    for table in reversed(MODE_TABLES):
        op.drop_index(f"ix_{table}_data_mode", table_name=table)
        op.drop_constraint(f"{table}_data_mode", table, type_="check")
        op.drop_column(table, "data_mode")
