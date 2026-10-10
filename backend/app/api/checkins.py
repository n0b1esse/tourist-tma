"""Чек-ины: быстрый чек-ин в радиусе локации (ТЗ §4Б) + бейджи и пуши.

POST /api/checkins — создать чек-ин (проверяет радиус 300 м до точки, если есть координаты).
GET /api/checkins/my — мои чек-ины.
"""

import math

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.notifier import notify_badge
from app.models.achievement import Achievement, UserAchievement
from app.models.checkin import Checkin
from app.models.user import User
from app.models.waypoint import Waypoint
from app.schemas.checkin import CheckinCreate, CheckinOut

router = APIRouter(prefix="/api/checkins", tags=["checkins"])

# Радиус быстрого чек-ина в метрах (ТЗ §4Б: кнопка при нахождении в радиусе)
CHECKIN_RADIUS_M = 300.0


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


async def _maybe_award(user: User, db: AsyncSession) -> list[str]:
    """Бейджи ТЗ §4В + Fitness: хайки, высота, шаги, марафон."""
    awarded: list[str] = []
    total_checkins = (
        await db.execute(select(func.count()).select_from(Checkin).where(Checkin.telegram_id == user.telegram_id))
    ).scalar() or 0

    rules = [
        ("first_hike", "Первый хайк", total_checkins >= 1),
        ("conqueror_3000", "Покоритель 3000м", (user.total_elevation_m or 0) >= 3000),
        ("bishkek_legend", "Легенда Бишкека", total_checkins >= 10),
        # Fitness-бейджи (шаги и дистанция)
        ("first_10k_steps", "Первые 10 000 шагов", (user.total_steps or 0) >= 10000),
        ("marathon_50k", "Марафонец (50 км)", (user.total_distance_km or 0) >= 50),
        ("trail_conqueror", "Покоритель троп", (user.total_hikes or 0) >= 5),
        ("early_bird_50k_steps", "Шагомер PRO", (user.total_steps or 0) >= 50000),
        ("calorie_burner", "Сжигатель калорий", (user.total_calories or 0) >= 2000),
    ]
    for code, title, ok in rules:
        if not ok:
            continue
        ach = (await db.execute(select(Achievement).where(Achievement.code_name == code))).scalars().first()
        if ach is None:
            ach = Achievement(code_name=code, title=title, description="Автобейдж за чек-ины")
            db.add(ach)
            await db.flush()
        exists = (
            await db.execute(
                select(UserAchievement).where(
                    UserAchievement.telegram_id == user.telegram_id,
                    UserAchievement.achievement_id == ach.id,
                )
            )
        ).scalars().first()
        if exists is None:
            db.add(UserAchievement(telegram_id=user.telegram_id, achievement_id=ach.id))
            awarded.append(title)
    if awarded:
        await db.commit()
    return awarded


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_checkin(
    body: CheckinCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if bool(getattr(user, "is_blocked", False)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Пользователь заблокирован")
    if body.waypoint_id is None and body.route_id is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Нужен waypoint_id или route_id")

    # Проверка радиуса: если юзер прислал GPS и чек-инится в точку — не дальше 300 м
    if body.waypoint_id is not None and body.latitude is not None and body.longitude is not None:
        wp = await db.get(Waypoint, body.waypoint_id)
        if wp is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Точка не найдена")
        latlon = (
            await db.execute(
                select(func.ST_Y(Waypoint.coordinates), func.ST_X(Waypoint.coordinates)).where(
                    Waypoint.id == wp.id
                )
            )
        ).one()
        dist = _haversine_m(body.latitude, body.longitude, float(latlon[0]), float(latlon[1]))
        if dist > CHECKIN_RADIUS_M:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ты далеко от точки ({int(dist)} м). Подойди ближе {int(CHECKIN_RADIUS_M)} м.",
            )

    row = Checkin(
        telegram_id=user.telegram_id,
        waypoint_id=body.waypoint_id,
        route_id=body.route_id,
        latitude=body.latitude,
        longitude=body.longitude,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    awarded = await _maybe_award(user, db)
    # Пуш о бейдже — best-effort (ТЗ §5Б)
    for title in awarded:
        try:
            await notify_badge(user.telegram_id, title)
        except Exception:
            pass
    return {
        "checkin": CheckinOut(
            id=row.id, telegram_id=row.telegram_id, waypoint_id=row.waypoint_id,
            route_id=row.route_id, latitude=row.latitude, longitude=row.longitude,
            created_at=row.created_at,
        ).model_dump(),
        "awarded": awarded,
    }


@router.get("/my", response_model=list[CheckinOut])
async def my_checkins(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(Checkin).where(Checkin.telegram_id == user.telegram_id).order_by(Checkin.id.desc()).limit(200)
        )
    ).scalars().all()
    return [
        CheckinOut(
            id=r.id, telegram_id=r.telegram_id, waypoint_id=r.waypoint_id, route_id=r.route_id,
            latitude=r.latitude, longitude=r.longitude, created_at=r.created_at,
        )
        for r in rows
    ]
