from collections.abc import AsyncIterator
from datetime import date, timedelta

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.auth import login_failures
from app.db import Base
from app.db.base import utc_now
from app.db.models import (
    AuditLog,
    Customer,
    Order,
    OrderComment,
    OrderStatusHistory,
    OutboxEvent,
    Role,
    Task,
    User,
    UserSession,
)
from app.db.session import get_session
from app.main import app
from app.services.auth import password_hash
from app.services.importer import ImportReport, import_records

pytestmark = pytest.mark.asyncio

VALID_ORDER = {
    "name": "Анна",
    "phone": "+7 927 000-00-00",
    "dessert": "Торты на заказ",
    "date": "2099-09-10",
    "guests": "10",
    "details": "Клубничная начинка и светлое оформление",
    "consent": True,
    "consultantSummary": "Торт на день рождения",
    "prize": "",
    "website": "",
}


@pytest_asyncio.fixture
async def database() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest_asyncio.fixture
async def client(
    database: async_sessionmaker[AsyncSession],
) -> AsyncIterator[httpx.AsyncClient]:
    async def test_session() -> AsyncIterator[AsyncSession]:
        async with database() as session:
            yield session

    app.dependency_overrides[get_session] = test_session
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as instance:
        yield instance
    app.dependency_overrides.clear()


async def scalar_count(
    database: async_sessionmaker[AsyncSession],
    model: type[Base],
) -> int:
    async with database() as session:
        return int(await session.scalar(select(func.count()).select_from(model)) or 0)


async def login_admin(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    async with database() as session:
        role = Role(name="admin", description="Administrator")
        session.add(role)
        await session.flush()
        session.add(
            User(
                role_id=role.id,
                email="admin@example.com",
                password_hash=password_hash.hash("correct horse battery staple"),
                full_name="Администратор",
            )
        )
        await session.commit()
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "ADMIN@example.com",
            "password": "correct horse battery staple",
        },
    )
    assert response.status_code == 200
    assert "sweet_shop_session" in response.cookies


async def insert_mode_order(
    database: async_sessionmaker[AsyncSession],
    *,
    number: str,
    data_mode: str,
) -> None:
    async with database() as session:
        customer = Customer(
            name=f"Клиент {data_mode}",
            phone_normalized="+79990000001",
            phone_display="+7 999 000-00-01",
            data_mode=data_mode,
        )
        session.add(customer)
        await session.flush()
        session.add(
            Order(
                number=number,
                customer_id=customer.id,
                dessert="Торты на заказ",
                event_date=date.fromisoformat(VALID_ORDER["date"]),
                guests=10,
                data_mode=data_mode,
            )
        )
        await session.commit()


async def insert_demo_customer(
    database: async_sessionmaker[AsyncSession],
    *,
    phone_normalized: str,
) -> None:
    async with database() as session:
        session.add(
            Customer(
                name="Демо-клиент",
                phone_normalized=phone_normalized,
                phone_display=phone_normalized,
                data_mode="demo",
            )
        )
        await session.commit()


