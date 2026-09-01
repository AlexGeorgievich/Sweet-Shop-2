# Demo and Production Data Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить изолированные `production`/`demo` контуры, административное переключение и воспроизводимое заполнение PostgreSQL ровно 1000 связанными демозаявками за шесть месяцев.

**Architecture:** Авторизация и роли остаются общими, а активный режим хранится в серверной сессии. Все бизнес-таблицы и запросы получают обязательный `data_mode`; публичная форма всегда пишет в `production`. Один чистый генератор строит детерминированный граф данных, а транзакционный seed-сервис заменяет только demo-контур и используется CLI и admin API.

**Tech Stack:** Python 3.12+, FastAPI, SQLAlchemy 2 async, Alembic, PostgreSQL 18, Pydantic 2, pytest/pytest-asyncio, Next.js 16, React 19, TypeScript 5.9, node:test, Docker Compose.

**Spec:** `site/docs/superpowers/specs/2026-08-31-demo-production-data-modes-design.md`

## Global Constraints

- `production` является режимом по умолчанию для новых и существующих сессий.
- Публичная форма и импорт старых JSON всегда создают только production-данные.
- Только `admin` может включить demo для своей серверной сессии.
- Любая генерация удаляет и заменяет только строки `data_mode=demo`.
- Ровно 1000 заявок создаются для заданных `seed + asOf`; повтор даёт тот же нормализованный набор.
- Генератор не вызывает Telegram, LLM или другие внешние API.
- Все синтетические email используют `.invalid`; телефоны нельзя использовать для звонков.
- Не выводить `.env`, пароль администратора, cookie, телефоны или тексты пожеланий в журналы.
- Перед изменением данных снять количество production-заявок и после генерации доказать, что оно не изменилось.
- Текущая переданная папка не содержит `.git`; commit-шаги выполнять после восстановления/инициализации репозитория, а до этого фиксировать контрольную точку через список изменённых файлов и результаты тестов.

---

## File Map

**Backend data model**

- Create `backend/migrations/versions/20260831_0005_data_modes.py` — миграция существующих строк в production, новые ограничения и таблица метаданных генерации.
- Modify `backend/app/db/enums.py` — `DataMode`.
- Modify `backend/app/db/base.py` — `DataModeMixin` для обязательного поля и check constraint.
- Modify `backend/app/db/models.py` — режимы бизнес-сущностей, режим сессии, demo-сотрудники, `DemoGeneration`.

**Backend authorization and scoping**

- Modify `backend/app/services/auth.py` — principal с session ID и активным режимом, запрет входа demo-сотрудников.
- Modify `backend/app/api/dependencies.py` — безопасный `DataModePrincipal`.
- Create `backend/app/schemas/data_modes.py` — запрос переключения и ответы admin API.
- Create `backend/app/api/data_modes.py` — API режима и генерации.
- Modify `backend/app/api/router.py` — регистрация нового router.
- Modify `backend/app/services/orders.py` — production-only создание и идемпотентность.
- Modify `backend/app/services/importer.py` — production-only импорт.
- Modify `backend/app/services/crm.py` — фильтрация совместимого CRM API.
- Modify `backend/app/api/crm.py` — передача активного режима.
- Modify `backend/app/api/operations.py` — фильтрация комментариев, задач, production, insights, команды и аудита.

**Generator**

- Create `backend/app/services/demo_factory.py` — чистая детерминированная модель 1000 заявок и связанных сущностей.
- Create `backend/app/services/demo_seed.py` — advisory lock, транзакционное удаление/вставка, отчёт.
- Create `backend/scripts/seed_demo.py` — CLI над seed-сервисом.

**Frontend**

- Create `site/app/lib/data-mode.ts` — типы режима и чистые UI helpers.
- Create `site/app/components/crm-data-mode-bar.tsx` — переключатель и постоянная demo-полоса.
- Create `site/app/crm/layout.tsx` — единая оболочка CRM с индикатором режима.
- Modify `site/app/crm/team/page.tsx` — управление генерацией и сводка.
- Modify `site/app/globals.css` — состояния mode bar и admin demo card.

**Tests and operations**

