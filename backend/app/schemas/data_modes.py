from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.db.enums import DataMode


class DataModeRequest(BaseModel):
    dataMode: DataMode


class DataModeResponse(BaseModel):
    dataMode: DataMode
    canUseDemo: bool


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
