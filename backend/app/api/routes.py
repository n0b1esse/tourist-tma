"""GET /api/routes — список и детали маршрутов (Шаг 3.3)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.enums import ContentStatus
from app.models.route import Route
from app.models.waypoint import Waypoint
from app.schemas.route import RouteDetail, RouteOut
from app.schemas.waypoint import WaypointOut

router = APIRouter(prefix="/api/routes", tags=["routes"])


def _route_out(row) -> RouteOut:
    route, gpx_wkt = row
    return RouteOut(
        id=route.id,
        title=route.title,
        description=route.description,
        difficulty=route.difficulty.value,
        distance_km=route.distance_km,
        elevation_gain_m=route.elevation_gain_m,
        estimated_time=route.estimated_time,
        max_elevation_m=route.max_elevation_m,
        gpx_wkt=gpx_wkt,
    )


@router.get("", response_model=list[RouteOut])
async def list_routes(db: AsyncSession = Depends(get_db)):
    stmt = select(Route, func.ST_AsText(Route.gpx_data)).order_by(Route.id)
    rows = (await db.execute(stmt)).all()
    return [_route_out(r) for r in rows]


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
