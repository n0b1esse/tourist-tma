"""Реестр схем."""

from app.schemas.auth import InitDataRequest, UserProfile
from app.schemas.route import RouteDetail, RouteOut
from app.schemas.waypoint import ModerateRequest, WaypointCreate, WaypointOut

__all__ = [
    "InitDataRequest",
    "ModerateRequest",
    "RouteDetail",
    "RouteOut",
    "UserProfile",
    "WaypointCreate",
    "WaypointOut",
]
