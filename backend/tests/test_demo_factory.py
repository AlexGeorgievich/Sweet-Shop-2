import os
import subprocess
import sys
from datetime import date

import pytest

from app.db.enums import OrderStatus
from app.domain.catalog import DESSERTS
from app.services.demo_factory import (
    SOURCES,
    DemoOptions,
    build_demo_dataset,
    dataset_digest,
    validate_demo_dataset,
)

OPTIONS = DemoOptions(count=1000, seed=20260831, as_of=date(2026, 8, 31))
PAID_STATUSES = {"paid", "production", "ready", "completed"}


def conversion(orders: list) -> float:
    return sum(order.status in PAID_STATUSES for order in orders) / len(orders)


def test_same_options_produce_same_digest_and_other_seed_changes_it() -> None:
    first = build_demo_dataset(OPTIONS)
    second = build_demo_dataset(OPTIONS)
    changed = build_demo_dataset(DemoOptions(count=1000, seed=7, as_of=OPTIONS.as_of))

    assert dataset_digest(first) == dataset_digest(second)
    assert dataset_digest(first) != dataset_digest(changed)


def test_digest_does_not_depend_on_python_hash_seed() -> None:
    script = (
        "from datetime import date; "
        "from app.services.demo_factory import DemoOptions,build_demo_dataset,dataset_digest; "
        "print(dataset_digest(build_demo_dataset("
        "DemoOptions(count=1000,seed=20260831,as_of=date(2026,8,31)))))"
    )
    digests = []
    for hash_seed in ("1", "2"):
        environment = {**os.environ, "PYTHONHASHSEED": hash_seed}
        result = subprocess.run(
            [sys.executable, "-c", script],
            check=True,
            capture_output=True,
            text=True,
            env=environment,
        )
        digests.append(result.stdout.strip())
    assert digests[0] == digests[1]


def test_factory_builds_complete_six_month_business_dataset() -> None:
    data = build_demo_dataset(OPTIONS)

    assert len(data.orders) == 1000
    assert 700 <= len(data.customers) <= 750
    assert len(data.staff) == 7
    assert {order.dessert for order in data.orders} == DESSERTS
    assert {order.source for order in data.orders} == SOURCES
    assert {order.status for order in data.orders} == {status.value for status in OrderStatus}
    assert min(order.created_at.date() for order in data.orders) == date(2026, 3, 1)
    assert max(order.created_at.date() for order in data.orders) == OPTIONS.as_of
    assert any(order.event_date > OPTIONS.as_of for order in data.orders)
    validate_demo_dataset(data, OPTIONS)


def test_factory_creates_useful_operational_ranges() -> None:
    data = build_demo_dataset(OPTIONS)
    repeats = sum(order.customer_type == "repeat" for order in data.orders)
    telegram_failures = sum(not order.telegram_delivered for order in data.orders)

    assert 250 <= repeats <= 300
    assert 20 <= telegram_failures <= 30
    assert 550 <= len(data.comments) <= 750
    assert 600 <= len(data.tasks) <= 850
    assert len(data.histories) >= len(data.orders)
    assert len(data.conversions) >= 1500
    assert any(task.status == "open" and task.due_at.date() < OPTIONS.as_of for task in data.tasks)


def test_factory_encodes_noisy_business_relationships() -> None:
    data = build_demo_dataset(OPTIONS)
    fast = [
        order
        for order in data.orders
        if order.response_minutes is not None and order.response_minutes <= 15
    ]
    slow = [
        order
        for order in data.orders
        if order.response_minutes is None or order.response_minutes > 15
    ]
    referral_or_repeat = [
        order for order in data.orders if order.source in {"Рекомендация", "Повторный заказ"}
    ]
    wheel = [order for order in data.orders if order.source == "Сайт · колесо подарков"]

    assert len(fast) > 100 and len(slow) > 100
    assert conversion(fast) > conversion(slow) + 0.12
    assert conversion(referral_or_repeat) > conversion(wheel) + 0.12
    assert sum(order.amount_kopecks for order in referral_or_repeat) / len(
        referral_or_repeat
    ) > sum(order.amount_kopecks for order in wheel) / len(wheel)


def test_factory_rejects_an_unsupported_order_count() -> None:
    with pytest.raises(ValueError, match="1000"):
        build_demo_dataset(DemoOptions(count=999, seed=1, as_of=OPTIONS.as_of))
