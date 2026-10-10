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


async def _send(chat_id: int, text: str) -> bool:
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        log.debug("notifier: BOT_TOKEN не задан — пропуск")
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            )
            resp.raise_for_status()
        return True
    except Exception as exc:  # noqa: BLE001 — best-effort по дизайну
        log.warning("notifier: send to %s failed: %s", chat_id, exc)
        return False


async def notify_admin_draft(wp: Waypoint, author: User, lat: float, lon: float) -> bool:
    """Отправить уведомление супер-админу. Возвращает True при успехе."""
    admin_id = settings.ADMIN_TELEGRAM_ID
    if not admin_id:
        log.debug("notifier: ADMIN_ID не задан — пропуск")
        return False
    ok = await _send(admin_id, build_draft_message(wp, author, lat, lon))
    if ok:
        log.info("notifier: черновик #%s отправлен админу %s", wp.id, admin_id)
    return ok


async def notify_badge(telegram_id: int, badge_title: str) -> bool:
    """Пуш о новом бейдже за чек-ин (ТЗ §5Б)."""
    safe = html.escape(badge_title)
    return await _send(telegram_id, f"🏅 <b>Новый бейдж!</b>\nТы получил(а): <b>{safe}</b>")


async def notify_ticket(author: User, kind: str, subject: str | None, message: str) -> bool:
    """Тикет/фидбек супер-админу (ТЗ §2, §5А)."""
    admin_id = settings.ADMIN_TELEGRAM_ID
    if not admin_id:
        return False
    label = "🐞 Баг-репорт" if kind == "bug" else "🆘 Обратная связь"
    name = html.escape(author.full_name or author.username or str(author.telegram_id))
    subj = html.escape(subject or "—")
    body = html.escape(message[:1000])
    return await _send(
        admin_id,
        f"{label}\nОт: {name} (id <code>{author.telegram_id}</code>)\n"
        f"Тема: {subj}\n{body}",
    )


async def notify_moderation(telegram_id: int | None, title: str, verdict: str) -> bool:
    """Уведомление гиду/админу о статусе модерации маршрута (ТЗ §5Б)."""
    if not telegram_id:
        return False
    safe = html.escape(title or "—")
    emoji = "✅" if verdict == "published" else "❌"
    return await _send(
        telegram_id,
        f"{emoji} <b>Модерация маршрута</b>\n«{safe}» — статус: <b>{html.escape(verdict)}</b>",
    )


async def broadcast_message(chat_ids: list[int], text: str) -> tuple[int, int]:
    """Сервисная рассылка супер-админа (ТЗ §3). Возвращает (sent, failed)."""
    safe = text[:4000]
    sent = failed = 0
    for cid in chat_ids:
        ok = await _send(cid, html.escape(safe))
        if ok:
            sent += 1
        else:
            failed += 1
    return sent, failed


# --- Push-уведомления о смене роли (ТЗ: PATCH /api/admin/users/{id}/role) ---
ROLE_MESSAGES: dict[str, str] = {
    "tester": (
        "🧪 <b>Вам присвоена роль Тестировщика!</b>\n"
        "Теперь вы можете отправлять баг-репорты и предлагать новые точки на карте. "
        "Спасибо за помощь в развитии проекта!"
    ),
    "admin": (
        "🏔️ <b>Вам присвоена роль Организатора / Гида!</b>\n"
        "Теперь вам доступно создание, публикация и редактирование собственных "
        "туристических маршрутов и локаций."
    ),
    "super_admin": (
        "⚡ <b>Вам предоставлены права Супер-Администратора!</b>\n"
        "Вам открыт полный доступ к панели управления проектом и статистике."
    ),
    "user": (
        "ℹ️ <b>Ваша роль была изменена на Пользователь.</b>\n"
        "Вам доступен стандартный функционал поиска маршрутов и чек-инов."
    ),
}


def build_role_message(role) -> str:
    """Текст push-уведомления о смене роли. Чистая функция — покрыта тестом."""
    value = role.value if hasattr(role, "value") else str(role)
    return ROLE_MESSAGES.get(value, ROLE_MESSAGES["user"])


async def notify_role_change(telegram_id: int, role) -> bool:
    """Отправить пользователю push о смене роли. Никогда не бросает исключение.

    Best-effort: если пользователь заблокировал бота (aiogram: BotBlocked /
    TelegramForbiddenError / TelegramAPIError; httpx-вариант: 403 от Bot API),
    ошибка только логируется и возвращается False. Вызывающий код (admin API)
    коммитит роль в БД ДО вызова, поэтому смена прав сохраняется в любом случае.
    """
    try:
        text = build_role_message(role)
        ok = await _send(telegram_id, text)
        if ok:
            value = role.value if hasattr(role, "value") else str(role)
            log.info("notifier: роль %s -> %s уведомлён", telegram_id, value)
        else:
            log.warning(
                "notifier: роль %s не уведомлён (send failed, возможно бот заблокирован)",
                telegram_id,
            )
        return ok
    except Exception as exc:  # noqa: BLE001 — BotBlocked/TelegramAPIError/httpx
        log.warning(
            "notifier: role change push to %s failed (вероятно, бот заблокирован): %s",
            telegram_id,
            exc,
        )
        return False