- Modify `backend/tests/test_schema.py` — схема и ограничения.
- Modify `backend/tests/test_orders_api.py` — production default, права и изоляция.
- Create `backend/tests/test_demo_factory.py` — воспроизводимость и бизнес-инварианты.
- Create `backend/tests/test_demo_seed.py` — транзакция, идемпотентность и защита production.
- Create `site/tests/data-mode.test.ts` — frontend helpers.
- Create `scripts/smoke-demo.ps1` — авторизованный smoke обоих режимов без вывода секрета.
- Modify `README.md`, `MEMORY.md`, `knowledge/architecture.md` — эксплуатация двух контуров.

---

### Task 1: Data-mode schema and migration — завершено

**Files:**
- Modify: `backend/app/db/enums.py`
- Modify: `backend/app/db/base.py`
- Modify: `backend/app/db/models.py`
- Create: `backend/migrations/versions/20260831_0005_data_modes.py`
- Modify: `backend/tests/test_schema.py`

**Interfaces:**
- Produces: `DataMode.PRODUCTION`, `DataMode.DEMO`, `DataModeMixin.data_mode`, `UserSession.active_data_mode`, `User.is_demo`, `DemoGeneration`.
- Consumes: revision `20260831_0004`, current SQLAlchemy naming convention.

- [x] **Step 1: Write failing metadata tests**

Add assertions that make the intended schema executable:

```python
from app.db.models import DATA_MODE_TABLES

def test_business_tables_require_data_mode() -> None:
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
    assert {"seed", "as_of", "generated_at", "count", "summary"} <= set(generation.c)
```

- [x] **Step 2: Run schema tests and verify RED**

Run:

```powershell
docker compose run --rm api pytest tests/test_schema.py -q
```

Expected: failures because `DATA_MODE_TABLES`, `active_data_mode`, `is_demo` and `demo_generations` do not exist.

- [x] **Step 3: Add model primitives**

Add to `enums.py`:

```python
class DataMode(StrEnum):
    PRODUCTION = "production"
    DEMO = "demo"
```

Add to `base.py`:

```python
from sqlalchemy import CheckConstraint, String

class DataModeMixin:
    data_mode: Mapped[str] = mapped_column(String(20), default="production", nullable=False)

    @declared_attr.directive
    def __table_args__(cls) -> tuple[CheckConstraint]:
        return (CheckConstraint("data_mode IN ('production','demo')", name="data_mode"),)
```

Where a model already defines `__table_args__`, include the same named check explicitly instead of inheriting a conflicting tuple. Export an exact constant:

```python
DATA_MODE_TABLES = {
    "customers", "orders", "order_status_history", "order_comments", "tasks",
    "outbox_events", "audit_log", "conversion_events",
}
```

Add `active_data_mode` to `UserSession`, `is_demo` to `User`, and:

```python
class DemoGeneration(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "demo_generations"
    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    as_of: Mapped[date] = mapped_column(Date, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False)
    summary: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
```

- [x] **Step 4: Write Alembic upgrade and downgrade**

Revision `20260831_0005` must:

1. add new columns with server default `production`/`false`;
2. backfill every existing business row as production;
3. make `data_mode` non-null;
4. replace customer phone uniqueness with `(data_mode, phone_normalized)`;
5. replace conversion uniqueness with `(data_mode, visitor_id, event_id)`;
6. create mode indexes used by CRM queries;
7. create `demo_generations`;
8. preserve all existing rows on downgrade by refusing downgrade if demo rows exist.

Use an explicit guard:

```python
demo_count = bind.execute(sa.text("SELECT count(*) FROM orders WHERE data_mode='demo'")).scalar_one()
if demo_count:
    raise RuntimeError("Delete demo data before downgrading 20260831_0005")
```

- [x] **Step 5: Verify model tests and migration on PostgreSQL**

Run:

```powershell
docker compose run --rm api pytest tests/test_schema.py -q
docker compose run --rm migrate alembic upgrade head
docker compose exec -T db psql -U sweet_shop -d sweet_shop -c "select version_num from alembic_version"
```

Expected: schema tests pass and Alembic reports `20260831_0005`.

