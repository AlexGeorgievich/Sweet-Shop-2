from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.base import utc_now
from app.db.models import (
    AuditLog,
    ConversionEvent,
    Customer,
    DemoGeneration,
    Order,
    OrderComment,
    OrderStatusHistory,
    OutboxEvent,
    Role,
    Task,
    User,
)
from app.services.demo_factory import DemoOptions, build_demo_dataset, dataset_digest, stable_id

DEMO = "demo"
ADVISORY_LOCK_KEY = 20260831


class DemoSeedBusyError(Exception):
    pass


@dataclass(frozen=True)
class DemoSeedReport:
    seed: int
    as_of: date
    generated_at: datetime
    count: int
    digest: str
    summary: dict[str, int]


async def acquire_generation_lock(session: AsyncSession) -> None:
    bind = session.get_bind()
    if bind.dialect.name != "postgresql":
        return
    acquired = await session.scalar(
        text("SELECT pg_try_advisory_xact_lock(:key)").bindparams(key=ADVISORY_LOCK_KEY)
    )
    if not acquired:
        raise DemoSeedBusyError("Демонстрационные данные уже генерируются.")


async def delete_previous_demo(session: AsyncSession) -> None:
    for model in (
        ConversionEvent,
        OrderComment,
        OrderStatusHistory,
        Task,
        AuditLog,
        OutboxEvent,
        Order,
        Customer,
    ):
        await session.execute(delete(model).where(model.data_mode == DEMO))
    await session.execute(delete(User).where(User.is_demo.is_(True)))
    await session.execute(delete(DemoGeneration))


async def ensure_roles(session: AsyncSession) -> dict[str, Role]:
    roles = {
        role.name: role
        for role in (await session.scalars(select(Role))).all()
    }
    for name, description in (
        ("admin", "Администратор"),
        ("lead", "Руководитель"),
        ("manager", "Менеджер"),
        ("viewer", "Наблюдатель"),
    ):
        if name not in roles:
            role = Role(
                id=stable_id("role", name),
                name=name,
                description=description,
            )
            session.add(role)
            roles[name] = role
    await session.flush()
    return roles


