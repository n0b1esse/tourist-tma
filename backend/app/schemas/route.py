"""Pydantic-схемы routes (Шаг 3)."""

from pydantic import BaseModel

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


class RouteDetail(RouteOut):
    published_waypoints: list[WaypointOut] = []
