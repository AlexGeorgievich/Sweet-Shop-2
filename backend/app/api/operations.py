from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AdminPrincipal, CrmWritePrincipal, CurrentPrincipal, LeadPrincipal
from app.db.base import utc_now
from app.db.models import AuditLog, Customer, Order, OrderComment, Role, Task, User, UserSession
from app.db.session import get_session
from app.schemas.operations import (
    CommentCreate,
    CommercialUpdate,
    EmployeeCreate,
    EmployeeUpdate,
    TaskCreate,
    TaskUpdate,
)
from app.services.auth import normalize_email, password_hash

router = APIRouter(prefix="/api/v1", tags=["operations"])
Session = Annotated[AsyncSession, Depends(get_session)]
ROLES = {"admin", "lead", "manager", "viewer"}


def aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def employee_dict(user: User, role: str) -> dict[str, Any]:
    return {
        "id": str(user.id),
        "email": user.email,
        "fullName": user.full_name,
        "role": role,
        "isActive": user.is_active,
        "lastLoginAt": user.last_login_at,
    }


def audit(
    session: AsyncSession,
    actor_id: UUID,
    action: str,
    entity_type: str,
    entity_id: UUID | None,
    changes: dict[str, Any],
    data_mode: str,
) -> None:
    session.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            changes=changes,
            created_at=utc_now(),
            data_mode=data_mode,
        )
    )


