"""Реестр моделей — импортируется в Alembic env.py и API."""

from app.models.achievement import Achievement, UserAchievement
from app.models.activity import StepLog
from app.models.checkin import Checkin, Ticket
from app.models.enums import ActivityType, ContentStatus, DifficultyLevel, UserRole, WaypointType
from app.models.route import Route
from app.models.user import User
from app.models.waypoint import Waypoint

__all__ = [
    "Achievement",
    "ActivityType",
    "Checkin",
    "ContentStatus",
    "DifficultyLevel",
    "Route",
    "StepLog",
    "Ticket",
    "User",
    "UserAchievement",
    "UserRole",
    "Waypoint",
    "WaypointType",
]