async def test_creates_customer_order_history_and_outbox_in_one_request(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    response = await client.post(
        "/api/v1/orders",
        json=VALID_ORDER,
        headers={"Idempotency-Key": "browser-session-1"},
    )

    assert response.status_code == 201
    assert response.json()["orderId"].startswith("SI-")
    assert response.json()["notificationQueued"] is True
    assert await scalar_count(database, Customer) == 1
    assert await scalar_count(database, Order) == 1
    assert await scalar_count(database, OrderStatusHistory) == 1
    assert await scalar_count(database, OutboxEvent) == 1


async def test_same_idempotency_key_returns_original_order_without_duplicates(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    headers = {"Idempotency-Key": "browser-session-2"}
    first = await client.post("/api/v1/orders", json=VALID_ORDER, headers=headers)
    second = await client.post("/api/v1/orders", json=VALID_ORDER, headers=headers)

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["orderId"] == first.json()["orderId"]
    assert await scalar_count(database, Order) == 1
    assert await scalar_count(database, OutboxEvent) == 1


async def test_rejects_reused_key_with_different_payload(client: httpx.AsyncClient) -> None:
    headers = {"Idempotency-Key": "browser-session-3"}
    first = await client.post("/api/v1/orders", json=VALID_ORDER, headers=headers)
    changed = {**VALID_ORDER, "guests": 30}
    second = await client.post("/api/v1/orders", json=changed, headers=headers)

    assert first.status_code == 201
    assert second.status_code == 409


async def test_validation_matches_frontend_error_shape(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/v1/orders",
        json={},
        headers={"Idempotency-Key": "invalid-order"},
    )

    assert response.status_code == 400
    assert set(response.json()["fields"]) == {
        "consent",
        "date",
        "dessert",
        "details",
        "guests",
        "name",
        "phone",
    }


async def test_honeypot_does_not_persist_order(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    response = await client.post(
        "/api/v1/orders",
        json={"website": "spam.example"},
        headers={"Idempotency-Key": "spam-order"},
    )

    assert response.status_code == 201
    assert response.json()["notificationQueued"] is False
    assert await scalar_count(database, Order) == 0


async def test_public_order_never_reuses_demo_customer(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    await insert_demo_customer(database, phone_normalized="+79270000000")

    response = await client.post(
        "/api/v1/orders",
        json=VALID_ORDER,
        headers={"Idempotency-Key": "production-customer-boundary"},
    )
    assert response.status_code == 201

    async with database() as session:
        order = await session.scalar(
            select(Order).where(Order.number == response.json()["orderId"])
        )
        assert order is not None
        customer = await session.get(Customer, order.customer_id)
        history = await session.scalar(
            select(OrderStatusHistory).where(OrderStatusHistory.order_id == order.id)
        )
        outbox = await session.scalar(
            select(OutboxEvent).where(OutboxEvent.aggregate_id == order.id)
        )
    assert customer is not None and customer.data_mode == "production"
    assert order.data_mode == "production"
    assert history is not None and history.data_mode == "production"
    assert outbox is not None and outbox.data_mode == "production"


async def test_crm_compatibility_reads_and_updates_postgresql_order(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    await login_admin(client, database)
    created = await client.post(
        "/api/v1/orders",
        json=VALID_ORDER,
        headers={"Idempotency-Key": "crm-order"},
    )
    number = created.json()["orderId"]

    listed = await client.get("/api/v1/crm/orders")
    assert listed.status_code == 200
    assert listed.json()["orders"][0]["id"] == number
    assert listed.json()["orders"][0]["status"] == "new"

    updated = await client.patch(
        "/api/v1/crm/orders",
        json={"id": number, "status": "contacted"},
    )
    assert updated.status_code == 200
    assert updated.json()["order"]["status"] == "contacted"
    assert updated.json()["order"]["responseMinutes"] == 0


async def test_crm_requires_valid_employee_session(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/crm/orders")

    assert response.status_code == 401


async def test_login_me_and_logout(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    await login_admin(client, database)

    current = await client.get("/api/v1/auth/me")
    assert current.status_code == 200
    assert current.json()["role"] == "admin"

    logged_out = await client.post("/api/v1/auth/logout")
    assert logged_out.status_code == 204
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_admin_switches_only_current_session_to_demo(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    await login_admin(client, database)

    initial = await client.get("/api/v1/admin/data-mode")
    assert initial.status_code == 200
    assert initial.json() == {"dataMode": "production", "canUseDemo": True}

    switched = await client.post(
        "/api/v1/admin/data-mode",
        json={"dataMode": "demo"},
    )
    assert switched.status_code == 200
    assert switched.json() == {"dataMode": "demo", "canUseDemo": True}
    assert (await client.get("/api/v1/auth/me")).json()["dataMode"] == "demo"

    async with database() as session:
        modes = (await session.scalars(select(UserSession.active_data_mode))).all()
    assert modes == ["demo"]


async def test_non_admin_cannot_enable_demo(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    async with database() as session:
        role = Role(name="viewer", description="Read only")
        session.add(role)
        await session.flush()
        session.add(
            User(
                role_id=role.id,
                email="mode-viewer@example.com",
                password_hash=password_hash.hash("correct horse battery staple"),
                full_name="Наблюдатель",
            )
        )
        await session.commit()
    assert (
        await client.post(
            "/api/v1/auth/login",
            json={
                "email": "mode-viewer@example.com",
                "password": "correct horse battery staple",
            },
        )
    ).status_code == 200

    response = await client.post(
        "/api/v1/admin/data-mode",
        json={"dataMode": "demo"},
    )
    assert response.status_code == 403
    assert (await client.get("/api/v1/auth/me")).json()["dataMode"] == "production"


async def test_demo_staff_cannot_log_in(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    async with database() as session:
        role = Role(name="manager", description="Manager")
        session.add(role)
        await session.flush()
        session.add(
            User(
                role_id=role.id,
                email="synthetic-manager@example.com",
                password_hash=password_hash.hash("correct horse battery staple"),
                full_name="Демо-менеджер",
                is_demo=True,
            )
        )
        await session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "synthetic-manager@example.com",
            "password": "correct horse battery staple",
        },
    )
    assert response.status_code == 401


async def test_admin_generates_and_reads_demo_summary(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    await login_admin(client, database)
    missing = await client.get("/api/v1/admin/demo")
    assert missing.status_code == 404

    generated = await client.post(
        "/api/v1/admin/demo/generate",
        json={"count": 1000, "seed": 20260831, "asOf": "2026-08-31"},
    )
    assert generated.status_code == 200
    assert generated.headers["cache-control"] == "no-store"
    assert generated.json()["count"] == 1000
    assert generated.json()["summary"]["orders"] == 1000
    assert len(generated.json()["digest"]) == 64

    current = await client.get("/api/v1/admin/demo")
    assert current.status_code == 200
    assert current.headers["cache-control"] == "no-store"
    assert current.json()["digest"] == generated.json()["digest"]


async def test_crm_lists_and_updates_only_the_active_data_mode(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    await login_admin(client, database)
    created = await client.post(
        "/api/v1/orders",
        json=VALID_ORDER,
        headers={"Idempotency-Key": "production-isolation"},
    )
    production_number = created.json()["orderId"]
    await insert_mode_order(database, number="SI-DEMO-ISOLATION", data_mode="demo")

    production = await client.get("/api/v1/crm/orders")
    assert [item["id"] for item in production.json()["orders"]] == [production_number]

    await client.post("/api/v1/admin/data-mode", json={"dataMode": "demo"})
    demo = await client.get("/api/v1/crm/orders")
    assert [item["id"] for item in demo.json()["orders"]] == ["SI-DEMO-ISOLATION"]
    assert (
        await client.patch(
            "/api/v1/crm/orders",
            json={"id": production_number, "status": "contacted"},
        )
    ).status_code == 404
    assert (await client.get("/api/v1/crm/insights")).json()["summary"]["orders"] == 1


async def test_demo_child_records_inherit_mode_and_are_hidden_in_production(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    await login_admin(client, database)
    await insert_mode_order(database, number="SI-DEMO-CHILDREN", data_mode="demo")
    await client.post("/api/v1/admin/data-mode", json={"dataMode": "demo"})

    comment = await client.post(
        "/api/v1/crm/orders/SI-DEMO-CHILDREN/comments",
        json={"body": "Демонстрационный комментарий"},
    )
    task = await client.post(
        "/api/v1/crm/orders/SI-DEMO-CHILDREN/tasks",
        json={"title": "Демонстрационная задача", "due_at": "2099-09-01T15:00:00Z"},
    )
    assert comment.status_code == 201
    assert task.status_code == 201

    async with database() as session:
        stored_comment = await session.scalar(select(OrderComment))
        stored_task = await session.scalar(select(Task))
        audit_modes = (await session.scalars(select(AuditLog.data_mode))).all()
    assert stored_comment is not None and stored_comment.data_mode == "demo"
    assert stored_task is not None and stored_task.data_mode == "demo"
    assert audit_modes == ["demo", "demo"]

    await client.post("/api/v1/admin/data-mode", json={"dataMode": "production"})
    assert (
        await client.get("/api/v1/crm/orders/SI-DEMO-CHILDREN/comments")
    ).status_code == 404


async def test_login_rate_limit_blocks_repeated_password_guessing(
    client: httpx.AsyncClient,
) -> None:
    email = "rate-limit@example.com"
    login_failures.pop(email, None)
    for _ in range(5):
        response = await client.post(
            "/api/v1/auth/login", json={"email": email, "password": "wrong-password-123"}
        )
        assert response.status_code == 401
    blocked = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "wrong-password-123"}
    )
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == "300"
    login_failures.pop(email, None)


async def test_viewer_can_read_but_cannot_change_orders(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    async with database() as session:
        role = Role(name="viewer", description="Read only")
        session.add(role)
        await session.flush()
        session.add(
            User(
                role_id=role.id,
                email="viewer@example.com",
                password_hash=password_hash.hash("correct horse battery staple"),
                full_name="Наблюдатель",
            )
        )
        await session.commit()
    assert (
        await client.post(
            "/api/v1/auth/login",
            json={
                "email": "viewer@example.com",
                "password": "correct horse battery staple",
            },
        )
    ).status_code == 200
    assert (await client.get("/api/v1/crm/orders")).status_code == 200
    assert (
        await client.patch(
            "/api/v1/crm/orders",
            json={"id": "SI-MISSING", "status": "contacted"},
        )
    ).status_code == 403


async def test_admin_manages_employees_and_audit(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    await login_admin(client, database)
    async with database() as session:
        session.add(Role(name="manager", description="Manager"))
        await session.commit()

    created = await client.post(
        "/api/v1/admin/employees",
        json={
            "email": "manager@example.com",
            "full_name": "Первый менеджер",
            "password": "temporary-password-123",
            "role": "manager",
        },
    )
    assert created.status_code == 201
    employee = created.json()["employee"]
    assert employee["role"] == "manager"
    assert len((await client.get("/api/v1/admin/employees")).json()["employees"]) == 2

    disabled = await client.patch(
        f"/api/v1/admin/employees/{employee['id']}", json={"is_active": False}
    )
    assert disabled.status_code == 200
    assert disabled.json()["employee"]["isActive"] is False
    assert len((await client.get("/api/v1/admin/audit")).json()["events"]) == 2
    assert await scalar_count(database, AuditLog) == 2


async def test_manager_comments_and_tasks_are_audited(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    await login_admin(client, database)
    created = await client.post(
        "/api/v1/orders",
        json=VALID_ORDER,
        headers={"Idempotency-Key": "operations-order"},
    )
    number = created.json()["orderId"]

    comment = await client.post(
        f"/api/v1/crm/orders/{number}/comments", json={"body": "Позвонить после 18:00"}
    )
    assert comment.status_code == 201
    assert (await client.get(f"/api/v1/crm/orders/{number}/comments")).json()["comments"][0][
        "body"
    ] == "Позвонить после 18:00"

    task = await client.post(
        f"/api/v1/crm/orders/{number}/tasks",
        json={"title": "Позвонить клиенту", "due_at": "2099-09-01T15:00:00Z"},
    )
    assert task.status_code == 201
    task_id = task.json()["task"]["id"]
    completed = await client.patch(f"/api/v1/crm/tasks/{task_id}", json={"status": "done"})
    assert completed.status_code == 200
    assert await scalar_count(database, OrderComment) == 1
    assert await scalar_count(database, Task) == 1
    assert await scalar_count(database, AuditLog) == 3


async def test_crm_insights_identify_sla_and_overdue_work(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    await login_admin(client, database)
    created = await client.post(
        "/api/v1/orders",
        json=VALID_ORDER,
        headers={"Idempotency-Key": "sla-order"},
    )
    number = created.json()["orderId"]
    async with database() as session:
        order = await session.scalar(select(Order).where(Order.number == number))
        assert order is not None
        order.created_at = utc_now() - timedelta(hours=2)
        order.updated_at = utc_now() - timedelta(hours=25)
        await session.commit()
    task = await client.post(
        f"/api/v1/crm/orders/{number}/tasks",
        json={"title": "Срочно позвонить", "due_at": "2020-01-01T10:00:00Z"},
    )
    assert task.status_code == 201

    response = await client.get("/api/v1/crm/insights")
    assert response.status_code == 200
    summary = response.json()["summary"]
    assert summary["slaBreaches"] == 1
    assert summary["overdueTasks"] == 1
    assert summary["staleOrders"] == 1
    assert response.json()["attention"][0]["number"] == number


async def test_commercial_fields_and_production_calendar(
    client: httpx.AsyncClient,
    database: async_sessionmaker[AsyncSession],
) -> None:
    await login_admin(client, database)
    created = await client.post(
        "/api/v1/orders",
        json=VALID_ORDER,
        headers={"Idempotency-Key": "production-order"},
    )
    number = created.json()["orderId"]
    employee_id = (await client.get("/api/v1/crm/staff")).json()["employees"][0]["id"]

    updated = await client.patch(
        f"/api/v1/crm/orders/{number}/commercial",
        json={
            "amount_rubles": 12500,
            "assignee_id": employee_id,
            "priority": 3,
            "weight_grams": 3200,
            "decor": "Ягоды и надпись",
            "event_date": "2099-09-10",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["commercial"]["amountRubles"] == 12500
    assert updated.json()["commercial"]["priority"] == 3

    calendar = await client.get("/api/v1/crm/production?from_date=2099-09-01&to_date=2099-09-30")
    assert calendar.status_code == 200
    assert calendar.json()["orders"][0]["number"] == number
    assert calendar.json()["orders"][0]["weightGrams"] == 3200
    assert await scalar_count(database, AuditLog) == 1


async def test_legacy_import_is_repeatable(
    database: async_sessionmaker[AsyncSession],
) -> None:
    record = {
        "id": "SI-LEGACY-0001",
        "createdAt": "2026-08-30T09:30:00.000Z",
        "updatedAt": "2026-08-30T09:35:00.000Z",
        "name": "Анна",
        "phone": "+7 900 000-00-00",
        "dessert": "Торты на заказ",
        "eventDate": "2026-09-12",
        "guests": 15,
        "details": "Ягодная начинка",
        "prize": "",
        "consultantSummary": "",
        "source": "Сайт · форма заявки",
        "amountRub": 5400,
        "weightKg": 2,
        "decor": "Ягоды",
        "customerType": "new",
        "status": "agreement",
        "telegram": {
            "delivered": True,
            "deliveredAt": "2026-08-30T09:31:00.000Z",
            "lastError": None,
        },
        "_source_file": "SI-LEGACY-0001.json",
    }

    async with database() as session:
        first = await import_records(
            session,
            [record],
            ImportReport(discovered=1),
            dry_run=False,
        )
    async with database() as session:
        second = await import_records(
            session,
            [record],
            ImportReport(discovered=1),
            dry_run=False,
        )

    assert first.imported == 1
    assert second.imported == 0
    assert second.skipped == 1
    assert await scalar_count(database, Order) == 1


async def test_legacy_import_never_reuses_demo_customer(
    database: async_sessionmaker[AsyncSession],
) -> None:
    await insert_demo_customer(database, phone_normalized="+79000000000")
    record = {
        "id": "SI-LEGACY-MODE-0001",
        "createdAt": "2026-08-30T09:30:00.000Z",
        "updatedAt": "2026-08-30T09:35:00.000Z",
        "name": "Импортированный клиент",
        "phone": "+7 900 000-00-00",
        "dessert": "Торты на заказ",
        "eventDate": "2026-09-12",
        "guests": 15,
        "status": "new",
        "_source_file": "SI-LEGACY-MODE-0001.json",
    }

    async with database() as session:
        report = await import_records(
            session,
            [record],
            ImportReport(discovered=1),
            dry_run=False,
        )
    assert report.imported == 1

    async with database() as session:
        order = await session.scalar(select(Order).where(Order.number == record["id"]))
        assert order is not None
        customer = await session.get(Customer, order.customer_id)
        history = await session.scalar(
            select(OrderStatusHistory).where(OrderStatusHistory.order_id == order.id)
        )
    assert customer is not None and customer.data_mode == "production"
    assert order.data_mode == "production"
    assert history is not None and history.data_mode == "production"
