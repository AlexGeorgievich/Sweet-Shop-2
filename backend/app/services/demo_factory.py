import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, time, timedelta
from random import Random
from typing import Any
from uuid import UUID, uuid5

from app.db.enums import OrderStatus
from app.domain.catalog import DESSERTS

SOURCE_SEQUENCE = (
    "Сайт · форма заявки",
    "Сайт · колесо подарков",
    "Telegram",
    "WhatsApp",
    "Рекомендация",
    "Повторный заказ",
)
SOURCES = set(SOURCE_SEQUENCE)
DESSERT_SEQUENCE = (
    "Торты на заказ",
    "Воздушное безе",
    "Заварные пирожные",
    "Пончики и сладости",
    "Порционные торты",
    "Круассаны с кремом",
)
STATUS_SEQUENCE = tuple(status.value for status in OrderStatus)
PAID_STATUSES = {"paid", "production", "ready", "completed"}
NAMESPACE = UUID("cb7613fa-08db-4b07-ae80-184ec6b19408")


@dataclass(frozen=True)
class DemoOptions:
    count: int = 1000
    seed: int = 20260831
    as_of: date = date(2026, 8, 31)


@dataclass(frozen=True)
class DemoStaff:
    id: UUID
    full_name: str
    email: str
    role: str
    profile: str


@dataclass(frozen=True)
class DemoCustomer:
    id: UUID
    name: str
    phone_normalized: str
    phone_display: str
    preferred_channel: str
    tags: tuple[str, ...]
    created_at: datetime


@dataclass(frozen=True)
class DemoOrder:
    id: UUID
    number: str
    customer_id: UUID
    assignee_id: UUID | None
    dessert: str
    event_date: date
    guests: int
    details: str
    prize: str
    consultant_summary: str
    source: str
    amount_kopecks: int
    status: str
    priority: int
    first_response_at: datetime | None
    response_minutes: int | None
    weight_grams: int | None
    decor: str
    customer_type: str
    telegram_delivered: bool
    telegram_delivered_at: datetime | None
    telegram_last_error: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class DemoHistory:
    id: UUID
    order_id: UUID
    actor_id: UUID | None
    from_status: str | None
    to_status: str
    reason: str
    comment: str
    created_at: datetime


@dataclass(frozen=True)
class DemoComment:
    id: UUID
    order_id: UUID
    author_id: UUID | None
    body: str
    created_at: datetime


@dataclass(frozen=True)
class DemoTask:
    id: UUID
    order_id: UUID
    customer_id: UUID
    assignee_id: UUID
    title: str
    description: str
    due_at: datetime
    priority: int
    status: str
    completed_at: datetime | None
    created_at: datetime


@dataclass(frozen=True)
class DemoConversion:
    id: UUID
    event_id: str
    visitor_id: str
    session_id: str
    order_id: UUID
    name: str
    source: str
    campaign: str
    properties: dict[str, Any]
    created_at: datetime


@dataclass(frozen=True)
class DemoDataset:
    customers: tuple[DemoCustomer, ...]
    staff: tuple[DemoStaff, ...]
    orders: tuple[DemoOrder, ...]
    histories: tuple[DemoHistory, ...]
    comments: tuple[DemoComment, ...]
    tasks: tuple[DemoTask, ...]
    conversions: tuple[DemoConversion, ...]


def stable_id(kind: str, key: str) -> UUID:
    return uuid5(NAMESPACE, f"{kind}:{key}")


def build_staff() -> tuple[DemoStaff, ...]:
    rows = (
        ("Елена Воронова", "lead", "leader"),
        ("Марина Быстрова", "manager", "fast"),
        ("Ольга Светлова", "manager", "balanced"),
        ("Анна Высоцкая", "manager", "overloaded"),
        ("Ирина Тихонова", "manager", "social"),
        ("Софья Белова", "manager", "premium"),
        ("Наталья Романова", "viewer", "observer"),
    )
    return tuple(
        DemoStaff(
            id=stable_id("staff", profile),
            full_name=name,
            email=f"demo-{profile}@sweet-shop.invalid",
            role=role,
            profile=profile,
        )
        for name, role, profile in rows
    )


def created_at_for(index: int, options: DemoOptions, random: Random) -> datetime:
    if index == 0:
        days_ago = 0
    elif index == 1:
        days_ago = 183
    else:
        days_ago = random.randrange(184)
    day = options.as_of - timedelta(days=days_ago)
    hour = random.choices(
        [9, 11, 13, 15, 18, 20, 22, 1],
        weights=[13, 15, 14, 15, 16, 13, 8, 6],
        k=1,
    )[0]
    return datetime.combine(day, time(hour, random.randrange(60)), tzinfo=UTC)


