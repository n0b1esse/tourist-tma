"""Асинхронное подключение к PostgreSQL + PostGIS.

Локально — обычный asyncpg. Для Supabase автоматически включается TLS
и отключается кеш prepared statements (Supavisor-пулер в transaction-режиме
не дружит с кешем asyncpg).

Важно: у драйверов разные имена SSL-параметра:
- asyncpg (рантайм, ``postgresql+asyncpg://``) понимает ``ssl`` (bool/SSLContext);
- psycopg v3 / psycopg2 (libpq, в т.ч. SYNC_URL для alembic offline) понимает
  ТОЛЬКО ``sslmode`` — ключ ``ssl`` падает с
  ``psycopg.ProgrammingError: invalid connection option "ssl"``.
Поэтому ``build_connect_args`` выбирает ключ по драйверу из URL,
а ``clean_database_url`` нормализует строку: голую схему ``postgresql://``
(так копируется из Supabase Dashboard) дополняет до ``postgresql+asyncpg://``
— без драйвера ``create_async_engine`` уезжает в sync-диалект и его опции
падают в чужой DBAPI (тот самый ``invalid connection option "ssl"``),
а также вырезает legacy ``?ssl=...`` из query.
"""

from collections.abc import AsyncIterator
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def is_supabase_url(url: str) -> bool:
    return "supabase.co" in url or "pooler.supabase.com" in url


def build_connect_args(url: str) -> dict[str, Any]:
    """connect_args под драйвер, определённый схемой URL."""
    if not is_supabase_url(url):
        return {}
    if "+psycopg" in url:
        # libpq-драйверы: только sslmode; ключ "ssl" здесь запрещён.
        return {"sslmode": "require"}
    # asyncpg (основной рантайм): ssl=True (bool, не строка),
    # statement_cache_size=0 — для Supavisor в transaction mode.
    return {"ssl": True, "statement_cache_size": 0}


ASYNC_SCHEME = "postgresql+asyncpg"


def clean_database_url(url: str) -> str:
    """Нормализует строку подключения для асинхронного рантайма.

    1. Голая схема ``postgresql://`` -> ``postgresql+asyncpg://``
       (рантайм полностью асинхронный, драйвер обязан быть asyncpg).
    2. Убирает из query legacy-параметр ``ssl`` (ломает psycopg).
    Уже заданный ``sslmode`` и всё остальное сохраняется.
    """
    parts = urlsplit(url)
    scheme = ASYNC_SCHEME if parts.scheme == "postgresql" else parts.scheme
    if not parts.query:
        if scheme == parts.scheme:
            return url
        return urlunsplit((scheme, parts.netloc, parts.path, "", parts.fragment))
    params = parse_qsl(parts.query, keep_blank_values=True)
    filtered = [(k, v) for k, v in params if k.lower() != "ssl"]
    if scheme == parts.scheme and len(filtered) == len(params):
        return url
    return urlunsplit(
        (scheme, parts.netloc, parts.path, urlencode(filtered), parts.fragment)
    )


DATABASE_URL = clean_database_url(settings.DATABASE_URL)

engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args=build_connect_args(DATABASE_URL),
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