- [x] **Step 6: Commit/checkpoint**

```bash
git add backend/app/db backend/migrations/versions/20260831_0005_data_modes.py backend/tests/test_schema.py
git commit -m "feat: add isolated CRM data modes"
```

---

### Task 2: Session-scoped admin mode switching — завершено

**Files:**
- Modify: `backend/app/services/auth.py`
- Modify: `backend/app/api/dependencies.py`
- Modify: `backend/app/schemas/auth.py`
- Create: `backend/app/schemas/data_modes.py`
- Create: `backend/app/api/data_modes.py`
- Modify: `backend/app/api/router.py`
- Modify: `backend/tests/test_orders_api.py`

**Interfaces:**
- Produces: `Principal.session_id: UUID`, `Principal.data_mode: str`, `set_session_data_mode(session, session_id, mode)`, `GET/POST /api/v1/admin/data-mode`.
- Consumes: `UserSession.active_data_mode`, `User.is_demo` from Task 1.

- [x] **Step 1: Add failing authorization tests**

```python
async def test_admin_switches_only_current_session_to_demo(client, database) -> None:
    await login_admin(client, database)
    changed = await client.post("/api/v1/admin/data-mode", json={"dataMode": "demo"})
    assert changed.status_code == 200
    assert changed.json() == {"dataMode": "demo", "canUseDemo": True}
    assert (await client.get("/api/v1/auth/me")).json()["dataMode"] == "demo"

async def test_viewer_cannot_enable_demo(client, database) -> None:
    await login_viewer(client, database)
    response = await client.post("/api/v1/admin/data-mode", json={"dataMode": "demo"})
    assert response.status_code == 403

async def test_demo_employee_cannot_log_in(client, database) -> None:
    await create_demo_user(database, email="demo.manager@demo.invalid")
    response = await client.post("/api/v1/auth/login", json={
        "email": "demo.manager@demo.invalid", "password": "correct horse battery staple"
    })
    assert response.status_code == 401
```

- [x] **Step 2: Run targeted tests and verify RED**

```powershell
docker compose run --rm api pytest tests/test_orders_api.py -k "data_mode or demo_employee" -q
```

Expected: routes/fields are missing and demo employee can authenticate.

- [x] **Step 3: Extend Principal and authentication**

Use the exact dataclass contract:

```python
@dataclass(frozen=True)
class Principal:
    id: UUID
    session_id: UUID
    email: str
    full_name: str
    role: str
    data_mode: str
```

`principal_for_token` selects `(User, Role, UserSession)`. Force non-admin principals to production before returning. `authenticate` adds `User.is_demo.is_(False)`.

Add:

```python
async def set_session_data_mode(
    session: AsyncSession, session_id: UUID, mode: DataMode
) -> None:
    stored = await session.get(UserSession, session_id)
    if stored is None:
        raise LookupError("Session not found")
    stored.active_data_mode = mode.value
    await session.commit()
```

- [x] **Step 4: Add Pydantic contracts and endpoints**

```python
class DataModeUpdate(BaseModel):
    dataMode: Literal["production", "demo"]

class DataModeResponse(BaseModel):
    dataMode: Literal["production", "demo"]
    canUseDemo: bool
```

The POST endpoint rejects demo unless `principal.role == "admin"`, updates only `principal.session_id`, and returns `Cache-Control: no-store`.

- [x] **Step 5: Run authorization tests**

```powershell
docker compose run --rm api pytest tests/test_orders_api.py -k "login or data_mode or demo_employee" -q
```

Expected: all selected tests pass.

- [x] **Step 6: Commit/checkpoint**

```bash
git add backend/app/services/auth.py backend/app/api backend/app/schemas backend/tests/test_orders_api.py
git commit -m "feat: restrict demo mode to admin sessions"
```

---

### Task 3: Scope all CRM reads and writes by mode — завершено

**Files:**
- Modify: `backend/app/services/crm.py`
- Modify: `backend/app/api/crm.py`
- Modify: `backend/app/api/operations.py`
- Modify: `backend/tests/test_orders_api.py`

