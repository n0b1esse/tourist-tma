"""Схемы чек-инов и тикетов (ТЗ §2, §4Б, §5А)."""

from datetime import datetime

from pydantic import BaseModel, Field


class CheckinCreate(BaseModel):
    waypoint_id: int | None = None
    route_id: int | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class CheckinOut(BaseModel):
    id: int
    telegram_id: int
    waypoint_id: int | None = None
    route_id: int | None = None
    latitude: float | None = None
    longitude: float | None = None
    created_at: datetime | None = None


class TicketCreate(BaseModel):
    kind: str = Field(default="feedback", description="feedback | bug")
    subject: str | None = Field(default=None, max_length=255)
    message: str = Field(min_length=1, max_length=4000)


class TicketOut(BaseModel):
    id: int
    telegram_id: int | None = None
    kind: str
    subject: str | None = None
    message: str
    status: str
