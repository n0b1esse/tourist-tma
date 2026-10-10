"""Конфигурация бэкенда. Читается из .env / окружения (локально и на Render)."""

from typing import Annotated

from pydantic import BeforeValidator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _empty_to_none(v: object) -> object:
    # Пустая строка из ENV (Docker/Render) -> None, иначе падает валидация int
    return None if v in ("", None) else v


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://tourist:tourist_secret@localhost:5432/tourist_tma"
    REDIS_URL: str = "redis://localhost:6379/0"

    # Проверка подписи initData
    TELEGRAM_BOT_TOKEN: str = ""
    # Максимальный возраст auth_date в секундах (0 — не проверять, только для тестов)
    AUTH_DATE_MAX_AGE: int = 86400
    # JWT-сессии — следующим шагом; секрет зарезервирован заранее
    JWT_SECRET: str = "change-me"

    # Супер-админ: получает уведомления Telegram о новых черновиках
    ADMIN_TELEGRAM_ID: Annotated[int | None, BeforeValidator(_empty_to_none)] = None


settings = Settings()
