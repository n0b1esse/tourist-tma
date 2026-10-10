"""Реестр моделей — импортируется в Alembic env.py и API."""

from app.models.achievement import Achievement, UserAchievement
from app.models.checkin import Checkin, Ticket
from app.models.enums import ContentStatus, DifficultyLevel, UserRole, WaypointType
from app.models.route import Route
from app.models.user import User
from app.models.waypoint import Waypoint

__all__ = [
    "Achievement",
    "Checkin",
    "ContentStatus",
    "DifficultyLevel",
    "Route",
    "Ticket",
    "User",
    "UserAchievement",
    "UserRole",
    "Waypoint",
    "WaypointType",
]
