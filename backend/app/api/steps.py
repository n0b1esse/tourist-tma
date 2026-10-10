"""Шагомер: суточные логи шагов + статистика (сегодня / неделя / месяц).

POST /api/steps/log — записать/накапливать шаги за день (фронт шлёт дельту шагомера
или GPS-фолбэк). Обновляет users.total_steps/total_calories и step_logs.
GET /api/steps/stats?range=today|week|month — агрегаты для виджета и графиков.
GET /api/steps/my?days=30 — сырые ряды для графиков.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.notifier import notify_badge
from app.models.achievement import Achievement, UserAchievement
from app.models.activity import StepLog
from app.models.user import User

router = APIRouter(prefix="/api/steps", tags=["steps"])


class StepLogIn(BaseModel):
    steps: int = Field(ge=0, le=200000)
    distance_km: float = Field(default=0.0, ge=0, le=500)
    calories: float = Field(default=0.0, ge=0, le=20000)
    log_date: date | None = None


class StepLogOut(BaseModel):
    log_date: date
    steps: int
    distance_km: float
    calories: float


async def _award_steps(user: User, today_steps: int, db: AsyncSession) -> list[str]:
    awarded: list[str] = []
    rules = [
        ("first_10k_steps", "Первые 10 000 шагов", today_steps >= 10000),
        ("early_bird_50k_steps", "Шагомер PRO", (user.total_steps or 0) >= 50000),
        ("marathon_50k", "Марафонец (50 км)", (user.total_distance_km or 0) >= 50),
        ("calorie_burner", "Сжигатель калорий", (user.total_calories or 0) >= 2000),
    ]
    for code, title, ok in rules:
        if not ok:
            continue
        ach = (await db.execute(select(Achievement).where(Achievement.code_name == code))).scalars().first()
        if ach is None:
            continue
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


@router.post("/log", response_model=dict, status_code=status.HTTP_201_CREATED)
async def log_steps(
    body: StepLogIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    day = body.log_date or date.today()
    row = (
        await db.execute(
            select(StepLog).where(StepLog.telegram_id == user.telegram_id, StepLog.log_date == day)
        )
    ).scalars().first()
    if row is None:
        row = StepLog(
            telegram_id=user.telegram_id, log_date=day,
            steps=body.steps, distance_km=body.distance_km, calories=body.calories,
        )
        db.add(row)
    else:
        # Накопление: фронт шлёт дельту с последнего синка
        row.steps = (row.steps or 0) + body.steps
        row.distance_km = (row.distance_km or 0) + body.distance_km
        row.calories = (row.calories or 0) + body.calories
    user.total_steps = (user.total_steps or 0) + body.steps
    user.total_distance_km = (user.total_distance_km or 0) + body.distance_km
    user.total_calories = (user.total_calories or 0) + body.calories
    await db.commit()
    await db.refresh(row)
    awarded = await _award_steps(user, row.steps or 0, db)
    for title in awarded:
        try:
            await notify_badge(user.telegram_id, title)
        except Exception:
            pass
    return {
        "log": StepLogOut(
            log_date=row.log_date, steps=row.steps,
            distance_km=row.distance_km, calories=row.calories,
        ).model_dump(),
        "awarded": awarded,
        "total_steps": user.total_steps,
    }


@router.get("/stats", response_model=dict)
async def steps_stats(
    range: str = Query(default="week", description="today|week|month"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    days = {"today": 1, "week": 7, "month": 30}.get(range, 7)
    start = date.today() - timedelta(days=days - 1)
    rows = (
        await db.execute(
            select(StepLog)
            .where(StepLog.telegram_id == user.telegram_id, StepLog.log_date >= start)
            .order_by(StepLog.log_date)
        )
    ).scalars().all()
    by_date = {r.log_date.isoformat(): r for r in rows}
    series: list[dict] = []
    cur = start
    while cur <= date.today():
        r = by_date.get(cur.isoformat())
        series.append({
            "date": cur.isoformat(),
            "steps": r.steps if r else 0,
            "distance_km": r.distance_km if r else 0.0,
            "calories": r.calories if r else 0.0,
        })
        cur += timedelta(days=1)
    totals = {
        "steps": sum(s["steps"] for s in series),
        "distance_km": round(sum(s["distance_km"] for s in series), 2),
        "calories": round(sum(s["calories"] for s in series), 1),
    }
    today_row = by_date.get(date.today().isoformat())
    return {
        "range": range,
        "days": days,
        "series": series,
        "totals": totals,
        "today": {
            "steps": today_row.steps if today_row else 0,
            "distance_km": today_row.distance_km if today_row else 0.0,
            "calories": today_row.calories if today_row else 0.0,
        },
        "lifetime": {
            "steps": user.total_steps or 0,
            "distance_km": user.total_distance_km or 0,
            "calories": user.total_calories or 0,
            "hikes": user.total_hikes or 0,
        },
    }


@router.get("/my", response_model=list[StepLogOut])
async def my_logs(
    days: int = Query(default=30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    start = date.today() - timedelta(days=days - 1)
    rows = (
        await db.execute(
            select(StepLog)
            .where(StepLog.telegram_id == user.telegram_id, StepLog.log_date >= start)
            .order_by(StepLog.log_date.desc())
        )
    ).scalars().all()
    return [
        StepLogOut(log_date=r.log_date, steps=r.steps, distance_km=r.distance_km, calories=r.calories)
        for r in rows
    ]