**Interfaces:**
- Produces: every CRM service accepts `data_mode: str`; cross-mode lookup behaves as 404.
- Consumes: `Principal.data_mode` from Task 2 and model fields from Task 1.

- [x] **Step 1: Write failing cross-mode tests**

Create one production order and one demo order with different numbers, switch the admin session, then assert:

```python
production = await client.get("/api/v1/crm/orders")
assert [item["id"] for item in production.json()["orders"]] == ["SI-PROD-0001"]

await client.post("/api/v1/admin/data-mode", json={"dataMode": "demo"})
demo = await client.get("/api/v1/crm/orders")
assert [item["id"] for item in demo.json()["orders"]] == ["SI-DEMO-0001"]
assert (await client.get("/api/v1/crm/orders/SI-PROD-0001/comments")).status_code == 404
```

Also assert production and insights totals differ by mode, and demo audit does not appear in production.

- [x] **Step 2: Run isolation tests and verify RED**

```powershell
docker compose run --rm api pytest tests/test_orders_api.py -k "cross_mode or scoped" -q
```

Expected: both orders leak into the current unscoped queries.

- [x] **Step 3: Scope compatibility CRM service**

Change signatures to:

```python
async def list_legacy_orders(session: AsyncSession, data_mode: str) -> list[dict[str, Any]]
async def update_legacy_status(
    session: AsyncSession, number: str, legacy_status_value: str, data_mode: str
) -> dict[str, Any] | None
```

Every `Order`/`Customer` select includes `Order.data_mode == data_mode` and matching customer mode. Pass `_principal.data_mode` from `api/crm.py`.

- [x] **Step 4: Scope operations endpoints**

Change helper contracts:

```python
async def find_order(session: AsyncSession, number: str, data_mode: str) -> Order
def audit(
    session: AsyncSession, actor_id: UUID, data_mode: str, action: str,
    entity_type: str, entity_id: UUID | None, changes: dict[str, Any]
) -> None
```

Apply the principal mode to comments, tasks, commercial data, production calendar, insights and audit. Employee queries use:

```python
if principal.data_mode == DataMode.DEMO.value:
    staff_filter = or_(User.is_demo.is_(True), User.id == principal.id)
else:
    staff_filter = User.is_demo.is_(False)
```

All created child rows copy `data_mode=principal.data_mode`.

- [x] **Step 5: Run complete backend API tests**

```powershell
docker compose run --rm api pytest tests/test_orders_api.py -q
```

Expected: existing production tests and new isolation tests pass.

- [x] **Step 6: Commit/checkpoint**

```bash
git add backend/app/services/crm.py backend/app/api/crm.py backend/app/api/operations.py backend/tests/test_orders_api.py
git commit -m "feat: scope CRM operations by data mode"
```

---

### Task 4: Keep public orders and imports in production — завершено

**Files:**
- Modify: `backend/app/services/orders.py`
- Modify: `backend/app/services/importer.py`
- Modify: `backend/tests/test_orders_api.py`

**Interfaces:**
- Produces: `create_order(..., data_mode=DataMode.PRODUCTION.value)` invariant and production-only legacy import.
- Consumes: composite customer uniqueness and `data_mode` fields from Task 1.

- [x] **Step 1: Write failing production-routing tests**

```python
async def test_public_order_is_production_even_when_admin_session_is_demo(client, database) -> None:
    await login_admin(client, database)
    await client.post("/api/v1/admin/data-mode", json={"dataMode": "demo"})
    created = await client.post("/api/v1/orders", json=VALID_ORDER,
                                headers={"Idempotency-Key": "public-production"})
    assert created.status_code == 201
    async with database() as session:
        order = await session.scalar(select(Order).where(Order.number == created.json()["orderId"]))
        assert order.data_mode == "production"
```

Add an importer assertion that `Customer`, `Order`, `OrderStatusHistory` and `OutboxEvent` are production.

- [x] **Step 2: Run tests and verify RED**

```powershell
docker compose run --rm api pytest tests/test_orders_api.py -k "public_order_is_production or legacy_import" -q
```

Expected: missing/non-explicit mode assertions fail.

- [x] **Step 3: Add explicit production values and scoped idempotency**

