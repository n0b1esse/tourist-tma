"""Tourist TMA Backend — точка входа FastAPI."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, routes, users, waypoints
from app.core.config import settings

app = FastAPI(title="Tourist TMA API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(routes.router)
app.include_router(waypoints.router)
app.include_router(users.router)


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
