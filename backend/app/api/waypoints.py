"""CRUD путевых точек с двухрежимной фильтрацией (Шаг 3.3).

- mode=production: только published (доступно всем, включая user).
- mode=tester: published + draft + review, только tester/admin.
  Черновики — «жёлтый слой» карты из спецификации (§3).
- POST: только tester/admin, всегда создаёт status=draft.
- PATCH /{id}/moderate: только admin (published / rejected + approved_by).
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin, require_tester
from app.core.database import get_db
from app.core.notifier import notify_admin_draft
from app.models.enums import ContentStatus, UserRole, has_role_or_higher
from app.models.user import User
from app.models.waypoint import Waypoint
from app.schemas.waypoint import ModerateRequest, WaypointCreate, WaypointOut, WaypointUpdate

router = APIRouter(prefix="/api/waypoints", tags=["waypoints"])

TESTER_VISIBLE = (ContentStatus.published, ContentStatus.draft, ContentStatus.review)


def _out(w: Waypoint, lat: float, lon: float) -> WaypointOut:
    return WaypointOut(
        id=w.id, route_id=w.route_id, type=w.type, latitude=lat, longitude=lon,
        title=w.title, description=w.description, photo_url=w.photo_url, status=w.status,
    )


@router.get("", response_model=list[WaypointOut])
async def list_waypoints(
    mode: Literal["production", "tester"] = Query(default="production"),
    route_id: int | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if mode == "tester" and not has_role_or_higher(user.role, UserRole.tester):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Режим tester доступен только ролям tester/admin/super_admin",
        )
    statuses = TESTER_VISIBLE if mode == "tester" else (ContentStatus.published,)
    if user.role == UserRole.admin and mode == "tester":
        statuses = tuple(ContentStatus)  # админ в тест-режиме видит и rejected

    stmt = select(
        Waypoint,
        func.ST_Y(Waypoint.coordinates).label("lat"),
        func.ST_X(Waypoint.coordinates).label("lon"),
    ).where(Waypoint.status.in_(statuses))
    if route_id is not None:
        stmt = stmt.where(Waypoint.route_id == route_id)
    rows = (await db.execute(stmt.order_by(Waypoint.id))).all()
    return [_out(w, lat, lon) for w, lat, lon in rows]


@router.post("", response_model=WaypointOut, status_code=status.HTTP_201_CREATED)
async def create_waypoint(
    body: WaypointCreate,
    user: User = Depends(require_tester),
    db: AsyncSession = Depends(get_db),
):
    wp = Waypoint(
        route_id=body.route_id,
        created_by=user.telegram_id,
        type=body.type,
        coordinates=func.ST_SetSRID(func.ST_MakePoint(body.longitude, body.latitude), 4326),
        title=body.title,
        description=body.description,
        photo_url=body.photo_url,
        status=ContentStatus.draft,
    )
    db.add(wp)
    await db.commit()
    await db.refresh(wp)
    latlon = (
        await db.execute(
            select(func.ST_Y(Waypoint.coordinates), func.ST_X(Waypoint.coordinates)).where(
                Waypoint.id == wp.id
            )
        )
    ).one()
    # Уведомление супер-админу — best-effort, ответ не блокирует
    try:
        await notify_admin_draft(wp, user, latlon[0], latlon[1])
    except Exception:  # noqa: BLE001
        pass
    return _out(wp, latlon[0], latlon[1])


@router.patch("/{waypoint_id}", response_model=WaypointOut)
async def update_waypoint(
    waypoint_id: int,
    body: WaypointUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Редактирование метки прямо на карте (админка, ТЗ §3)."""
    wp = await db.get(Waypoint, waypoint_id)
    if wp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Точка не найдена")
    if body.title is not None:
        wp.title = body.title
    if body.description is not None:
        wp.description = body.description
    if body.type is not None:
        wp.type = body.type
    if body.latitude is not None and body.longitude is not None:
        wp.coordinates = func.ST_SetSRID(func.ST_MakePoint(body.longitude, body.latitude), 4326)
    await db.commit()
    latlon = (
        await db.execute(
            select(func.ST_Y(Waypoint.coordinates), func.ST_X(Waypoint.coordinates)).where(
                Waypoint.id == wp.id
            )
        )
    ).one()
    return _out(wp, latlon[0], latlon[1])


@router.delete("/{waypoint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_waypoint(
    waypoint_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    wp = await db.get(Waypoint, waypoint_id)
    if wp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Точка не найдена")
    await db.delete(wp)
    await db.commit()
    return None


@router.patch("/{waypoint_id}/moderate", response_model=WaypointOut)
async def moderate_waypoint(
    waypoint_id: int,
    body: ModerateRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if body.status not in (ContentStatus.published, ContentStatus.rejected):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Модерация ставит только published / rejected",
        )
    wp = await db.get(Waypoint, waypoint_id)
    if wp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Точка не найдена")
    wp.status = body.status
    wp.approved_by = admin.telegram_id
    await db.commit()
    latlon = (
        await db.execute(
            select(func.ST_Y(Waypoint.coordinates), func.ST_X(Waypoint.coordinates)).where(
                Waypoint.id == wp.id
            )
        )
    ).one()
    return _out(wp, latlon[0], latlon[1])