In `orders.py`, use a module constant:

```python
PRODUCTION = DataMode.PRODUCTION.value
```

Set it on every created business row, and scope `existing_order` and customer lookup by production. In `importer.py`, do the same for imported rows. Do not accept a mode argument from HTTP payloads.

- [x] **Step 4: Run targeted and complete backend tests**

```powershell
docker compose run --rm api pytest tests/test_orders_api.py -q
```

Expected: all tests pass.

- [x] **Step 5: Commit/checkpoint**

```bash
git add backend/app/services/orders.py backend/app/services/importer.py backend/tests/test_orders_api.py
git commit -m "fix: keep public sales data in production"
```

---

### Task 5: Pure deterministic demo factory — завершено

**Files:**
- Create: `backend/app/services/demo_factory.py`
- Create: `backend/tests/test_demo_factory.py`

**Interfaces:**
- Produces: `DemoOptions`, `DemoDataset`, `build_demo_dataset(options)`, `validate_demo_dataset(dataset, options)`.
- Consumes: current catalog `DESSERTS` and modern order statuses.

- [x] **Step 1: Define failing deterministic tests**

```python
from datetime import date
from app.services.demo_factory import DemoOptions, build_demo_dataset, dataset_digest

OPTIONS = DemoOptions(count=1000, seed=20260831, as_of=date(2026, 8, 31))

def test_same_options_produce_same_digest() -> None:
    assert dataset_digest(build_demo_dataset(OPTIONS)) == dataset_digest(build_demo_dataset(OPTIONS))

def test_factory_builds_complete_six_month_business_dataset() -> None:
    data = build_demo_dataset(OPTIONS)
    assert len(data.orders) == 1000
    assert 700 <= len(data.customers) <= 750
    assert 7 == len(data.staff)
    assert set(order.dessert for order in data.orders) == DESSERTS
    assert set(order.status for order in data.orders) == {status.value for status in OrderStatus}
    assert min(order.created_at.date() for order in data.orders) >= date(2026, 3, 1)
    assert max(order.created_at.date() for order in data.orders) <= OPTIONS.as_of
```

Add invariant tests for 25–30% repeat orders, 2–3% Telegram failures, nonempty future production, comments/tasks ranges, and the response/conversion relationships from the spec.

- [x] **Step 2: Run tests and verify RED**

```powershell
docker compose run --rm api pytest tests/test_demo_factory.py -q
```

Expected: module does not exist.

- [x] **Step 3: Implement immutable factory contracts**

Use dataclasses with explicit fields, not ORM instances:

```python
@dataclass(frozen=True)
class DemoOptions:
    count: int = 1000
    seed: int = 20260831
    as_of: date = date(2026, 8, 31)

@dataclass(frozen=True)
class DemoDataset:
    customers: tuple[DemoCustomer, ...]
    staff: tuple[DemoStaff, ...]
    orders: tuple[DemoOrder, ...]
    histories: tuple[DemoHistory, ...]
    comments: tuple[DemoComment, ...]
    tasks: tuple[DemoTask, ...]
    conversions: tuple[DemoConversion, ...]
```

Create stable identifiers with a fixed namespace and `uuid5(namespace, logical_key)`. Use only `random.Random(options.seed)` and `options.as_of`; never call global random, `uuid4()` or current time.

- [x] **Step 4: Implement dependent distributions**

Split private helpers by decision boundary:

```python
def choose_source(random: Random, repeat: bool) -> str
def response_minutes(random: Random, source: str, created_at: datetime, load: int) -> int | None
def choose_status(random: Random, age_days: int, repeat: bool, response: int | None,
                  source: str, complexity: int) -> str
def build_status_path(final_status: str) -> tuple[str, ...]
def choose_assignee(random: Random, source: str, complexity: int) -> str | None
```

Encode the eleven approved business relationships with weighted choices plus noise. `dataset_digest` serializes sorted dataclasses with ISO dates and hashes canonical JSON using SHA-256.

- [x] **Step 5: Validate without external effects**

`validate_demo_dataset` raises `ValueError` before persistence for count, duplicate keys, invalid catalog/status values, cross-links, time order, production-calendar coverage and distribution ranges.

