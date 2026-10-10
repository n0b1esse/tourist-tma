"""Уведомления супер-админу о новых черновиках (деплой-шаг).

Best-effort: отправка идёт через Bot API напрямую (без aiogram-хендлеров),
любая ошибка только логируется и никогда не роняет HTTP-запрос.
Если TELEGRAM_BOT_TOKEN или ADMIN_TELEGRAM_ID не заданы — тихий no-op.
"""

from __future__ import annotations

import html
import logging
from typing import TYPE_CHECKING

import httpx

from app.core.config import settings

if TYPE_CHECKING:  # только для аннотаций, без циклов импорта
    from app.models.user import User
    from app.models.waypoint import Waypoint

log = logging.getLogger("tourist-tma.notifier")


def build_draft_message(wp: Waypoint, author: User, lat: float, lon: float) -> str:
    """Текст уведомления. Чистая функция — покрыта локальным тестом."""
    title = html.escape(wp.title or "(без названия)")
    author_name = html.escape(author.full_name or author.username or str(author.telegram_id))
    return (
        f"🧪 <b>Новый черновик #{wp.id}</b>\n"
        f"Тип: <b>{html.escape(str(wp.type.value if hasattr(wp.type, 'value') else wp.type))}</b>\n"
        f"Название: {title}\n"
        f"Автор: {author_name} (id <code>{author.telegram_id}</code>)\n"
        f"Координаты: <code>{lat:.5f}, {lon:.5f}</code>\n"
        f"Маршрут: {wp.route_id or '—'}"
    )


async def notify_admin_draft(wp: Waypoint, author: User, lat: float, lon: float) -> bool:
    """Отправить уведомление супер-админу. Возвращает True при успехе."""
    token = settings.TELEGRAM_BOT_TOKEN
    admin_id = settings.ADMIN_TELEGRAM_ID
    if not token or not admin_id:
        log.debug("notifier: BOT_TOKEN/ADMIN_ID не заданы — пропуск")
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={
                    "chat_id": admin_id,
                    "text": build_draft_message(wp, author, lat, lon),
                    "parse_mode": "HTML",
                },
            )
            resp.raise_for_status()
        log.info("notifier: черновик #%s отправлен админу %s", wp.id, admin_id)
        return True
    except Exception as exc:  # noqa: BLE001 — best-effort по дизайну
        log.warning("notifier: не удалось отправить черновик #%s: %s", wp.id, exc)
        return False