async def seed_demo(
    session_factory: async_sessionmaker[AsyncSession],
    options: DemoOptions,
) -> DemoSeedReport:
    dataset = build_demo_dataset(options)
    digest = dataset_digest(dataset)
    generated_at = utc_now()
    summary = {
        "staff": len(dataset.staff),
        "customers": len(dataset.customers),
        "orders": len(dataset.orders),
        "histories": len(dataset.histories),
        "comments": len(dataset.comments),
        "tasks": len(dataset.tasks),
        "conversions": len(dataset.conversions),
        "audits": len(dataset.histories),
    }

    async with session_factory() as session:  # noqa: SIM117 - transaction belongs to session
        async with session.begin():
            await acquire_generation_lock(session)
            await delete_previous_demo(session)
            roles = await ensure_roles(session)

            staff_created_at = datetime.combine(
                options.as_of,
                datetime.min.time(),
                tzinfo=dataset.orders[0].created_at.tzinfo,
            )
            session.add_all(
                [
                    User(
                        id=item.id,
                        role_id=roles[item.role].id,
                        email=item.email,
                        password_hash="demo-login-disabled",
                        full_name=item.full_name,
                        is_active=True,
                        is_demo=True,
                        created_at=staff_created_at,
                        updated_at=staff_created_at,
                    )
                    for item in dataset.staff
                ]
            )
            await session.flush()
            session.add_all(
                [
                    Customer(
                        id=item.id,
                        name=item.name,
                        phone_normalized=item.phone_normalized,
                        phone_display=item.phone_display,
                        preferred_channel=item.preferred_channel,
                        tags=list(item.tags),
                        data_mode=DEMO,
                        created_at=item.created_at,
                        updated_at=item.created_at,
                    )
                    for item in dataset.customers
                ]
            )
            await session.flush()
            session.add_all(
                [
                    Order(
                        id=item.id,
                        number=item.number,
                        customer_id=item.customer_id,
                        assignee_id=item.assignee_id,
                        dessert=item.dessert,
                        event_date=item.event_date,
                        guests=item.guests,
                        details=item.details,
                        prize=item.prize,
                        consultant_summary=item.consultant_summary,
                        source=item.source,
                        amount_kopecks=item.amount_kopecks,
                        status=item.status,
                        priority=item.priority,
                        first_response_at=item.first_response_at,
                        weight_grams=item.weight_grams,
                        decor=item.decor,
                        customer_type=item.customer_type,
                        telegram_delivered=item.telegram_delivered,
                        telegram_delivered_at=item.telegram_delivered_at,
                        telegram_last_error=item.telegram_last_error,
                        data_mode=DEMO,
                        created_at=item.created_at,
                        updated_at=item.updated_at,
                    )
                    for item in dataset.orders
                ]
            )
            await session.flush()
            session.add_all(
                [
                    OrderStatusHistory(
                        id=item.id,
                        order_id=item.order_id,
                        actor_id=item.actor_id,
                        from_status=item.from_status,
                        to_status=item.to_status,
                        reason=item.reason,
                        comment=item.comment,
                        created_at=item.created_at,
                        data_mode=DEMO,
                    )
                    for item in dataset.histories
                ]
            )
            session.add_all(
                [
                    OrderComment(
                        id=item.id,
                        order_id=item.order_id,
                        author_id=item.author_id,
                        body=item.body,
                        is_internal=True,
                        data_mode=DEMO,
                        created_at=item.created_at,
                        updated_at=item.created_at,
                    )
                    for item in dataset.comments
                ]
            )
            session.add_all(
                [
                    Task(
                        id=item.id,
                        order_id=item.order_id,
                        customer_id=item.customer_id,
                        assignee_id=item.assignee_id,
                        title=item.title,
                        description=item.description,
                        due_at=item.due_at,
                        priority=item.priority,
                        status=item.status,
                        completed_at=item.completed_at,
                        data_mode=DEMO,
                        created_at=item.created_at,
                        updated_at=item.created_at,
                    )
                    for item in dataset.tasks
                ]
            )
            session.add_all(
                [
                    ConversionEvent(
                        id=item.id,
                        event_id=item.event_id,
                        visitor_id=item.visitor_id,
                        session_id=item.session_id,
                        order_id=item.order_id,
                        name=item.name,
                        source=item.source,
                        campaign=item.campaign,
                        properties=item.properties,
                        created_at=item.created_at,
                        data_mode=DEMO,
                    )
                    for item in dataset.conversions
                ]
            )
            session.add_all(
                [
                    AuditLog(
                        id=stable_id("audit", str(index)),
                        actor_id=item.actor_id,
                        action="demo.order_status_changed",
                        entity_type="order",
                        entity_id=item.order_id,
                        changes={"from": item.from_status, "to": item.to_status},
                        created_at=item.created_at,
                        data_mode=DEMO,
                    )
                    for index, item in enumerate(dataset.histories)
                ]
            )
            await session.flush()
            stored_orders = int(
                await session.scalar(
                    select(func.count()).select_from(Order).where(Order.data_mode == DEMO)
                )
                or 0
            )
            if stored_orders != options.count:
                raise ValueError("Количество записанных demo-заявок не совпало с ожидаемым.")
            session.add(
                DemoGeneration(
                    seed=options.seed,
                    as_of=options.as_of,
                    generated_at=generated_at,
                    count=options.count,
                    summary={**summary, "digest": digest},
                )
            )

    return DemoSeedReport(
        seed=options.seed,
        as_of=options.as_of,
        generated_at=generated_at,
        count=options.count,
        digest=digest,
        summary=summary,
    )
