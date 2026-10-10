"""GET /api/users/profile — статистика + достижения (Шаг 3.3)."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.achievement import Achievement, UserAchievement
from app.models.user import User
from app.schemas.auth import UserProfile

router = APIRouter(prefix="/api/users", tags=["users"])


class AchievementOut(BaseModel):
    code_name: str
    title: str
    description: str | None = None


class ProfileOut(UserProfile):
    achievements: list[AchievementOut] = []


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
    return ProfileOut(
        telegram_id=user.telegram_id,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        total_distance_km=user.total_distance_km,
        total_elevation_m=user.total_elevation_m,
        achievements=[
            AchievementOut(code_name=a.code_name, title=a.title, description=a.description)
            for a in achs
        ],
    )
