"""POST /api/auth/init-data — валидация подписи, upsert пользователя (Шаг 3.2)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.telegram_auth import validate_init_data
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.auth import DevLoginRequest, InitDataRequest, UserProfile

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/init-data", response_model=UserProfile)
async def auth_init_data(body: InitDataRequest, db: AsyncSession = Depends(get_db)):
    try:
        data = validate_init_data(
            body.init_data, settings.TELEGRAM_BOT_TOKEN, settings.AUTH_DATE_MAX_AGE
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from None

    tg_user: dict = data["user"]
    telegram_id = int(tg_user["id"])
    username = tg_user.get("username")
    full_name = " ".join(
        p for p in (tg_user.get("first_name", ""), tg_user.get("last_name", "")) if p
    ).strip() or None

    user = await db.get(User, telegram_id)
    if user is None:
        user = User(
            telegram_id=telegram_id,
            username=username,
            full_name=full_name,
            role=UserRole.user,
            total_distance_km=0.0,
            total_elevation_m=0,
        )
        db.add(user)
    else:
        user.username = username
        user.full_name = full_name
    await db.commit()
    await db.refresh(user)
    if user.role is None:  # страховка для БД без server_default
        user.role = UserRole.user

    return UserProfile(
        telegram_id=user.telegram_id,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        is_blocked=bool(getattr(user, "is_blocked", False)),
        total_distance_km=user.total_distance_km,
        total_elevation_m=user.total_elevation_m,
    )


@router.post("/dev-login", response_model=UserProfile)
async def auth_dev_login(body: DevLoginRequest, db: AsyncSession = Depends(get_db)):
    """Локальный вход без подписи Telegram (кнопка «Войти локально»).

    Создаёт тестового пользователя с ролью user, если его нет в БД.
    Работает ТОЛЬКО при ``DEV_LOGIN_ENABLED=true`` (локалка); в проде
    всегда 403. Роль существующего пользователя никогда не меняется —
    через dev-вход нельзя получить tester/admin.
    """
    if not settings.DEV_LOGIN_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dev-вход выключен (доступен только локально)",
        )
    user = await db.get(User, body.telegram_id)
    if user is None:
        user = User(
            telegram_id=body.telegram_id,
            username=body.username,
            full_name=body.full_name or f"Dev {body.telegram_id}",
            role=UserRole.user,
            total_distance_km=0.0,
            total_elevation_m=0,
        )
        db.add(user)
    else:
        if body.username is not None:
            user.username = body.username
        if body.full_name is not None:
            user.full_name = body.full_name
    await db.commit()
    await db.refresh(user)
    if user.role is None:  # страховка для БД без server_default
        user.role = UserRole.user

    return UserProfile(
        telegram_id=user.telegram_id,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        is_blocked=bool(getattr(user, "is_blocked", False)),
        total_distance_km=user.total_distance_km,
        total_elevation_m=user.total_elevation_m,
    )
