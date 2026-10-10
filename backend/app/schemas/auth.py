"""Pydantic-схемы auth + user (Шаг 3)."""

from pydantic import BaseModel, Field

from app.models.enums import UserRole


class InitDataRequest(BaseModel):
    init_data: str = Field(alias="initData", description="Сырая строка WebApp initData")

    model_config = {"populate_by_name": True}


class DevLoginRequest(BaseModel):
    """Локальный вход без подписи Telegram (только при DEV_LOGIN_ENABLED)."""

    telegram_id: int = Field(gt=0)
    username: str | None = None
    full_name: str | None = None


class UserProfile(BaseModel):
    telegram_id: int
    username: str | None = None
    full_name: str | None = None
    role: UserRole
    total_distance_km: float = 0.0
    total_elevation_m: int = 0
