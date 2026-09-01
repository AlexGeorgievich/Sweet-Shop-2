from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class EmployeeCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=12, max_length=200)
    role: str


class EmployeeUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    role: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=12, max_length=200)


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class TaskCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=4000)
    due_at: datetime
    assignee_id: UUID | None = None
    priority: int = Field(default=0, ge=0, le=3)


class TaskUpdate(BaseModel):
    status: str


class CommercialUpdate(BaseModel):
    amount_rubles: int | None = Field(default=None, ge=0, le=100_000_000)
    assignee_id: UUID | None = None
    priority: int | None = Field(default=None, ge=0, le=3)
    weight_grams: int | None = Field(default=None, ge=1, le=1_000_000)
    decor: str | None = Field(default=None, max_length=200)
    event_date: date | None = None
