"""GET /api/users/profile — статистика + достижения (Шаг 3.3 + ТЗ §4В)."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.achievement import Achievement, UserAchievement
from app.models.checkin import Checkin
from app.models.route import Route
from app.models.user import User
from app.schemas.auth import UserProfile

router = APIRouter(prefix="/api/users", tags=["users"])


class AchievementOut(BaseModel):
    code_name: str
    title: str
    description: str | None = None


class ProfileOut(UserProfile):
    achievements: list[AchievementOut] = []
    checkins_count: int = 0
    visited_locations: int = 0
    my_routes_count: int = 0


@router.get("/profile", response_model=ProfileOut)
async def my_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Achievement)
        .join(UserAchievement, UserAchievement.achievement_id == Achievement.id)
        .where(UserAchievement.telegram_id == user.telegram_id)
        .order_by(Achievement.id)
    )
    achs = (await db.execute(stmt)).scalars().all()
    checkins_count = (
        await db.execute(
            select(func.count()).select_from(Checkin).where(Checkin.telegram_id == user.telegram_id)
        )
    ).scalar() or 0
    visited_locations = (
        await db.execute(
            select(func.count(func.distinct(Checkin.waypoint_id))).where(
                Checkin.telegram_id == user.telegram_id, Checkin.waypoint_id.is_not(None)
            )
        )
    ).scalar() or 0
    my_routes_count = (
        await db.execute(
            select(func.count()).select_from(Route).where(Route.author_id == user.telegram_id)
        )
    ).scalar() or 0
    return ProfileOut(
        telegram_id=user.telegram_id,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        is_blocked=bool(getattr(user, "is_blocked", False)),
        total_distance_km=user.total_distance_km,
        total_elevation_m=user.total_elevation_m,
        total_steps=int(getattr(user, "total_steps", 0) or 0),
        total_calories=float(getattr(user, "total_calories", 0.0) or 0.0),
        total_hikes=int(getattr(user, "total_hikes", 0) or 0),
        achievements=[
            AchievementOut(code_name=a.code_name, title=a.title, description=a.description)
            for a in achs
        ],
        checkins_count=checkins_count,
        visited_locations=visited_locations,
        my_routes_count=my_routes_count,
    )
