from collections.abc import AsyncIterator
from datetime import date

import pytest
import pytest_asyncio
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.db.models import Customer, DemoGeneration, Order
from app.services.demo_factory import DemoOptions
from app.services.demo_seed import seed_demo

pytestmark = pytest.mark.asyncio
OPTIONS = DemoOptions(count=1000, seed=20260831, as_of=date(2026, 8, 31))


@pytest_asyncio.fixture
async def database() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.execute(text("PRAGMA foreign_keys=ON"))
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


async def count_orders(
    database: async_sessionmaker[AsyncSession],
    data_mode: str,
) -> int:
    async with database() as session:
        return int(
            await session.scalar(
                select(func.count()).select_from(Order).where(Order.data_mode == data_mode)
            )
            or 0
        )


async def insert_production_sentinel(
    database: async_sessionmaker[AsyncSession],
) -> None:
    async with database() as session:
        customer = Customer(
            name="Контрольный production-клиент",
            phone_normalized="+79991112233",
            phone_display="+7 999 111-22-33",
            data_mode="production",
        )
        session.add(customer)
        await session.flush()
        session.add(
            Order(
                number="SI-PROD-SENTINEL",
                customer_id=customer.id,
                dessert="Торты на заказ",
                event_date=date(2026, 9, 15),
                guests=12,
                data_mode="production",
            )
        )
        await session.commit()


async def test_seed_replaces_demo_and_preserves_production(
    database: async_sessionmaker[AsyncSession],
) -> None:
    await insert_production_sentinel(database)

    first = await seed_demo(database, OPTIONS)
    second = await seed_demo(database, OPTIONS)

    assert first.digest == second.digest
    assert first.summary["orders"] == 1000
    assert first.summary["customers"] == 728
    assert await count_orders(database, "demo") == 1000
    assert await count_orders(database, "production") == 1
    async with database() as session:
        sentinel = await session.scalar(
            select(Order).where(Order.number == "SI-PROD-SENTINEL")
        )
        generations = int(
            await session.scalar(select(func.count()).select_from(DemoGeneration)) or 0
        )
    assert sentinel is not None
    assert generations == 1


async def test_invalid_seed_keeps_previous_demo_dataset(
    database: async_sessionmaker[AsyncSession],
) -> None:
    baseline = await seed_demo(database, OPTIONS)

    with pytest.raises(ValueError, match="1000"):
        await seed_demo(
            database,
            DemoOptions(count=999, seed=OPTIONS.seed, as_of=OPTIONS.as_of),
        )

    assert await count_orders(database, "demo") == 1000
    async with database() as session:
        generation = await session.scalar(select(DemoGeneration))
    assert generation is not None
    assert generation.summary["digest"] == baseline.digest
