import asyncio
import os

from sqlalchemy import select

from app.db.enums import UserRole
from app.db.models import Role, User
from app.db.session import SessionFactory
from app.services.auth import normalize_email, password_hash

ROLE_DESCRIPTIONS = {
    UserRole.ADMIN.value: "Полный доступ и управление сотрудниками",
    UserRole.LEAD.value: "Все заказы, аналитика и распределение",
    UserRole.MANAGER.value: "Работа с назначенными и доступными заказами",
    UserRole.VIEWER.value: "Только чтение и аналитика",
}


async def run() -> None:
    email = normalize_email(os.environ.get("ADMIN_EMAIL", ""))
    password = os.environ.get("ADMIN_PASSWORD", "")
    full_name = os.environ.get("ADMIN_FULL_NAME", "Администратор").strip()
    if not email or "@" not in email:
        raise SystemExit("ADMIN_EMAIL is required.")
    if len(password) < 12:
        raise SystemExit("ADMIN_PASSWORD must contain at least 12 characters.")

    async with SessionFactory() as session:
        roles: dict[str, Role] = {}
        for name, description in ROLE_DESCRIPTIONS.items():
            role = await session.scalar(select(Role).where(Role.name == name))
            if role is None:
                role = Role(name=name, description=description)
                session.add(role)
                await session.flush()
            roles[name] = role

        user = await session.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                role_id=roles[UserRole.ADMIN.value].id,
                email=email,
                password_hash=password_hash.hash(password),
                full_name=full_name,
                is_active=True,
            )
            session.add(user)
            action = "created"
        else:
            user.role_id = roles[UserRole.ADMIN.value].id
            user.password_hash = password_hash.hash(password)
            user.full_name = full_name
            user.is_active = True
            action = "updated"
        await session.commit()
    print(f"Administrator {email} {action}.")


if __name__ == "__main__":
    asyncio.run(run())