- [x] **Step 6: Run deterministic tests twice**

```powershell
docker compose run --rm api pytest tests/test_demo_factory.py -q
docker compose run --rm api pytest tests/test_demo_factory.py -q
```

Expected: identical passing result on both runs.

- [x] **Step 7: Commit/checkpoint**

```bash
git add backend/app/services/demo_factory.py backend/tests/test_demo_factory.py
git commit -m "feat: generate deterministic CRM demo scenarios"
```

---

### Task 6: Transactional persistence, CLI and admin generation API — завершено

**Files:**
- Create: `backend/app/services/demo_seed.py`
- Create: `backend/scripts/seed_demo.py`
- Modify: `backend/app/api/data_modes.py`
- Modify: `backend/app/schemas/data_modes.py`
- Create: `backend/tests/test_demo_seed.py`

**Interfaces:**
- Produces: `DemoSeedReport`, `seed_demo(session_factory, options)`, CLI flags `--count`, `--seed`, `--as-of`, admin `GET/POST /api/v1/admin/demo`.
- Consumes: `DemoDataset` from Task 5 and mode-scoped models from Task 1.

- [x] **Step 1: Write failing seed tests**

```python
async def test_seed_replaces_demo_and_preserves_production(database) -> None:
    await insert_production_sentinel(database, number="SI-PROD-SENTINEL")
    first = await seed_demo(database, DemoOptions(count=1000, seed=20260831,
                                                   as_of=date(2026, 8, 31)))
    second = await seed_demo(database, DemoOptions(count=1000, seed=20260831,
                                                    as_of=date(2026, 8, 31)))
    assert first.digest == second.digest
    assert await count_orders(database, "demo") == 1000
    assert await count_orders(database, "production") == 1
    assert await order_exists(database, "SI-PROD-SENTINEL")

async def test_failed_seed_rolls_back_previous_demo(database) -> None:
    baseline = await seed_demo(database, VALID_OPTIONS)
    with pytest.raises(ValueError):
        await seed_demo(database, INVALID_OPTIONS)
    assert await current_demo_digest(database) == baseline.digest
```

- [x] **Step 2: Run seed tests and verify RED**

```powershell
docker compose run --rm api pytest tests/test_demo_seed.py -q
```

Expected: `demo_seed` module missing.

- [x] **Step 3: Implement report and PostgreSQL lock**

```python
@dataclass(frozen=True)
class DemoSeedReport:
    seed: int
    as_of: date
    count: int
    digest: str
    summary: dict[str, int]
```

For PostgreSQL execute `SELECT pg_try_advisory_xact_lock(20260831)`; return a domain `DemoSeedBusyError` when false. Skip the advisory function only for SQLite tests by checking `session.bind.dialect.name`.

- [x] **Step 4: Persist the graph in one transaction**

Use `async with session.begin()` and delete demo children in explicit dependency order. Bulk-insert roles/staff/customers/orders before dependent histories/comments/tasks/conversions. Add a single `DemoGeneration` row after post-insert counts match the dataset. Do not call `commit()` inside helpers.

- [x] **Step 5: Add CLI with safe JSON summary**

`backend/scripts/seed_demo.py` parses values, constructs `DemoOptions`, calls `seed_demo(SessionFactory, options)` and prints only:

```json
{"seed":20260831,"asOf":"2026-08-31","orders":1000,"customers":728,"tasks":742,"digest":"..."}
```

No names, phones, comments or credentials are printed.

- [x] **Step 6: Add admin API**

Contracts:

```python
class DemoGenerateRequest(BaseModel):
    count: Literal[1000] = 1000
    seed: int = Field(default=20260831, ge=0, le=2_147_483_647)
    asOf: date

class DemoSummaryResponse(BaseModel):
    seed: int
    asOf: date
    generatedAt: datetime
    count: int
    digest: str
    summary: dict[str, int]
```

Map `DemoSeedBusyError` to 409. GET returns 404 with a clear message before the first generation. Both routes require admin and return `Cache-Control: no-store`.

- [x] **Step 7: Run seed and API tests**

