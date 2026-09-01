import hashlib
import secrets
from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID

from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utc_now
from app.db.enums import DataMode
from app.db.models import Role, User, UserSession

password_hash = PasswordHash.recommended()


@dataclass(frozen=True)
class Principal:
    id: UUID
    session_id: UUID
    email: str
    full_name: str
    role: str
    data_mode: str


def normalize_email(value: str) -> str:
    return value.strip().lower()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def authenticate(session: AsyncSession, email: str, password: str) -> User | None:
    user = await session.scalar(
        select(User).where(
            User.email == normalize_email(email),
            User.is_active.is_(True),
            User.is_demo.is_(False),
        )
    )
    if user is None or not password_hash.verify(password, user.password_hash):
        return None
    user.last_login_at = utc_now()
    return user


async def create_session(session: AsyncSession, user: User, hours: int) -> str:
    token = secrets.token_urlsafe(48)
    now = utc_now()
    session.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_token(token),
            created_at=now,
            expires_at=now + timedelta(hours=hours),
            last_seen_at=now,
        )
    )
    await session.commit()
    return token


async def principal_for_token(session: AsyncSession, token: str) -> Principal | None:
    row = (
        await session.execute(
            select(User, Role, UserSession)
            .join(Role, Role.id == User.role_id)
            .join(UserSession, UserSession.user_id == User.id)
            .where(
                UserSession.token_hash == hash_token(token),
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > utc_now(),
                User.is_active.is_(True),
            )
        )
    ).one_or_none()
    if row is None:
        return None
    user, role, stored_session = row
    data_mode = (
        stored_session.active_data_mode
        if role.name == "admin"
        else DataMode.PRODUCTION.value
    )
    return Principal(
        id=user.id,
        session_id=stored_session.id,
        email=user.email,
        full_name=user.full_name,
        role=role.name,
        data_mode=data_mode,
    )


async def revoke_session(session: AsyncSession, token: str) -> None:
    stored = await session.scalar(
        select(UserSession).where(UserSession.token_hash == hash_token(token))
    )
    if stored and stored.revoked_at is None:
        stored.revoked_at = utc_now()
        await session.commit()
