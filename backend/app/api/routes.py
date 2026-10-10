"""Маршруты: список с фильтрами (ТЗ §4А) + CRUD гида/админа (ТЗ §2–§3)."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models.enums import ContentStatus, DifficultyLevel
from app.models.route import Route
from app.models.user import User
from app.models.waypoint import Waypoint
from app.schemas.route import RouteCreate, RouteDetail, RouteOut, RouteUpdate
from app.schemas.waypoint import WaypointOut

router = APIRouter(prefix="/api/routes", tags=["routes"])


def _difficulty_value(d) -> str:
    return d.value if hasattr(d, "value") else str(d)


def _route_out(row, rating: float | None = None) -> RouteOut:
    route, gpx_wkt = row
    return RouteOut(
        id=route.id,
        title=route.title,
        description=route.description,
        difficulty=_difficulty_value(route.difficulty),
        distance_km=route.distance_km,
        elevation_gain_m=route.elevation_gain_m,
        estimated_time=route.estimated_time,
        max_elevation_m=route.max_elevation_m,
        gpx_wkt=gpx_wkt,
        rating=rating,
    )


@router.get("", response_model=list[RouteOut])
async def list_routes(
    difficulty: str | None = Query(default=None, description="Легкий|Средний|Сложный|Экстремальный"),
    max_distance_km: float | None = Query(default=None, ge=0),
    min_rating: float | None = Query(default=None, ge=0, le=5),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Route, func.ST_AsText(Route.gpx_data)).order_by(Route.id)
    if difficulty:
        # Маппим строку в enum, игнорируем неизвестные
        for level in DifficultyLevel:
            if level.value == difficulty:
                stmt = stmt.where(Route.difficulty == level)
                break
    if max_distance_km is not None:
        stmt = stmt.where(Route.distance_km <= max_distance_km)
    rows = (await db.execute(stmt)).all()
    out = [_route_out(r) for r in rows]
    if min_rating is not None:
        out = [r for r in out if (r.rating or 0) >= min_rating]
    return out


@router.post("", response_model=RouteOut, status_code=status.HTTP_201_CREATED)
async def create_route(
    body: RouteCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Создание маршрута гидом/админом (ТЗ §2: admin публикует свои пути/хайки)."""
    level = None
    for lv in DifficultyLevel:
        if lv.value == body.difficulty:
            level = lv
            break
    if level is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Неизвестная сложность")
    route = Route(
        title=body.title, description=body.description, difficulty=level,
        distance_km=body.distance_km, elevation_gain_m=body.elevation_gain_m,
        estimated_time=body.estimated_time, max_elevation_m=body.max_elevation_m,
    )
    db.add(route)
    await db.commit()
    await db.refresh(route)
    return _route_out((route, None))


@router.patch("/{route_id}", response_model=RouteOut)
async def update_route(
    route_id: int,
    body: RouteUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Редактирование маршрута прямо из админки/карты (ТЗ §3)."""
    route = await db.get(Route, route_id)
    if route is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Маршрут не найден")
    if body.title is not None:
        route.title = body.title
    if body.description is not None:
        route.description = body.description
    if body.difficulty is not None:
        for lv in DifficultyLevel:
            if lv.value == body.difficulty:
                route.difficulty = lv
                break
    if body.distance_km is not None:
        route.distance_km = body.distance_km
    if body.elevation_gain_m is not None:
        route.elevation_gain_m = body.elevation_gain_m
    if body.estimated_time is not None:
        route.estimated_time = body.estimated_time
    if body.max_elevation_m is not None:
        route.max_elevation_m = body.max_elevation_m
    await db.commit()
    gpx = (
        await db.execute(select(func.ST_AsText(Route.gpx_data)).where(Route.id == route.id))
    ).scalar()
    return _route_out((route, gpx))


@router.delete("/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_route(
    route_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    route = await db.get(Route, route_id)
    if route is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Маршрут не найден")
    await db.delete(route)
    await db.commit()
    return None


@router.get("/{route_id}", response_model=RouteDetail)
async def route_detail(route_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Route, func.ST_AsText(Route.gpx_data)).where(Route.id == route_id)
    row = (await db.execute(stmt)).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Маршрут не найден")
    detail = RouteDetail(**_route_out(row).model_dump())

    wp_stmt = (
        select(
            Waypoint,
            func.ST_Y(Waypoint.coordinates).label("lat"),
            func.ST_X(Waypoint.coordinates).label("lon"),
        )
        .where(Waypoint.route_id == route_id, Waypoint.status == ContentStatus.published)
        .order_by(Waypoint.id)
    )
    detail.published_waypoints = [
        WaypointOut(
            id=w.id, route_id=w.route_id, type=w.type, latitude=lat, longitude=lon,
            title=w.title, description=w.description, photo_url=w.photo_url, status=w.status,
        )
        for w, lat, lon in (await db.execute(wp_stmt)).all()
    ]
    return detail