```powershell
docker compose run --rm api pytest tests/test_demo_seed.py tests/test_orders_api.py -q
```

Expected: transaction, authorization and API tests pass.

- [x] **Step 8: Commit/checkpoint**

```bash
git add backend/app/services/demo_seed.py backend/scripts/seed_demo.py backend/app/api/data_modes.py backend/app/schemas/data_modes.py backend/tests/test_demo_seed.py
git commit -m "feat: seed demo CRM data transactionally"
```

---

### Task 7: CRM mode banner, switch and demo controls — завершено

**Files:**
- Create: `site/app/lib/data-mode.ts`
- Create: `site/app/components/crm-data-mode-bar.tsx`
- Create: `site/app/crm/layout.tsx`
- Modify: `site/app/crm/team/page.tsx`
- Modify: `site/app/globals.css`
- Create: `site/tests/data-mode.test.ts`

**Interfaces:**
- Produces: `DataMode`, `DemoSummary`, `modeLabel`, `demoConfirmation`, `CrmDataModeBar`.
- Consumes: backend admin endpoints from Tasks 2 and 6 through existing `/api/backend/[...path]` proxy.

- [x] **Step 1: Write failing frontend helper tests**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoConfirmation, modeLabel } from '../app/lib/data-mode.ts';

test('labels both isolated CRM modes', () => {
  assert.equal(modeLabel('production'), 'Реальные данные');
  assert.equal(modeLabel('demo'), 'Демо');
});

test('confirmation states that only demo data is replaced', () => {
  const text = demoConfirmation(1000);
  assert.match(text, /1000/);
  assert.match(text, /только демонстрационные/i);
  assert.doesNotMatch(text, /удал.*реальн/i);
});
```

- [x] **Step 2: Run frontend test and verify RED**

```powershell
docker compose run --rm frontend npm test -- tests/data-mode.test.ts
```

Expected: module missing.

- [x] **Step 3: Implement pure types and helpers**

```typescript
export type DataMode = 'production' | 'demo';
export type DemoSummary = {
  seed: number; asOf: string; generatedAt: string; count: number;
  digest: string; summary: Record<string, number>;
};
export const modeLabel = (mode: DataMode) => mode === 'demo' ? 'Демо' : 'Реальные данные';
export const demoConfirmation = (count: number) =>
  `Будут заменены только демонстрационные данные (${count} заявок). Реальные данные не изменятся.`;
```

- [x] **Step 4: Build the session mode bar**

`CrmDataModeBar` fetches `admin/data-mode`. A 403 hides the control for non-admin users. Admin selection POSTs the new mode, then calls `window.location.reload()` so every page reloads in the selected server context. When mode is demo, render a persistent `role="status"` strip with `ДЕМО — данные для моделирования`.

- [x] **Step 5: Add the CRM layout**

```tsx
import { CrmDataModeBar } from '@/app/components/crm-data-mode-bar';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return <><CrmDataModeBar />{children}</>;
}
```

- [x] **Step 6: Add demo management to Team**

Only after `admin/data-mode` reports `canUseDemo` render fields for seed and `asOf`, current summary and the generate button. Use `window.confirm(demoConfirmation(1000))`, POST `admin/demo/generate`, render the returned counts, and refresh team/audit data. Disable controls while running and surface 409/422 messages.

- [x] **Step 7: Add visible styles**

Use a high-contrast amber/brown demo strip that remains readable on mobile. Add `.crm-mode-bar`, `.crm-mode-demo`, `.demo-admin-card`, `.demo-summary-grid`; do not alter public storefront styles.

- [x] **Step 8: Run frontend tests and build**

```powershell
docker compose run --rm frontend npm test
docker compose build frontend
```

Expected: all node tests pass; Next.js compile, TypeScript and static generation succeed.

- [x] **Step 9: Commit/checkpoint**

```bash
git add site/app/lib/data-mode.ts site/app/components/crm-data-mode-bar.tsx site/app/crm/layout.tsx site/app/crm/team/page.tsx site/app/globals.css site/tests/data-mode.test.ts
git commit -m "feat: add admin demo mode controls"
```

---

### Task 8: Demo smoke test and operational documentation — частично завершено

**Files:**
- Create: `scripts/smoke-demo.ps1`
- Modify: `README.md`
- Modify: `MEMORY.md`
- Modify: `knowledge/architecture.md`

**Interfaces:**
- Produces: repeatable operator flow that verifies production, generates demo, checks 1000 orders, and returns the session to production.
- Consumes: mode/generation APIs and existing admin credential pattern from `scripts/smoke-release.ps1`.

- [x] **Step 1: Write a failing smoke script against the unrebuilt stack**

The script accepts `[PSCredential]$Credential`, logs in through port 3000, records production order count, switches to demo, POSTs seed/as-of/count, asserts exactly 1000 CRM orders, checks insights and production, switches back, asserts the original production count, and logs out in `finally`.

Core assertions:

```powershell
if (@($demo.orders).Count -ne 1000) { throw "Ожидалось 1000 demo-заявок." }
if ($insights.summary.orders -ne 1000) { throw "Insights смешивает режимы." }
if (@($production.orders).Count -eq 0) { throw "Календарь производства пуст." }
if (@($restored.orders).Count -ne $productionCount) { throw "Production изменён." }
```

- [x] **Step 2: Run smoke and verify RED before migration/deploy**

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-demo.ps1
```

