"""Tourist TMA Backend — точка входа FastAPI (ТЗ: + admin/checkins/tickets)."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, auth, checkins, routes, steps, tickets, users, waypoints
from app.core.config import settings

try:
    # Импорт мягкий: локалка без aiogram (смок-тест без БД/зависимостей) не должна падать.
    # В прод-образе aiogram есть (requirements.txt) — бот стартует через lifespan.
    from app.bot import start_embedded
except ImportError as _bot_import_error:
    start_embedded = None  # type: ignore[assignment]
    logging.getLogger("tourist-tma.web").warning(
        "app.bot недоступен (aiogram не установлен?): %s", _bot_import_error
    )

logger = logging.getLogger("tourist-tma.web")


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Telegram-бот (polling) живёт в том же процессе, что и API.

    Render free не даёт план Background Workers, поэтому отдельный воркер
    недоступен: aiogram стартует фоновой задачей в uvicorn-процессе
    (app.bot.start_embedded). Ошибки бота не роняют API.
    """
    bot_task = None
    if start_embedded is not None:
        try:
            bot_task = start_embedded()
        except Exception as exc:  # бот не должен ронять веб-сервис на старте
            logger.error("lifespan: embedded bot failed to start: %s", exc)
    yield
    if bot_task is not None:
        bot_task.cancel()
        try:
            await bot_task
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.warning("lifespan: embedded bot ended with: %s", exc)


app = FastAPI(title="Tourist TMA API", version="0.5.0", lifespan=lifespan)

_cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    # "*" + credentials браузеры режут — credentials только при явном списке
    allow_credentials=_cors_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(routes.router)
app.include_router(waypoints.router)
app.include_router(users.router)
app.include_router(admin.router)
app.include_router(checkins.router)
app.include_router(steps.router)
app.include_router(tickets.router)
app.include_router(tickets.admin_router)


def _health_payload(redis: str = "unknown") -> dict:
    return {"status": "ok", "service": "tourist-tma-backend", "redis": redis}


@app.get("/health")
def health():
    return _health_payload()


@app.get("/api/health")
async def api_health():
    """Health-check для Render (healthCheckPath). Redis — best-effort, 200 всегда."""
    redis_status = "not_configured"
    if settings.REDIS_URL:
        try:
            import redis.asyncio as aioredis

            client = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
            await client.ping()
            await client.aclose()
            redis_status = "up"
        except Exception:
            redis_status = "down"
    return _health_payload(redis_status)