def choose_source(random: Random, repeat: bool, index: int) -> str:
    ordered = SOURCE_SEQUENCE
    if index < len(ordered):
        return ordered[index]
    if repeat:
        return random.choices(
            ordered,
            weights=[10, 5, 10, 10, 20, 45],
            k=1,
        )[0]
    return random.choices(
        ordered,
        weights=[36, 22, 13, 10, 15, 4],
        k=1,
    )[0]


def choose_assignee(random: Random, staff: tuple[DemoStaff, ...], source: str) -> DemoStaff:
    managers = staff[1:6]
    if source in {"Telegram", "WhatsApp"}:
        weights = [15, 16, 18, 35, 16]
    elif source == "Рекомендация":
        weights = [10, 14, 16, 15, 45]
    else:
        weights = [28, 23, 22, 17, 10]
    return random.choices(managers, weights=weights, k=1)[0]


def response_minutes(
    random: Random,
    source: str,
    created_at: datetime,
    profile: str,
    load: int,
) -> int | None:
    if random.random() < 0.045:
        return None
    minutes = random.randint(3, 20)
    if created_at.hour >= 20 or created_at.hour < 8:
        minutes += random.randint(14, 70)
    if created_at.weekday() >= 5:
        minutes += random.randint(8, 35)
    if source == "Сайт · колесо подарков":
        minutes += random.randint(3, 18)
    if profile == "fast":
        minutes = max(2, minutes - random.randint(5, 12))
    elif profile == "overloaded":
        minutes += random.randint(18, 65) + load // 25
    elif profile == "premium":
        minutes += random.randint(7, 25)
    return minutes


def choose_status(
    random: Random,
    index: int,
    age_days: int,
    repeat: bool,
    response: int | None,
    source: str,
) -> str:
    if index < len(STATUS_SEQUENCE):
        return STATUS_SEQUENCE[index]
    chance = 0.31
    chance += 0.20 if repeat else 0
    chance += 0.16 if source == "Рекомендация" else 0
    chance += 0.10 if source == "Повторный заказ" else 0
    chance -= 0.17 if source == "Сайт · колесо подарков" else 0
    chance += 0.24 if response is not None and response <= 15 else -0.09
    if random.random() < max(0.05, min(0.88, chance)):
        if age_days > 35:
            return random.choices(
                ["completed", "ready", "production", "paid"],
                weights=[65, 8, 12, 15],
                k=1,
            )[0]
        return random.choices(
            ["paid", "production", "ready", "completed"],
            weights=[38, 32, 18, 12],
            k=1,
        )[0]
    loss_chance = 0.42 if age_days > 20 else 0.16
    if random.random() < loss_chance:
        return "lost"
    active = (
        "new",
        "assigned",
        "contacted",
        "qualified",
        "calculation",
        "approval",
        "awaiting_payment",
    )
    return random.choice(active)


def status_path(final_status: str) -> tuple[str, ...]:
    stages = (
        "new",
        "assigned",
        "contacted",
        "qualified",
        "calculation",
        "approval",
        "awaiting_payment",
        "paid",
        "production",
        "ready",
        "completed",
    )
    if final_status == "lost":
        return stages[: 2 + (stable_id("lost", final_status).int % 5)] + ("lost",)
    return stages[: stages.index(final_status) + 1]


def amount_for(
    random: Random,
    dessert: str,
    source: str,
    repeat: bool,
    profile: str,
    complexity: int,
) -> int:
    base = {
        "Торты на заказ": 9_500,
        "Воздушное безе": 3_200,
        "Заварные пирожные": 4_600,
        "Пончики и сладости": 4_100,
        "Порционные торты": 7_800,
        "Круассаны с кремом": 4_900,
    }[dessert]
    multiplier = 1 + complexity * 0.18
    multiplier *= 1.20 if repeat else 1
    multiplier *= 1.18 if source == "Рекомендация" else 1
    multiplier *= 0.82 if source == "Сайт · колесо подарков" else 1
    multiplier *= 1.28 if profile == "premium" else 1
    return int(round(base * multiplier * random.uniform(0.86, 1.18) / 100) * 10_000)