async def find_order(session: AsyncSession, number: str, data_mode: str) -> Order:
    order = await session.scalar(
        select(Order).where(Order.number == number, Order.data_mode == data_mode)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена.")
    return order


def commercial_dict(order: Order, assignee: User | None) -> dict[str, Any]:
    return {
        "number": order.number,
        "amountRubles": order.amount_kopecks // 100 if order.amount_kopecks is not None else None,
        "assigneeId": str(order.assignee_id) if order.assignee_id else None,
        "assigneeName": assignee.full_name if assignee else None,
        "priority": order.priority,
        "weightGrams": order.weight_grams,
        "decor": order.decor,
        "eventDate": order.event_date,
    }


@router.get("/admin/employees")
async def list_employees(session: Session, principal: AdminPrincipal) -> dict[str, Any]:
    staff_filter = (
        or_(User.is_demo.is_(True), User.id == principal.id)
        if principal.data_mode == "demo"
        else User.is_demo.is_(False)
    )
    rows = (
        await session.execute(
            select(User, Role).join(Role).where(staff_filter).order_by(User.full_name)
        )
    ).all()
    return {"employees": [employee_dict(user, role.name) for user, role in rows]}


@router.post("/admin/employees", status_code=status.HTTP_201_CREATED)
async def create_employee(
    payload: EmployeeCreate, session: Session, principal: AdminPrincipal
) -> dict[str, Any]:
    if payload.role not in ROLES:
        raise HTTPException(status_code=422, detail="Неизвестная роль.")
    email = normalize_email(str(payload.email))
    if await session.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Сотрудник с таким email уже существует.")
    role = await session.scalar(select(Role).where(Role.name == payload.role))
    if role is None:
        raise HTTPException(status_code=409, detail="Сначала создайте системные роли.")
    user = User(
        role_id=role.id,
        email=email,
        full_name=payload.full_name.strip(),
        password_hash=password_hash.hash(payload.password),
        is_active=True,
    )
    session.add(user)
    await session.flush()
    audit(
        session,
        principal.id,
        "employee.created",
        "user",
        user.id,
        {"email": email, "role": payload.role},
        principal.data_mode,
    )
    await session.commit()
    return {"employee": employee_dict(user, role.name)}


@router.patch("/admin/employees/{user_id}")
async def update_employee(
    user_id: UUID, payload: EmployeeUpdate, session: Session, principal: AdminPrincipal
) -> dict[str, Any]:
    expected_demo = principal.data_mode == "demo"
    user = await session.scalar(
        select(User).where(
            User.id == user_id,
            or_(User.is_demo.is_(expected_demo), User.id == principal.id),
        )
    )
    if user is None:
        raise HTTPException(status_code=404, detail="Сотрудник не найден.")
    if user.id == principal.id and payload.is_active is False:
        raise HTTPException(status_code=409, detail="Нельзя отключить собственную учётную запись.")
    changes: dict[str, Any] = {}
    role = await session.get(Role, user.role_id)
    if payload.role is not None:
        if payload.role not in ROLES:
            raise HTTPException(status_code=422, detail="Неизвестная роль.")
        role = await session.scalar(select(Role).where(Role.name == payload.role))
        if role is None:
            raise HTTPException(status_code=409, detail="Роль не найдена.")
        user.role_id = role.id
        changes["role"] = payload.role
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
        changes["fullName"] = user.full_name
    if payload.is_active is not None:
        user.is_active = payload.is_active
        changes["isActive"] = payload.is_active
        if not payload.is_active:
            sessions = (
                await session.scalars(
                    select(UserSession).where(
                        UserSession.user_id == user.id, UserSession.revoked_at.is_(None)
                    )
                )
            ).all()
            for item in sessions:
                item.revoked_at = utc_now()
    if payload.password is not None:
        user.password_hash = password_hash.hash(payload.password)
        changes["password"] = "changed"
    audit(
        session,
        principal.id,
        "employee.updated",
        "user",
        user.id,
        changes,
        principal.data_mode,
    )
    await session.commit()
    return {"employee": employee_dict(user, role.name)}


@router.get("/crm/orders/{number}/comments")
async def list_comments(
    number: str, session: Session, principal: CurrentPrincipal
) -> dict[str, Any]:
    order = await find_order(session, number, principal.data_mode)
    rows = (
        await session.execute(
            select(OrderComment, User)
            .outerjoin(User, User.id == OrderComment.author_id)
            .where(
                OrderComment.order_id == order.id,
                OrderComment.data_mode == principal.data_mode,
            )
            .order_by(OrderComment.created_at)
        )
    ).all()
    return {
        "comments": [
            {
                "id": str(item.id),
                "body": item.body,
                "author": user.full_name if user else "Система",
                "createdAt": item.created_at,
            }
            for item, user in rows
        ]
    }


@router.get("/crm/staff")
async def crm_staff(session: Session, principal: CurrentPrincipal) -> dict[str, Any]:
    staff_filter = (
        or_(User.is_demo.is_(True), User.id == principal.id)
        if principal.data_mode == "demo"
        else User.is_demo.is_(False)
    )
    rows = (
        await session.execute(
            select(User, Role)
            .join(Role)
            .where(
                User.is_active.is_(True),
                Role.name.in_({"admin", "lead", "manager"}),
                staff_filter,
            )
            .order_by(User.full_name)
        )
    ).all()
    return {"employees": [employee_dict(user, role.name) for user, role in rows]}


@router.get("/crm/orders/{number}/commercial")
async def get_commercial(
    number: str, session: Session, principal: CurrentPrincipal
) -> dict[str, Any]:
    order = await find_order(session, number, principal.data_mode)
    assignee = await session.get(User, order.assignee_id) if order.assignee_id else None
    return {"commercial": commercial_dict(order, assignee)}


@router.patch("/crm/orders/{number}/commercial")
async def update_commercial(
    number: str, payload: CommercialUpdate, session: Session, principal: CrmWritePrincipal
) -> dict[str, Any]:
    order = await find_order(session, number, principal.data_mode)
    changes: dict[str, Any] = {}
    supplied = payload.model_fields_set
    if "amount_rubles" in supplied:
        order.amount_kopecks = (
            payload.amount_rubles * 100 if payload.amount_rubles is not None else None
        )
        changes["amountRubles"] = payload.amount_rubles
    if "assignee_id" in supplied:
        assignee = await session.get(User, payload.assignee_id) if payload.assignee_id else None
        if payload.assignee_id and (
            assignee is None
            or not assignee.is_active
            or (assignee.is_demo != (principal.data_mode == "demo") and assignee.id != principal.id)
        ):
            raise HTTPException(status_code=422, detail="Ответственный не найден или отключён.")
        order.assignee_id = payload.assignee_id
        changes["assigneeId"] = str(payload.assignee_id) if payload.assignee_id else None
    else:
        assignee = await session.get(User, order.assignee_id) if order.assignee_id else None
    for field, key in (
        ("priority", "priority"),
        ("weight_grams", "weightGrams"),
        ("decor", "decor"),
        ("event_date", "eventDate"),
    ):
        if field in supplied:
            value = getattr(payload, field)
            setattr(order, field, value if field != "decor" else (value or ""))
            changes[key] = value.isoformat() if isinstance(value, date) else value
    order.updated_at = utc_now()
    order.version += 1
    audit(
        session,
        principal.id,
        "order.commercial_updated",
        "order",
        order.id,
        changes,
        principal.data_mode,
    )
    await session.commit()
    return {"commercial": commercial_dict(order, assignee)}


@router.get("/crm/production")
async def production_calendar(
    session: Session,
    principal: CurrentPrincipal,
    from_date: date | None = None,
    to_date: date | None = None,
) -> dict[str, Any]:
    start = from_date or (utc_now().date() - timedelta(days=7))
    end = to_date or (utc_now().date() + timedelta(days=45))
    if end < start or (end - start).days > 180:
        raise HTTPException(status_code=422, detail="Некорректный период календаря.")
    rows = (
        await session.execute(
            select(Order, Customer, User)
            .join(Customer, Customer.id == Order.customer_id)
            .outerjoin(User, User.id == Order.assignee_id)
            .where(
                Order.event_date.between(start, end),
                Order.status != "lost",
                Order.data_mode == principal.data_mode,
                Customer.data_mode == principal.data_mode,
            )
            .order_by(Order.event_date, Order.priority.desc())
        )
    ).all()
    return {
        "from": start,
        "to": end,
        "orders": [
            {
                "number": order.number,
                "eventDate": order.event_date,
                "customer": customer.name,
                "dessert": order.dessert,
                "status": order.status,
                "amountRubles": order.amount_kopecks // 100
                if order.amount_kopecks is not None
                else None,
                "weightGrams": order.weight_grams,
                "decor": order.decor,
                "priority": order.priority,
                "assignee": user.full_name if user else None,
            }
            for order, customer, user in rows
        ],
    }


@router.post("/crm/orders/{number}/comments", status_code=201)
async def create_comment(
    number: str, payload: CommentCreate, session: Session, principal: CrmWritePrincipal
) -> dict[str, Any]:
    order = await find_order(session, number, principal.data_mode)
    item = OrderComment(
        order_id=order.id,
        author_id=principal.id,
        body=payload.body.strip(),
        is_internal=True,
        data_mode=principal.data_mode,
    )
    session.add(item)
    await session.flush()
    audit(
        session,
        principal.id,
        "comment.created",
        "order",
        order.id,
        {"commentId": str(item.id)},
        principal.data_mode,
    )
    await session.commit()
    return {
        "comment": {
            "id": str(item.id),
            "body": item.body,
            "author": principal.full_name,
            "createdAt": item.created_at,
        }
    }


@router.get("/crm/orders/{number}/tasks")
async def list_tasks(number: str, session: Session, principal: CurrentPrincipal) -> dict[str, Any]:
    order = await find_order(session, number, principal.data_mode)
    rows = (
        await session.execute(
            select(Task, User)
            .join(User, User.id == Task.assignee_id)
            .where(Task.order_id == order.id, Task.data_mode == principal.data_mode)
            .order_by(Task.due_at)
        )
    ).all()
    return {
        "tasks": [
            {
                "id": str(item.id),
                "title": item.title,
                "description": item.description,
                "dueAt": item.due_at,
                "priority": item.priority,
                "status": item.status,
                "assignee": user.full_name,
            }
            for item, user in rows
        ]
    }


@router.post("/crm/orders/{number}/tasks", status_code=201)
async def create_task(
    number: str, payload: TaskCreate, session: Session, principal: CrmWritePrincipal
) -> dict[str, Any]:
    order = await find_order(session, number, principal.data_mode)
    assignee_id = payload.assignee_id or principal.id
    assignee = await session.get(User, assignee_id)
    if (
        assignee is None
        or not assignee.is_active
        or (assignee.is_demo != (principal.data_mode == "demo") and assignee.id != principal.id)
    ):
        raise HTTPException(status_code=422, detail="Исполнитель не найден или отключён.")
    item = Task(
        order_id=order.id,
        assignee_id=assignee_id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        due_at=payload.due_at,
        priority=payload.priority,
        status="open",
        data_mode=principal.data_mode,
    )
    session.add(item)
    await session.flush()
    audit(
        session,
        principal.id,
        "task.created",
        "task",
        item.id,
        {"order": number},
        principal.data_mode,
    )
    await session.commit()
    return {"task": {"id": str(item.id), "title": item.title, "status": item.status}}


@router.patch("/crm/tasks/{task_id}")
async def update_task(
    task_id: UUID, payload: TaskUpdate, session: Session, principal: CrmWritePrincipal
) -> dict[str, Any]:
    if payload.status not in {"open", "done", "cancelled"}:
        raise HTTPException(status_code=422, detail="Неизвестный статус задачи.")
    item = await session.scalar(
        select(Task).where(Task.id == task_id, Task.data_mode == principal.data_mode)
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Задача не найдена.")
    item.status = payload.status
    item.completed_at = utc_now() if payload.status == "done" else None
    audit(
        session,
        principal.id,
        "task.updated",
        "task",
        item.id,
        {"status": payload.status},
        principal.data_mode,
    )
    await session.commit()
    return {"task": {"id": str(item.id), "status": item.status}}


@router.get("/admin/audit")
async def list_audit(session: Session, principal: LeadPrincipal) -> dict[str, Any]:
    rows = (
        await session.execute(
            select(AuditLog, User)
            .outerjoin(User, User.id == AuditLog.actor_id)
            .where(AuditLog.data_mode == principal.data_mode)
            .order_by(AuditLog.created_at.desc())
            .limit(200)
        )
    ).all()
    return {
        "events": [
            {
                "id": str(item.id),
                "action": item.action,
                "entityType": item.entity_type,
                "entityId": str(item.entity_id) if item.entity_id else None,
                "actor": user.full_name if user else "Система",
                "changes": item.changes,
                "createdAt": item.created_at,
            }
            for item, user in rows
        ]
    }


@router.get("/crm/insights")
async def crm_insights(session: Session, principal: CurrentPrincipal) -> dict[str, Any]:
    now = utc_now()
    orders = (
        await session.scalars(select(Order).where(Order.data_mode == principal.data_mode))
    ).all()
    tasks = (
        await session.scalars(select(Task).where(Task.data_mode == principal.data_mode))
    ).all()
    users = {user.id: user.full_name for user in (await session.scalars(select(User))).all()}
    answered = [order for order in orders if order.first_response_at is not None]
    response_minutes = [
        max(
            0,
            round(
                (aware(order.first_response_at).timestamp() - aware(order.created_at).timestamp())
                / 60
            ),
        )
        for order in answered
        if order.first_response_at is not None
    ]
    sla_breaches = [
        order
        for order in orders
        if order.first_response_at is None
        and order.status in {"new", "assigned"}
        and aware(order.created_at) < now - timedelta(minutes=15)
    ]
    stale = [
        order
        for order in orders
        if order.status not in {"paid", "production", "ready", "completed", "lost"}
        and aware(order.updated_at) < now - timedelta(hours=24)
    ]
    overdue = [task for task in tasks if task.status == "open" and aware(task.due_at) < now]
    paid = sum(order.status in {"paid", "production", "ready", "completed"} for order in orders)
    lost = sum(order.status == "lost" for order in orders)
    active = max(0, len(orders) - paid - lost)
    manager_rows: dict[str, dict[str, Any]] = {}
    for order in orders:
        name = users.get(order.assignee_id, "Без исполнителя")
        row = manager_rows.setdefault(
            name, {"manager": name, "orders": 0, "paid": 0, "overdueTasks": 0}
        )
        row["orders"] += 1
        row["paid"] += int(order.status in {"paid", "production", "ready", "completed"})
    for task in overdue:
        name = users.get(task.assignee_id, "Без исполнителя")
        row = manager_rows.setdefault(
            name, {"manager": name, "orders": 0, "paid": 0, "overdueTasks": 0}
        )
        row["overdueTasks"] += 1
    return {
        "summary": {
            "orders": len(orders),
            "paid": paid,
            "active": active,
            "lost": lost,
            "conversion": round(paid / len(orders), 4) if orders else 0,
            "averageResponseMinutes": round(sum(response_minutes) / len(response_minutes))
            if response_minutes
            else None,
            "slaBreaches": len(sla_breaches),
            "openTasks": sum(task.status == "open" for task in tasks),
            "overdueTasks": len(overdue),
            "staleOrders": len(stale),
        },
        "attention": [
            {
                "number": order.number,
                "kind": "sla",
                "label": "Нет ответа более 15 минут",
                "minutes": round((now.timestamp() - aware(order.created_at).timestamp()) / 60),
            }
            for order in sla_breaches[:20]
        ]
        + [
            {
                "number": order.number,
                "kind": "stale",
                "label": "Нет движения более 24 часов",
                "minutes": round((now.timestamp() - aware(order.updated_at).timestamp()) / 60),
            }
            for order in stale[:20]
        ],
        "managers": sorted(
            manager_rows.values(), key=lambda item: (-item["overdueTasks"], -item["orders"])
        ),
    }
