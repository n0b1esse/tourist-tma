"""Pydantic-схемы routes (Шаг 3 + ТЗ §3: CRUD гида/админа)."""

from pydantic import BaseModel, Field

from app.schemas.waypoint import WaypointOut


class RouteOut(BaseModel):
    id: int
    title: str
    description: str | None = None
    difficulty: str
    distance_km: float
    elevation_gain_m: int
    estimated_time: str | None = None
    max_elevation_m: int | None = None
    gpx_wkt: str | None = None  # ST_AsText(gpx_data), высотный профиль — Шаг 5
    rating: float | None = None


class RouteDetail(RouteOut):
    published_waypoints: list[WaypointOut] = []


class RouteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    difficulty: str = Field(default="Средний", description="Легкий|Средний|Сложный|Экстремальный")
    distance_km: float = Field(ge=0)
    elevation_gain_m: int = Field(ge=0)
    estimated_time: str | None = None
    max_elevation_m: int | None = None


class RouteUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    description: str | None = None
    difficulty: str | None = None
    distance_km: float | None = Field(default=None, ge=0)
    elevation_gain_m: int | None = Field(default=None, ge=0)
    estimated_time: str | None = None
    max_elevation_m: int | None = None