def build_demo_dataset(options: DemoOptions) -> DemoDataset:
    if options.count != 1000:
        raise ValueError("Демонстрационный набор должен содержать ровно 1000 заявок.")
    random = Random(options.seed)
    staff = build_staff()
    customer_count = 728
    created_values = [created_at_for(index, options, random) for index in range(options.count)]
    oldest = min(created_values)
    first_names = ("Анна", "Мария", "Елена", "Ольга", "Ирина", "Софья", "Дарья")
    last_names = ("Соколова", "Лебедева", "Морозова", "Волкова", "Орлова", "Белова")
    customers = tuple(
        DemoCustomer(
            id=stable_id("customer", str(index)),
            name=(
                f"{first_names[index % len(first_names)]} "
                f"{last_names[(index * 3) % len(last_names)]}"
            ),
            phone_normalized=f"+7000{index:07d}",
            phone_display=(
                f"+7 000 {index // 10000:03d}-"
                f"{(index // 100) % 100:02d}-{index % 100:02d}"
            ),
            preferred_channel=("phone", "telegram", "whatsapp", "email")[index % 4],
            tags=(("повторный",) if index < options.count - customer_count else ()),
            created_at=oldest + timedelta(minutes=index),
        )
        for index in range(customer_count)
    )
    orders: list[DemoOrder] = []
    histories: list[DemoHistory] = []
    comments: list[DemoComment] = []
    tasks: list[DemoTask] = []
    conversions: list[DemoConversion] = []
    manager_load: dict[UUID, int] = {}

    for index, created_at in enumerate(created_values):
        repeat = index >= customer_count
        customer_index = index if not repeat else (index * 37) % customer_count
        customer = customers[customer_index]
        source = choose_source(random, repeat, index)
        dessert = DESSERT_SEQUENCE[index % len(DESSERT_SEQUENCE)]
        complexity = random.choices([0, 1, 2, 3], weights=[24, 38, 28, 10], k=1)[0]
        assignee = choose_assignee(random, staff, source)
        load = manager_load.get(assignee.id, 0)
        manager_load[assignee.id] = load + 1
        response = response_minutes(random, source, created_at, assignee.profile, load)
        age_days = (options.as_of - created_at.date()).days
        final_status = choose_status(
            random,
            index,
            age_days,
            repeat,
            response,
            source,
        )
        order_id = stable_id("order", str(index))
        first_response_at = (
            created_at + timedelta(minutes=response) if response is not None else None
        )
        lead_days = random.randint(4, 18) + complexity * random.randint(2, 7)
        if dessert == "Торты на заказ" and random.random() < 0.28:
            lead_days += random.randint(14, 35)
        event_date = created_at.date() + timedelta(days=lead_days)
        path = status_path(final_status)
        last_change = created_at
        previous: str | None = None
        for step, stage in enumerate(path):
            changed_at = min(
                created_at + timedelta(minutes=step * max(15, (response or 45)) + step * 180),
                datetime.combine(options.as_of, time(23, 59), tzinfo=UTC),
            )
            histories.append(
                DemoHistory(
                    id=stable_id("history", f"{index}:{step}"),
                    order_id=order_id,
                    actor_id=assignee.id if step else None,
                    from_status=previous,
                    to_status=stage,
                    reason="demo_scenario",
                    comment="Синтетический переход для моделирования",
                    created_at=changed_at,
                )
            )
            previous = stage
            last_change = max(last_change, changed_at)
        delivered = index % 40 != 0
        amount = amount_for(random, dessert, source, repeat, assignee.profile, complexity)
        weight = None if index % 137 == 0 else random.randint(8, 55) * 100
        order = DemoOrder(
            id=order_id,
            number=f"SI-DEMO-{index + 1:04d}",
            customer_id=customer.id,
            assignee_id=None if index % 211 == 0 and final_status in PAID_STATUSES else assignee.id,
            dessert=dessert,
            event_date=event_date,
            guests=random.randint(4, 90) + complexity * 10,
            details=(
                "Сложный многоуровневый декор" if complexity >= 2 else "Спокойное оформление"
            ),
            prize="Скидка 10%" if source == "Сайт · колесо подарков" else "",
            consultant_summary=f"Сценарий {source.lower()}, сложность {complexity}",
            source=source,
            amount_kopecks=amount,
            status=final_status,
            priority=min(3, complexity + int(amount > 1_500_000)),
            first_response_at=first_response_at,
            response_minutes=response,
            weight_grams=weight,
            decor=("Фигурки, цветы и ручная роспись" if complexity >= 2 else "Минимализм"),
            customer_type="repeat" if repeat else "new",
            telegram_delivered=delivered,
            telegram_delivered_at=created_at + timedelta(minutes=2) if delivered else None,
            telegram_last_error="demo_delivery_timeout" if not delivered else "",
            created_at=created_at,
            updated_at=last_change,
        )
        orders.append(order)

        if random.random() < 0.66:
            comments.append(
                DemoComment(
                    id=stable_id("comment", str(index)),
                    order_id=order_id,
                    author_id=assignee.id,
                    body=random.choice(
                        (
                            "Уточнены вкус и оформление.",
                            "Клиенту отправлен предварительный расчёт.",
                            "Нужно подтвердить время выдачи.",
                            "Повторный контакт запланирован.",
                        )
                    ),
                    created_at=min(
                        created_at + timedelta(hours=random.randint(1, 36)),
                        datetime.combine(options.as_of, time(23, 50), tzinfo=UTC),
                    ),
                )
            )
        if random.random() < 0.73:
            due_at = created_at + timedelta(hours=random.randint(4, 96))
            task_status = random.choices(
                ["open", "done", "cancelled"],
                weights=[40, 50, 10],
                k=1,
            )[0]
            completed_at = due_at - timedelta(hours=1) if task_status == "done" else None
            tasks.append(
                DemoTask(
                    id=stable_id("task", str(index)),
                    order_id=order_id,
                    customer_id=customer.id,
                    assignee_id=assignee.id,
                    title=random.choice(
                        ("Позвонить клиенту", "Подтвердить расчёт", "Согласовать декор")
                    ),
                    description="Синтетическая задача для проверки рабочей очереди.",
                    due_at=due_at,
                    priority=min(3, complexity),
                    status=task_status,
                    completed_at=completed_at,
                    created_at=created_at,
                )
            )

        visitor = f"demo-visitor-{customer_index:04d}"
        session = f"demo-session-{index:04d}"
        funnel = ["page_view", "consultant_opened"]
        if source == "Сайт · колесо подарков":
            funnel.append("wheel_spin")
        funnel.extend(["form_started", "form_submitted"])
        for step, event_name in enumerate(funnel):
            event_id = f"demo-event-{index:04d}-{step}"
            conversions.append(
                DemoConversion(
                    id=stable_id("conversion", event_id),
                    event_id=event_id,
                    visitor_id=visitor,
                    session_id=session,
                    order_id=order_id,
                    name=event_name,
                    source=source,
                    campaign="demo-six-month-model",
                    properties={"synthetic": True, "step": step},
                    created_at=created_at - timedelta(minutes=len(funnel) - step),
                )
            )

    dataset = DemoDataset(
        customers=customers,
        staff=staff,
        orders=tuple(orders),
        histories=tuple(histories),
        comments=tuple(comments),
        tasks=tuple(tasks),
        conversions=tuple(conversions),
    )
    validate_demo_dataset(dataset, options)
    return dataset


