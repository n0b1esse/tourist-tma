"""Alembic env — async engine + метаданные моделей (Шаг 2)."""

import asyncio

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

import app.models  # noqa: F401 — регистрация таблиц в Base.metadata
from app.core.config import settings
from app.core.database import (
    Base,
    build_connect_args,
    clean_database_url,
    is_supabase_url,
)

config = context.config
# Асинхронный URL рантайма (asyncpg) без legacy ?ssl=...
ASYNC_URL = clean_database_url(settings.DATABASE_URL)
# Синхронный URL для оффлайна (psycopg v3, libpq): понимает ТОЛЬКО sslmode,
# ключ/query ?ssl=... падает с invalid connection option "ssl".
SYNC_URL = clean_database_url(settings.DATABASE_URL.replace("+asyncpg", "+psycopg"))
if is_supabase_url(SYNC_URL) and "sslmode" not in SYNC_URL:
    SYNC_URL += ("&" if "?" in SYNC_URL else "?") + "sslmode=require"

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=SYNC_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection, target_metadata=target_metadata, compare_type=True
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    # Тот же TLS/пулер, что у рантайма: без connect_args Supabase не примет
    # соединение (требует SSL), а Supavisor упрётся в кеш prepared statements.
    connectable = create_async_engine(
        ASYNC_URL,
        poolclass=pool.NullPool,
        connect_args=build_connect_args(ASYNC_URL),
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
