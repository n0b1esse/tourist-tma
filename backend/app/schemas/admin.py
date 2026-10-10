"""Схемы админ-панели супер-админа (ТЗ §3)."""

from pydantic import BaseModel, Field

from app.models.enums import UserRole


class AdminUserOut(BaseModel):
    telegram_id: int
    username: str | None = None
    full_name: str | None = None
    role: UserRole
    is_blocked: bool = False
    total_distance_km: float = 0.0
    total_elevation_m: int = 0


class AdminUserList(BaseModel):
    items: list[AdminUserOut]
    total: int
    page: int
    page_size: int


class RoleUpdate(BaseModel):
    role: UserRole = Field(description="user | tester | admin | super_admin")


class StatusUpdate(BaseModel):
    is_blocked: bool = Field(description="True — заблокировать, False — разблокировать")


class StatsOut(BaseModel):
    total_users: int
    active_users: int
    blocked_users: int
    by_role: dict[str, int]
    total_checkins: int
    total_routes: int
    total_waypoints: int
    published_waypoints: int
    draft_waypoints: int
    total_tickets_open: int


class NotificationRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    role_filter: UserRole | None = Field(
        default=None, description="Разослать только этой роли (null — всем)"
    )