def validate_demo_dataset(dataset: DemoDataset, options: DemoOptions) -> None:
    if len(dataset.orders) != options.count or options.count != 1000:
        raise ValueError("Ожидалось ровно 1000 демонстрационных заявок.")
    if not 700 <= len(dataset.customers) <= 750:
        raise ValueError("Количество демонстрационных клиентов вне допустимого диапазона.")
    if len(dataset.staff) != 7:
        raise ValueError("Ожидалось семь демонстрационных сотрудников.")
    if {order.dessert for order in dataset.orders} != DESSERTS:
        raise ValueError("Генератор не покрыл весь каталог товаров.")
    if {order.source for order in dataset.orders} != SOURCES:
        raise ValueError("Генератор не покрыл все источники.")
    if {order.status for order in dataset.orders} != set(STATUS_SEQUENCE):
        raise ValueError("Генератор не покрыл все статусы.")
    order_ids = {order.id for order in dataset.orders}
    customer_ids = {customer.id for customer in dataset.customers}
    if len(order_ids) != len(dataset.orders) or len(customer_ids) != len(dataset.customers):
        raise ValueError("Обнаружены дубли стабильных идентификаторов.")
    if any(order.customer_id not in customer_ids for order in dataset.orders):
        raise ValueError("Заявка ссылается на отсутствующего клиента.")
    if any(item.order_id not in order_ids for item in dataset.histories):
        raise ValueError("История ссылается на отсутствующую заявку.")
    start = options.as_of - timedelta(days=183)
    if any(not start <= order.created_at.date() <= options.as_of for order in dataset.orders):
        raise ValueError("Дата заявки выходит за шестимесячное окно.")
    repeat_share = sum(order.customer_type == "repeat" for order in dataset.orders) / options.count
    if not 0.25 <= repeat_share <= 0.30:
        raise ValueError("Доля повторных заказов вне допустимого диапазона.")
    failure_share = sum(not order.telegram_delivered for order in dataset.orders) / options.count
    if not 0.02 <= failure_share <= 0.03:
        raise ValueError("Доля ошибок Telegram вне допустимого диапазона.")


def json_default(value: Any) -> str:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(f"Unsupported demo value: {type(value)!r}")


def dataset_digest(dataset: DemoDataset) -> str:
    canonical = json.dumps(
        asdict(dataset),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=json_default,
    )
    return hashlib.sha256(canonical.encode()).hexdigest()
