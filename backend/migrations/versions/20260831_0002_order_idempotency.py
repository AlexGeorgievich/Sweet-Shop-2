"""Add order idempotency fields.

Revision ID: 20260831_0002
Revises: 20260831_0001
Create Date: 2026-08-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260831_0002"
down_revision: str | None = "20260831_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("idempotency_key", sa.String(100)))
    op.add_column("orders", sa.Column("request_fingerprint", sa.String(64)))
    op.create_unique_constraint(
        "uq_orders_idempotency_key",
        "orders",
        ["idempotency_key"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_orders_idempotency_key", "orders", type_="unique")
    op.drop_column("orders", "request_fingerprint")
    op.drop_column("orders", "idempotency_key")
