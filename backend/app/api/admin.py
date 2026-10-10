"""Админ-панель супер-админа (ТЗ §3). Все роуты — только require_super_admin.

- GET /api/admin/users — пагинация + фильтр по роли + поиск
- PATCH /api/admin/users/{telegram_id}/role — смена роли
- PATCH /api/admin/users/{telegram_id}/status — блок/разблок
- GET /api/admin/stats — общая статистика
- POST /api/admin/notifications — сервисная рассылка через Bot API
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_super_admin
from app.core.database import get_db
from app.core.notifier import broadcast_message, notify_role_change

log = logging.getLogger("tourist-tma.admin")
from app.models.achievement import UserAchievement
from app.models.checkin import Checkin
from app.models.checkin import Ticket
from app.models.enums import UserRole
from app.models.route import Route
from app.models.user import User
from app.models.waypoint import Waypoint
from app.schemas.admin import (
    AdminUserList,
    AdminUserOut,
    NotificationRequest,
    RoleUpdate,
    StatsOut,
    StatusUpdate,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _out(u: User) -> AdminUserOut:
    return AdminUserOut(
        telegram_id=u.telegram_id,
        username=u.username,
        full_name=u.full_name,
        role=u.role,
        is_blocked=bool(getattr(u, "is_blocked", False)),
        total_distance_km=u.total_distance_km or 0.0,
        total_elevation_m=u.total_elevation_m or 0,
    )


@router.get("/users", response_model=AdminUserList)
async def list_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    role: UserRole | None = Query(default=None),
    q: str | None = Query(default=None, description="Поиск по username/full_name/id"),
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User)
    count_stmt = select(func.count()).select_from(User)
    if role is not None:
        stmt = stmt.where(User.role == role)
        count_stmt = count_stmt.where(User.role == role)
    if q:
        like = f"%{q.strip()}%"
        cond = or_(
            User.username.ilike(like),
            User.full_name.ilike(like),
        )
        # Числовой поиск по telegram_id
        if q.strip().lstrip("-").isdigit():
            cond = or_(cond, User.telegram_id == int(q.strip()))
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    total = (await db.execute(count_stmt)).scalar() or 0
    rows = (
        await db.execute(stmt.order_by(User.telegram_id).offset((page - 1) * page_size).limit(page_size))
    ).scalars().all()
    return AdminUserList(items=[_out(u) for u in rows], total=total, page=page, page_size=page_size)


@router.patch("/users/{telegram_id}/role", response_model=AdminUserOut)
async def set_user_role(
    telegram_id: int,
    body: RoleUpdate,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    # Супер-админ не может разжаловать сам себя последним (защита от lockout)
    if telegram_id == admin.telegram_id and body.role != UserRole.super_admin:
        # Разрешаем только если есть ещё хотя бы один super_admin
        others = (
            await db.execute(
                select(func.count()).select_from(User).where(
                    User.role == UserRole.super_admin, User.telegram_id != admin.telegram_id
                )
            )
        ).scalar() or 0
        if others == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Нельзя снять с себя super_admin — ты последний супер-админ",
            )
    user = await db.get(User, telegram_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    user.role = body.role
    await db.commit()
    await db.refresh(user)
    # Push-уведомление о смене роли — best-effort: роль в БД уже сохранена,
    # ошибка отправки (BotBlocked / TelegramAPIError / блокировка бота) не роняет запрос.
    try:
        await notify_role_change(telegram_id, body.role)
    except Exception as exc:  # noqa: BLE001 — страховка, notify_role_change и так не бросает
        log.warning("admin: notify_role_change(%s) failed: %s", telegram_id, exc)
    return _out(user)


@router.patch("/users/{telegram_id}/status", response_model=AdminUserOut)
async def set_user_status(
    telegram_id: int,
    body: StatusUpdate,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    if telegram_id == admin.telegram_id and body.is_blocked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя заблокировать самого себя"
        )
    user = await db.get(User, telegram_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    user.is_blocked = body.is_blocked
    await db.commit()
    await db.refresh(user)
    return _out(user)


@router.get("/stats", response_model=StatsOut)
async def admin_stats(
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    blocked_users = (
        await db.execute(select(func.count()).select_from(User).where(User.is_blocked.is_(True)))
    ).scalar() or 0
    by_role: dict[str, int] = {}
    for r in UserRole:
        by_role[r.value] = (
            await db.execute(select(func.count()).select_from(User).where(User.role == r))
        ).scalar() or 0
    total_checkins = (await db.execute(select(func.count()).select_from(Checkin))).scalar() or 0
    total_routes = (await db.execute(select(func.count()).select_from(Route))).scalar() or 0
    total_waypoints = (await db.execute(select(func.count()).select_from(Waypoint))).scalar() or 0
    from app.models.enums import ContentStatus

    published_waypoints = (
        await db.execute(
            select(func.count()).select_from(Waypoint).where(Waypoint.status == ContentStatus.published)
        )
    ).scalar() or 0
    draft_waypoints = (
        await db.execute(
            select(func.count()).select_from(Waypoint).where(Waypoint.status == ContentStatus.draft)
        )
    ).scalar() or 0
    total_tickets_open = (
        await db.execute(select(func.count()).select_from(Ticket).where(Ticket.status == "open"))
    ).scalar() or 0
    # Активные: пользователи с хотя бы одним чек-ином
    active_users = (
        await db.execute(select(func.count(func.distinct(Checkin.telegram_id))))
    ).scalar() or 0
    _ = UserAchievement  # импорт для Alembic-реестра, статистика ачивок — на фронтенде
    return StatsOut(
        total_users=total_users,
        active_users=active_users,
        blocked_users=blocked_users,
        by_role=by_role,
        total_checkins=total_checkins,
        total_routes=total_routes,
        total_waypoints=total_waypoints,
        published_waypoints=published_waypoints,
        draft_waypoints=draft_waypoints,
        total_tickets_open=total_tickets_open,
    )


@router.post("/notifications")
async def send_notification(
    body: NotificationRequest,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Сервисная рассылка от супер-админа (ТЗ §3, §5Б). Best-effort через Bot API."""
    stmt = select(User.telegram_id).where(User.is_blocked.is_not(True))
    if body.role_filter is not None:
        stmt = stmt.where(User.role == body.role_filter)
    ids = (await db.execute(stmt)).scalars().all()
    sent, failed = await broadcast_message(list(ids), body.text)
    return {"total": len(ids), "sent": sent, "failed": failed}