Expected: failure because mode endpoints are unavailable in the running stack.

- [x] **Step 3: Document exact operator flow**

README must state:

- production is the default and public form target;
- demo access is admin-only;
- how to generate through UI and CLI;
- `seed + asOf` reproducibility;
- how to return to production;
- demo reset never deletes production;
- PostgreSQL remains on host port 5433 in this checkout.

Update MEMORY/architecture with the persistent design, not temporary test output.

- [x] **Step 4: Commit/checkpoint**

```bash
git add scripts/smoke-demo.ps1 README.md MEMORY.md knowledge/architecture.md
git commit -m "docs: explain isolated demo data workflow"
```

---

### Task 9: Deploy locally, generate 1000 rows and verify completion — частично завершено

**Files:**
- Runtime mutation: PostgreSQL `demo` rows only.
- Verification only: no new source files beyond Tasks 1–8.

**Interfaces:**
- Consumes: completed application and scripts.
- Produces: running local CRM with 1000 demo orders and untouched production data.

- [x] **Step 1: Capture production baseline without printing records**

Use an authenticated count request or SQL count grouped by `data_mode`. Record only counts.

- [x] **Step 2: Run complete automated verification**

```powershell
docker compose run --rm api pytest -q
docker compose run --rm api ruff check app tests scripts
docker compose run --rm frontend npm test
docker compose run --rm frontend npm run lint
docker compose build
docker compose up -d
docker compose ps
```

Expected: zero failed tests/lint errors; migration exits 0; db/api healthy; frontend running.

- [x] **Step 3: Generate the fixed acceptance dataset**

```powershell
docker compose exec api python -m scripts.seed_demo --count 1000 --seed 20260831 --as-of 2026-08-31
```

Expected: safe JSON summary with `orders: 1000` and no personal text.

- [x] **Step 4: Run production and demo smoke tests**

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-release.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-demo.ps1
```

Expected: both scripts finish successfully; demo smoke returns the session to production.

- [x] **Step 5: Verify database isolation directly**

Run a grouped count query without selecting row contents:

```sql
SELECT data_mode, count(*) FROM orders GROUP BY data_mode ORDER BY data_mode;
```

Expected: `demo = 1000`; `production` equals the captured baseline.

- [ ] **Step 6: Manual browser acceptance**

Using `http://127.0.0.1:3000/crm`:

1. confirm production is default;
2. switch to demo as admin;
3. confirm the permanent demo strip;
4. verify filters and pagination over 1000 orders;
5. open an order with comments and tasks;
6. verify nonempty analytics, SLA queue and manager load;
7. verify production calendar has past and future work;
8. verify synthetic team appears only in demo;
9. switch back and confirm production count.

- [x] **Step 7: Final checkpoint report**

Report exact test counts, build result, seed/as-of/digest, demo entity counts, production before/after count and any unverified external integrations. Never include credentials or customer payloads.
