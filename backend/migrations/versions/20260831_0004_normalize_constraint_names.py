"""Normalize check-constraint names created by the initial migration.

Revision ID: 20260831_0004
Revises: 20260831_0003
Create Date: 2026-08-31
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260831_0004"
down_revision: str | None = "20260831_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RENAMES = {
    "customers": [
        ("ck_customers_ck_customers_preferred_channel", "ck_customers_preferred_channel"),
    ],
    "orders": [
        ("ck_orders_ck_orders_guests_range", "ck_orders_guests_range"),
        ("ck_orders_ck_orders_amount_nonnegative", "ck_orders_amount_nonnegative"),
        ("ck_orders_ck_orders_priority_range", "ck_orders_priority_range"),
        ("ck_orders_ck_orders_version_positive", "ck_orders_version_positive"),
        ("ck_orders_ck_orders_valid_status", "ck_orders_valid_status"),
    ],
    "tasks": [
        ("ck_tasks_ck_tasks_subject_required", "ck_tasks_subject_required"),
        ("ck_tasks_ck_tasks_priority_range", "ck_tasks_priority_range"),
        ("ck_tasks_ck_tasks_valid_status", "ck_tasks_valid_status"),
    ],
    "outbox_events": [
        (
            "ck_outbox_events_ck_outbox_events_attempts_nonnegative",
            "ck_outbox_events_attempts_nonnegative",
        ),
        ("ck_outbox_events_ck_outbox_events_valid_status", "ck_outbox_events_valid_status"),
    ],
}


def rename(old_first: bool) -> None:
    for table, names in RENAMES.items():
        for old, new in names:
            source, target = (old, new) if old_first else (new, old)
            op.execute(f'ALTER TABLE "{table}" RENAME CONSTRAINT "{source}" TO "{target}"')


def upgrade() -> None:
    rename(old_first=True)


def downgrade() -> None:
    rename(old_first=False)
