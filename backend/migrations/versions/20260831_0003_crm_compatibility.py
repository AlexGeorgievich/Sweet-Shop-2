"""Add CRM compatibility fields.

Revision ID: 20260831_0003
Revises: 20260831_0002
Create Date: 2026-08-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260831_0003"
down_revision: str | None = "20260831_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("weight_grams", sa.Integer()))
    op.add_column("orders", sa.Column("decor", sa.String(200), server_default="", nullable=False))
    op.add_column(
        "orders", sa.Column("customer_type", sa.String(20), server_default="new", nullable=False)
    )
    op.add_column(
        "orders",
        sa.Column("telegram_delivered", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column("orders", sa.Column("telegram_delivered_at", sa.DateTime(timezone=True)))
    op.add_column(
        "orders", sa.Column("telegram_last_error", sa.Text(), server_default="", nullable=False)
    )
    op.create_check_constraint(
        "weight_positive",
        "orders",
        "weight_grams IS NULL OR weight_grams > 0",
    )
    op.create_check_constraint(
        "customer_type",
        "orders",
        "customer_type IN ('new','repeat')",
    )


def downgrade() -> None:
    op.drop_constraint("customer_type", "orders", type_="check")
    op.drop_constraint("weight_positive", "orders", type_="check")
    for column in [
        "telegram_last_error",
        "telegram_delivered_at",
        "telegram_delivered",
        "customer_type",
        "decor",
        "weight_grams",
    ]:
        op.drop_column("orders", column)
