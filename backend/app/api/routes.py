"""Маршруты: список с фильтрами + CRUD + GPS-запись + GPX/KML (Fitness-трекинг).

Роли (ТЗ):
- admin / super_admin — публикуют сразу (status=published);
- tester — отправляет на модерацию (status=review);
- user — сохраняет в «Мои прогулки» (status=draft) + может предложить гидам (draft->review).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin, require_tester
from app.core.database import get_db
from app.core.geo import (
    build_gpx,
    build_kml,
    estimate_calories,
    parse_gpx,
    parse_kml,
    points_to_geojson,
    points_to_wkt,
    track_stats,
)
from app.core.notifier import notify_moderation
from app.models.achievement import Achievement, UserAchievement
from app.models.enums import ActivityType, ContentStatus, DifficultyLevel, UserRole, has_role_or_higher
from app.models.route import Route
from app.models.user import User
from app.models.waypoint import Waypoint
from app.schemas.route import (
    VALID_ACTIVITIES,
    GpxImportPreview,
    GpxImportRequest,
    RouteCreate,
    RouteDetail,
    RouteOut,
    RouteRecord,
    RouteUpdate,
    TrackPoint,
)
from app.schemas.waypoint import WaypointOut

router = APIRouter(prefix="/api/routes", tags=["routes"])


def _difficulty_value(d) -> str:
    return d.value if hasattr(d, "value") else str(d)


def _activity_value(d) -> str:
    return d.value if hasattr(d, "value") else str(d)


def _status_value(d) -> str:
    return d.value if hasattr(d, "value") else str(d)


def _route_out(row, rating: float | None = None) -> RouteOut:
    route, gpx_wkt = row
    return RouteOut(
        id=route.id,
        author_id=getattr(route, "author_id", None),
        title=route.title,
        description=route.description,
        activity_type=_activity_value(getattr(route, "activity_type", ActivityType.hiking)),
        difficulty=_difficulty_value(route.difficulty),
        distance_km=route.distance_km,
        elevation_gain_m=route.elevation_gain_m,
        steps_count=int(getattr(route, "steps_count", 0) or 0),
        estimated_time=route.estimated_time,
        max_elevation_m=route.max_elevation_m,
        photo_url=getattr(route, "photo_url", None),
        status=_status_value(getattr(route, "status", ContentStatus.published)),
        geojson_points=getattr(route, "geojson_points", None),
        gpx_wkt=gpx_wkt,
        rating=rating,
    )


def _resolve_difficulty(value: str) -> DifficultyLevel:
    for lv in DifficultyLevel:
        if lv.value == value:
            return lv
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Неизвестная сложность")


def _resolve_activity(value: str) -> ActivityType:
    if value not in VALID_ACTIVITIES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Неизвестный тип активности")
    for a in ActivityType:
        if a.value == value:
            return a
    return ActivityType.hiking


def _default_status_for(user: User) -> ContentStatus:
    """Стартовый статус по роли: admin+ → published, tester → review, user → draft."""
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if has_role_or_higher(role, UserRole.admin):
        return ContentStatus.published
    if has_role_or_higher(role, UserRole.tester):
        return ContentStatus.review
    return ContentStatus.draft


async def _maybe_award_track(user: User, db: AsyncSession) -> list[str]:
    """Бейджи за треки: Марафонец 50км, Покоритель троп (5 треков), калории."""
    awarded: list[str] = []
    track_count = (
        await db.execute(select(func.count()).select_from(Route).where(Route.author_id == user.telegram_id))
    ).scalar() or 0
    rules = [
        ("marathon_50k", "Марафонец (50 км)", (user.total_distance_km or 0) >= 50),
        ("trail_conqueror", "Покоритель троп", track_count >= 5),
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


@router.get("", response_model=list[RouteOut])
async def list_routes(
    difficulty: str | None = Query(default=None),
    max_distance_km: float | None = Query(default=None, ge=0),
    min_rating: float | None = Query(default=None, ge=0, le=5),
    activity_type: str | None = Query(default=None, description="hiking|walking|bike|run|offroad"),
    status_filter: str | None = Query(default=None, alias="status"),
    mine: bool = Query(default=False, description="Только мои маршруты (нужен X-Telegram-Id)"),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Route, func.ST_AsText(Route.gpx_data)).order_by(Route.id.desc())
    # По умолчанию — только published; статусы видят админы через ?status=
    if status_filter:
        for st in ContentStatus:
            if st.value == status_filter:
                stmt = stmt.where(Route.status == st)
                break
    else:
        stmt = stmt.where(Route.status == ContentStatus.published)
    if difficulty:
        for level in DifficultyLevel:
            if level.value == difficulty:
                stmt = stmt.where(Route.difficulty == level)
                break
    if activity_type:
        for a in ActivityType:
            if a.value == activity_type:
                stmt = stmt.where(Route.activity_type == a)
                break
    if max_distance_km is not None:
        stmt = stmt.where(Route.distance_km <= max_distance_km)
    rows = (await db.execute(stmt)).all()
    out = [_route_out(r) for r in rows]
    if min_rating is not None:
        out = [r for r in out if (r.rating or 0) >= min_rating]
    return out


@router.get("/mine", response_model=list[RouteOut])
async def my_routes(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """«Мои прогулки»: все личные записи пользователя (любой статус)."""
    stmt = (
        select(Route, func.ST_AsText(Route.gpx_data))
        .where(Route.author_id == user.telegram_id)
        .order_by(Route.id.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [_route_out(r) for r in rows]


@router.post("", response_model=RouteOut, status_code=status.HTTP_201_CREATED)
async def create_route(
    body: RouteCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ручной конструктор / создание маршрута. Статус — по роли (если не задан явно)."""
    if bool(getattr(user, "is_blocked", False)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Пользователь заблокирован")
    level = _resolve_difficulty(body.difficulty)
    activity = _resolve_activity(body.activity_type)
    if body.status and body.status in ("draft", "review", "published", "rejected"):
        # user не может сам себе опубликовать; tester — не published
        role = user.role.value if hasattr(user.role, "value") else str(user.role)
        if body.status == "published" and not has_role_or_higher(role, UserRole.admin):
            wanted = ContentStatus.review if has_role_or_higher(role, UserRole.tester) else ContentStatus.draft
        else:
            wanted = ContentStatus(body.status)
    else:
        wanted = _default_status_for(user)

    points = [p.model_dump() for p in (body.track_points or [])]
    wkt = points_to_wkt(points) if points else None
    geojson = points_to_geojson(points) if points else None
    # Если дистанция не задана, но есть трек — считаем по треку
    distance = body.distance_km
    elev = body.elevation_gain_m
    max_ele = body.max_elevation_m
    if points and (distance == 0 or elev == 0):
        stats = track_stats(points)
        if distance == 0:
            distance = stats["distance_km"]
        if elev == 0:
            elev = stats["elevation_gain_m"]
        if max_ele is None:
            max_ele = stats["max_elevation_m"]

    route = Route(
        author_id=user.telegram_id,
        title=body.title,
        description=body.description,
        activity_type=activity,
        difficulty=level,
        distance_km=distance,
        elevation_gain_m=elev,
        steps_count=body.steps_count,
        estimated_time=body.estimated_time,
        max_elevation_m=max_ele,
        photo_url=body.photo_url,
        geojson_points=geojson,
        status=wanted,
    )
    db.add(route)
    await db.flush()
    if wkt:
        from sqlalchemy import text as sa_text

        await db.execute(
            sa_text("UPDATE routes SET gpx_data = ST_GeomFromText(:wkt, 4326) WHERE id = :rid"),
            {"wkt": wkt, "rid": route.id},
        )
    await db.commit()
    await db.refresh(route)
    gpx = (
        await db.execute(select(func.ST_AsText(Route.gpx_data)).where(Route.id == route.id))
    ).scalar()
    return _route_out((route, gpx))


@router.post("/record", response_model=dict, status_code=status.HTTP_201_CREATED)
async def record_track(
    body: RouteRecord,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Запись GPS-трека в реальном времени: сохранение + публикация по роли + статистика."""
    if bool(getattr(user, "is_blocked", False)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Пользователь заблокирован")
    if len(body.track_points) < 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Нужно минимум 2 точки трека")
    level = _resolve_difficulty(body.difficulty)
    activity = _resolve_activity(body.activity_type)
    wanted = _default_status_for(user)

    pts = [p.model_dump() for p in body.track_points]
    # Фильтрация GPS-шума: отбрасываем точки ближе 3 м к предыдущей
    from app.core.geo import haversine_m as _hav

    filtered: list[dict] = [pts[0]]
    for p in pts[1:]:
        last = filtered[-1]
        if _hav(last["lat"], last["lon"], p["lat"], p["lon"]) >= 3.0:
            filtered.append(p)
    stats = track_stats(filtered)
    wkt = points_to_wkt(filtered)
    geojson = points_to_geojson(filtered)
    calories = estimate_calories(stats["distance_km"], activity.value)

    route = Route(
        author_id=user.telegram_id,
        title=body.title,
        description=body.description,
        activity_type=activity,
        difficulty=level,
        distance_km=stats["distance_km"],
        elevation_gain_m=stats["elevation_gain_m"],
        steps_count=body.steps_count,
        estimated_time=body.estimated_time,
        max_elevation_m=stats["max_elevation_m"],
        photo_url=body.photo_url,
        geojson_points=geojson,
        status=wanted,
    )
    db.add(route)
    await db.flush()
    if wkt:
        from sqlalchemy import text as sa_text

        await db.execute(
            sa_text("UPDATE routes SET gpx_data = ST_GeomFromText(:wkt, 4326) WHERE id = :rid"),
            {"wkt": wkt, "rid": route.id},
        )
    # Статистика профиля
    user.total_distance_km = (user.total_distance_km or 0) + stats["distance_km"]
    user.total_elevation_m = (user.total_elevation_m or 0) + stats["elevation_gain_m"]
    user.total_steps = (user.total_steps or 0) + (body.steps_count or 0)
    user.total_calories = (user.total_calories or 0) + calories
    user.total_hikes = (user.total_hikes or 0) + 1
    await db.commit()
    await db.refresh(route)
    awarded = await _maybe_award_track(user, db)
    # Пуши о бейджах — best-effort
    if awarded:
        from app.core.notifier import notify_badge

        for title in awarded:
            try:
                await notify_badge(user.telegram_id, title)
            except Exception:
                pass
    gpx = (
        await db.execute(select(func.ST_AsText(Route.gpx_data)).where(Route.id == route.id))
    ).scalar()
    return {"route": _route_out((route, gpx)).model_dump(), "awarded": awarded, "calories": calories}


@router.post("/import", response_model=GpxImportPreview)
async def import_track(
    body: GpxImportRequest,
    user: User = Depends(require_tester),
    db: AsyncSession = Depends(get_db),
):
    """Импорт .gpx / .kml (ручной конструктор для admin; tester — превью для модерации)."""
    fmt = (body.format or "gpx").lower()
    try:
        points = parse_gpx(body.content) if fmt == "gpx" else parse_kml(body.content)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Не смог распарсить {fmt}: {exc}")
    if len(points) < 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="В файле меньше 2 точек")
    stats = track_stats(points)
    return GpxImportPreview(
        points=[TrackPoint(**p) for p in points[:5000]],
        distance_km=stats["distance_km"],
        elevation_gain_m=stats["elevation_gain_m"],
        max_elevation_m=stats["max_elevation_m"],
    )


@router.get("/{route_id}/export")
async def export_track(
    route_id: int,
    format: str = Query(default="gpx", description="gpx|kml|geojson"),
    db: AsyncSession = Depends(get_db),
):
    """Экспорт трека в .gpx / .kml / geojson."""
    import json as _json

    row = (
        await db.execute(select(Route, func.ST_AsText(Route.gpx_data)).where(Route.id == route_id))
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Маршрут не найден")
    route, _wkt = row
    points: list[dict] = []
    if route.geojson_points:
        try:
            gj = _json.loads(route.geojson_points)
            for c in gj.get("coordinates", []):
                pt: dict = {"lon": c[0], "lat": c[1]}
                if len(c) >= 3:
                    pt["ele"] = c[2]
                points.append({"lat": pt["lat"], "lon": pt["lon"], **({"ele": pt["ele"]} if "ele" in pt else {})})
        except Exception:
            points = []
    fmt = (format or "gpx").lower()
    if fmt == "kml":
        return Response(content=build_kml(route.title, points), media_type="application/vnd.google-earth.kml+xml")
    if fmt == "geojson":
        return Response(
            content=route.geojson_points or '{"type":"LineString","coordinates":[]}',
            media_type="application/geo+json",
        )
    return Response(content=build_gpx(route.title, points), media_type="application/gpx+xml")


@router.post("/{route_id}/propose", response_model=RouteOut)
async def propose_route(
    route_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """user предлагает свою прогулку гидам: draft -> review."""
    route = await db.get(Route, route_id)
    if route is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Маршрут не найден")
    if route.author_id != user.telegram_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Только автор может предложить маршрут")
    cur = route.status.value if hasattr(route.status, "value") else str(route.status)
    if cur != ContentStatus.draft.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Предложить можно только черновик")
    route.status = ContentStatus.review
    await db.commit()
    gpx = (
        await db.execute(select(func.ST_AsText(Route.gpx_data)).where(Route.id == route.id))
    ).scalar()
    return _route_out((route, gpx))


@router.patch("/{route_id}/moderate", response_model=RouteOut)
async def moderate_route(
    route_id: int,
    body: dict,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Модерация маршрута админом: published / rejected."""
    verdict = (body.get("status") or "").lower()
    if verdict not in ("published", "rejected"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="status: published|rejected")
    route = await db.get(Route, route_id)
    if route is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Маршрут не найден")
    route.status = ContentStatus(verdict)
    await db.commit()
    try:
        await notify_moderation(route.author_id, route.title, verdict)
    except Exception:
        pass
    gpx = (
        await db.execute(select(func.ST_AsText(Route.gpx_data)).where(Route.id == route.id))
    ).scalar()
    return _route_out((route, gpx))


@router.patch("/{route_id}", response_model=RouteOut)
async def update_route(
    route_id: int,
    body: RouteUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Редактирование маршрута + точек (ручной конструктор)."""
    route = await db.get(Route, route_id)
    if route is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Маршрут не найден")
    if body.title is not None:
        route.title = body.title
    if body.description is not None:
        route.description = body.description
    if body.activity_type is not None:
        route.activity_type = _resolve_activity(body.activity_type)
    if body.difficulty is not None:
        route.difficulty = _resolve_difficulty(body.difficulty)
    if body.distance_km is not None:
        route.distance_km = body.distance_km
    if body.elevation_gain_m is not None:
        route.elevation_gain_m = body.elevation_gain_m
    if body.steps_count is not None:
        route.steps_count = body.steps_count
    if body.estimated_time is not None:
        route.estimated_time = body.estimated_time
    if body.max_elevation_m is not None:
        route.max_elevation_m = body.max_elevation_m
    if body.photo_url is not None:
        route.photo_url = body.photo_url
    if body.status is not None and body.status in ("draft", "review", "published", "rejected"):
        route.status = ContentStatus(body.status)
    if body.track_points is not None and len(body.track_points) >= 2:
        pts = [p.model_dump() for p in body.track_points]
        wkt = points_to_wkt(pts)
        route.geojson_points = points_to_geojson(pts)
        if wkt:
            from sqlalchemy import text as sa_text

            await db.flush()
            await db.execute(
                sa_text("UPDATE routes SET gpx_data = ST_GeomFromText(:wkt, 4326) WHERE id = :rid"),
                {"wkt": wkt, "rid": route.id},
            )
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


# Совместимость: POST /api/routes с require_admin раньше — теперь любой автор.
# Старый require_admin ослаблен до get_current_user (см. create_route выше).
_ = (or_, TrackPoint)
