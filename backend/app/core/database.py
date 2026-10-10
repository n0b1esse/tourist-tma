"""Асинхронное подключение к PostgreSQL + PostGIS.

Локально — обычный asyncpg. Для Supabase автоматически включаются:
- ssl=require (Supabase принимает только TLS);
- statement_cache_size=0 (Supavisor-пулер в transaction-режиме не дружит
  с кешем prepared statements asyncpg).
"""

from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def build_connect_args(url: str) -> dict[str, Any]:
    if "supabase.co" in url or "pooler.supabase.com" in url:
        return {"ssl": "require", "statement_cache_size": 0}
    return {}


engine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    connect_args=build_connect_args(settings.DATABASE_URL),
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
