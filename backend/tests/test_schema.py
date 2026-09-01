from sqlalchemy import CheckConstraint, Float, UniqueConstraint

from app.db import Base
from app.db.enums import DataMode, OrderStatus

EXPECTED_TABLES = {
    "audit_log",
    "conversion_events",
    "customers",
    "order_comments",
    "order_status_history",
    "orders",
    "outbox_events",
    "roles",
    "tasks",
    "user_sessions",
    "users",
    "demo_generations",
}

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


def test_metadata_contains_initial_crm_schema() -> None:
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_orders_keep_money_out_of_floating_point() -> None:
    orders = Base.metadata.tables["orders"]

    assert "amount_kopecks" in orders.c
    assert not isinstance(orders.c.amount_kopecks.type, Float)
    assert orders.c.version.nullable is False


def test_orders_constrain_guests_status_and_version() -> None:
    orders = Base.metadata.tables["orders"]
    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in orders.constraints
        if isinstance(constraint, CheckConstraint)
    }

    assert "guests BETWEEN 1 AND 500" in checks["ck_orders_guests_range"]
    assert "version > 0" in checks["ck_orders_version_positive"]
    for status in OrderStatus:
        assert status.value in checks["ck_orders_valid_status"]


def test_critical_unique_keys_exist() -> None:
    assert Base.metadata.tables["orders"].c.number.unique
    assert Base.metadata.tables["users"].c.email.unique


def test_mode_dependent_unique_keys_are_scoped() -> None:
    customers = Base.metadata.tables["customers"]
    conversions = Base.metadata.tables["conversion_events"]

    customer_keys = {
        tuple(column.name for column in constraint.columns)
        for constraint in customers.constraints
        if isinstance(constraint, UniqueConstraint)
    }
    conversion_keys = {
        tuple(column.name for column in constraint.columns)
        for constraint in conversions.constraints
        if isinstance(constraint, UniqueConstraint)
    }

    assert ("data_mode", "phone_normalized") in customer_keys
    assert ("phone_normalized",) not in customer_keys
    assert ("data_mode", "visitor_id", "event_id") in conversion_keys
    assert ("visitor_id", "event_id") not in conversion_keys


def test_business_tables_require_data_mode() -> None:
    assert {DataMode.PRODUCTION.value, DataMode.DEMO.value} == {"production", "demo"}
    for table_name in DATA_MODE_TABLES:
        column = Base.metadata.tables[table_name].c.data_mode
        assert column.nullable is False
        assert column.default.arg == "production"


def test_session_and_demo_metadata_are_present() -> None:
    sessions = Base.metadata.tables["user_sessions"]
    users = Base.metadata.tables["users"]
    generation = Base.metadata.tables["demo_generations"]
    assert sessions.c.active_data_mode.default.arg == "production"
    assert users.c.is_demo.default.arg is False
    assert {"seed", "as_of", "generated_at", "count", "summary"} <= set(generation.c.keys())
