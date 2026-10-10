"""Pydantic-схемы waypoints (Шаг 3). Координаты — lat/lon, геометрия остаётся в БД."""

from pydantic import BaseModel, Field

from app.models.enums import ContentStatus, WaypointType


class WaypointOut(BaseModel):
    id: int
    route_id: int | None = None
    type: WaypointType
    latitude: float
    longitude: float
    title: str | None = None
    description: str | None = None
    photo_url: str | None = None
    status: ContentStatus


class WaypointCreate(BaseModel):
    route_id: int | None = None
    type: WaypointType
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    title: str | None = None
    description: str | None = None
    photo_url: str | None = None


class ModerateRequest(BaseModel):
    status: ContentStatus  # admin ставит published / rejected


class WaypointUpdate(BaseModel):
    """Редактирование точки прямо на карте (админка, ТЗ §3)."""

    title: str | None = None
    description: str | None = None
    type: WaypointType | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
