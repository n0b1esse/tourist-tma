"""Telegram-бот @tourist_kg_bot (ТЗ §5, aiogram 3).

- /start: приветствие + инлайн-клавиатура (Mini App, топ-5 маршрутов, профиль, поддержка)
- Кнопка Menu Button → прямой запуск Mini App («Открыть карту»)
- Авто-уведомления: бейджи, рассылки супер-админа, модерация — через core.notifier
- Поддержка: FSM-форма текста → тикет супер-админу (таблица tickets + DM)

Запуск: python -m app.bot  (нужен TELEGRAM_BOT_TOKEN; MINI_APP_URL — ссылка на TMA)
"""

from __future__ import annotations

import asyncio
import html
import logging

from aiogram import Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.checkin import Ticket
from app.models.route import Route
from app.models.user import User

log = logging.getLogger("tourist-tma.bot")

MINI_APP_URL = settings.MINI_APP_URL or "https://t.me/tourist_kg_bot"


def main_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🗺️ Открыть карту & Mini App", web_app=WebAppInfo(url=MINI_APP_URL))],
            [InlineKeyboardButton(text="🏔️ Популярные маршруты", callback_data="top_routes")],
            [
                InlineKeyboardButton(text="👤 Мой профиль", callback_data="my_profile"),
                InlineKeyboardButton(text="🆘 Поддержка", callback_data="support"),
            ],
        ]
    )


START_TEXT = (
    "🏔️ <b>Привет! Я — Tourist KG Bot</b>\n\n"
    "Помогаю исследовать Кыргызстан:\n"
    "🗺️ Интерактивная карта хайков и точек\n"
    "🥾 Топ маршрутов вокруг Бишкека\n"
    "📍 Чек-ины в радиусе локаций + бейджи\n"
    "⏺️ GPS-запись треков + шагомер 👟\n"
    "🏅 Достижения: «Первый хайк», «Покоритель 3000м», «Легенда Бишкека», "
    "«Первые 10 000 шагов», «Марафонец (50 км)», «Покоритель троп»\n\n"
    "Нажми кнопку ниже, чтобы открыть Mini App 👇"
)


class SupportForm(StatesGroup):
    waiting_text = State()


async def _safe_answer(message: Message | None, text: str, **kwargs) -> None:
    """Ответ пользователю, который никогда не роняет хендлер."""
    if message is None:
        return
    try:
        await message.answer(text, **kwargs)
    except Exception as exc:
        log.warning("bot: answer failed: %s", exc)


async def _safe_callback_answer(cb: CallbackQuery) -> None:
    try:
        await cb.answer()
    except Exception as exc:
        log.warning("bot: callback answer failed: %s", exc)


async def cmd_start(message: Message) -> None:
    """/start: регистрация новичка + приветствие. Падение БД — НЕ тишина."""
    try:
        from_user = message.from_user
        if from_user is None:
            # Сообщения из каналов/анонимных админов — отвечаем без регистрации
            await _safe_answer(message, START_TEXT, reply_markup=main_keyboard())
            return
        # Upsert пользователя (роль не трогаем, как в dev-login)
        try:
            async with SessionLocal() as db:
                try:
                    user = await db.get(User, from_user.id)
                    if user is None:
                        from app.models.enums import UserRole

                        user = User(
                            telegram_id=from_user.id,
                            username=from_user.username,
                            full_name=from_user.full_name,
                            role=UserRole.user,
                        )
                        db.add(user)
                        await db.commit()
                        log.info("bot: new user registered: %s", from_user.id)
                except Exception:
                    try:
                        await db.rollback()
                    except Exception:
                        pass
                    raise
        except Exception as exc:  # БД может быть недоступна — бот всё равно отвечает
            log.warning("bot: upsert failed: %s", exc)
        await _safe_answer(message, START_TEXT, reply_markup=main_keyboard())
    except Exception as exc:  # последний рубеж — бот не уходит в тишину
        log.exception("bot: cmd_start crashed: %s", exc)
        await _safe_answer(message, START_TEXT, reply_markup=main_keyboard())


async def cb_top_routes(cb: CallbackQuery) -> None:
    try:
        try:
            async with SessionLocal() as db:
                from sqlalchemy import select

                rows = (await db.execute(select(Route).order_by(Route.id).limit(5))).scalars().all()
        except Exception as exc:
            log.warning("bot: top routes failed: %s", exc)
            rows = []
        if not rows:
            await _safe_answer(cb.message, "Маршрутов пока нет — загляни позже 🥾", reply_markup=main_keyboard())
            return
        kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text=f"⛰ {r.title[:40]}",
                        web_app=WebAppInfo(url=f"{MINI_APP_URL}?route={r.id}"),
                    )
                ]
                for r in rows
            ]
            + [[InlineKeyboardButton(text="« Назад", callback_data="back_start")]]
        )
        lines = ["🏔️ <b>Топ-5 хайков:</b>"]
        for i, r in enumerate(rows, 1):
            diff = r.difficulty.value if hasattr(r.difficulty, "value") else r.difficulty
            lines.append(f"{i}. <b>{html.escape(r.title)}</b> — {html.escape(str(diff))}, {r.distance_km} км")
        await _safe_answer(cb.message, "\n".join(lines), reply_markup=kb)
    except Exception as exc:
        log.exception("bot: cb_top_routes crashed: %s", exc)
        await _safe_answer(cb.message, "Что-то пошло не так, попробуй позже 🙏", reply_markup=main_keyboard())
    finally:
        await _safe_callback_answer(cb)


async def cb_profile(cb: CallbackQuery) -> None:
    try:
        if cb.from_user is None:
            await _safe_answer(cb.message, "Не вижу твой профиль 🙂")
            return
        try:
            async with SessionLocal() as db:
                from sqlalchemy import func, select

                from app.models.achievement import Achievement, UserAchievement
                from app.models.checkin import Checkin

                user = await db.get(User, cb.from_user.id)
                if user is None:
                    await _safe_answer(cb.message, "Профиль не найден — нажми /start ещё раз 🙂")
                    return
                checkins = (
                    await db.execute(
                        select(func.count()).select_from(Checkin).where(Checkin.telegram_id == user.telegram_id)
                    )
                ).scalar() or 0
                achs = (
                    await db.execute(
                        select(Achievement)
                        .join(UserAchievement, UserAchievement.achievement_id == Achievement.id)
                        .where(UserAchievement.telegram_id == user.telegram_id)
                    )
                ).scalars().all()
        except Exception as exc:
            log.warning("bot: profile failed: %s", exc)
            await _safe_answer(cb.message, "Не смог загрузить профиль, попробуй позже 🙏")
            return
        badges = ", ".join(f"🏅 {a.title}" for a in achs) if achs else "пока нет — выйди на маршрут 🥾"
        role = user.role.value if hasattr(user.role, "value") else user.role
        await _safe_answer(
            cb.message,
            f"👤 <b>{html.escape(user.full_name or user.username or 'Турист')}</b>\n"
            f"Роль: <b>{html.escape(str(role))}</b>\n"
            f"📏 {user.total_distance_km or 0} км · ⛰ {user.total_elevation_m or 0} м\n"
            f"📍 Чек-инов: <b>{checkins}</b>\n"
            f"Достижения: {badges}",
            reply_markup=main_keyboard(),
        )
    except Exception as exc:
        log.exception("bot: cb_profile crashed: %s", exc)
        await _safe_answer(cb.message, "Что-то пошло не так, попробуй позже 🙏", reply_markup=main_keyboard())
    finally:
        await _safe_callback_answer(cb)


async def cb_support(cb: CallbackQuery, state: FSMContext) -> None:
    try:
        await state.set_state(SupportForm.waiting_text)
        await _safe_answer(
            cb.message,
            "🆘 <b>Поддержка / обратная связь</b>\n\n"
            "Напиши сообщение администраторам одним текстом — передам супер-админу.\n"
            "Для отмены отправь /cancel.",
        )
    except Exception as exc:
        log.exception("bot: cb_support crashed: %s", exc)
    finally:
        await _safe_callback_answer(cb)


async def cb_back(cb: CallbackQuery) -> None:
    try:
        await _safe_answer(cb.message, START_TEXT, reply_markup=main_keyboard())
    except Exception as exc:
        log.exception("bot: cb_back crashed: %s", exc)
    finally:
        await _safe_callback_answer(cb)


async def support_text(message: Message, state: FSMContext, bot: Bot) -> None:
    try:
        text = (message.text or "").strip()
        if not text:
            await _safe_answer(message, "Пустое сообщение — попробуй ещё раз или /cancel")
            return
        from_user = message.from_user
        if from_user is None:
            await _safe_answer(message, "Не вижу отправителя 🙂")
            await state.clear()
            return
        try:
            async with SessionLocal() as db:
                try:
                    db.add(
                        Ticket(
                            telegram_id=from_user.id,
                            kind="feedback",
                            subject="Из бота",
                            message=text[:4000],
                            status="open",
                        )
                    )
                    await db.commit()
                except Exception:
                    try:
                        await db.rollback()
                    except Exception:
                        pass
                    raise
            # Дублируем супер-админу в личку (best-effort)
            if settings.ADMIN_TELEGRAM_ID and settings.ADMIN_TELEGRAM_ID != from_user.id:
                try:
                    name = html.escape(from_user.full_name or str(from_user.id))
                    await bot.send_message(
                        settings.ADMIN_TELEGRAM_ID,
                        f"🆘 <b>Поддержка от {name}</b> (id <code>{from_user.id}</code>):\n{html.escape(text[:1000])}",
                    )
                except Exception as exc:
                    log.warning("bot: admin DM failed: %s", exc)
        except Exception as exc:
            log.warning("bot: support save failed: %s", exc)
        try:
            await state.clear()
        except Exception as exc:
            log.warning("bot: state clear failed: %s", exc)
        await _safe_answer(message, "✅ Спасибо! Сообщение передано администраторам 🙌", reply_markup=main_keyboard())
    except Exception as exc:
        log.exception("bot: support_text crashed: %s", exc)
        await _safe_answer(message, "Что-то пошло не так, попробуй позже 🙏", reply_markup=main_keyboard())


async def cmd_cancel(message: Message, state: FSMContext) -> None:
    try:
        await state.clear()
    except Exception as exc:
        log.warning("bot: state clear failed: %s", exc)
    await _safe_answer(message, "Отменено. Чем помочь?", reply_markup=main_keyboard())


async def setup_menu_button(bot: Bot) -> None:
    """Кнопка слева от поля ввода → прямой запуск Mini App (ТЗ §5Б)."""
    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="Открыть карту", web_app=WebAppInfo(url=MINI_APP_URL))
        )
        log.info("bot: menu button → %s", MINI_APP_URL)
    except Exception as exc:
        log.warning("bot: menu button failed: %s", exc)


async def on_error(event) -> None:
    """Глобальный перехват ошибок диспетчера: логируем, тишина исключена."""
    try:
        log.exception("bot: unhandled error: %s", getattr(event, "exception", event))
    except Exception:
        pass


def build_dispatcher() -> Dispatcher:
    dp = Dispatcher()
    dp.message.register(cmd_start, CommandStart())
    dp.message.register(cmd_start, Command("start"))
    dp.message.register(cmd_cancel, Command("cancel"))
    dp.callback_query.register(cb_top_routes, F.data == "top_routes")
    dp.callback_query.register(cb_profile, F.data == "my_profile")
    dp.callback_query.register(cb_support, F.data == "support")
    dp.callback_query.register(cb_back, F.data == "back_start")
    dp.message.register(support_text, SupportForm.waiting_text)
    dp.error.register(on_error)
    return dp


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    if not settings.TELEGRAM_BOT_TOKEN:
        raise SystemExit("TELEGRAM_BOT_TOKEN не задан — бот не стартует")
    bot = Bot(
        token=settings.TELEGRAM_BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    # Fail-fast: проверяем токен и сеть ДО polling — иначе молчание без диагноза
    try:
        me = await bot.get_me()
        log.info("bot: token OK, running as @%s (id %s)", me.username, me.id)
    except Exception as exc:
        log.error("bot: get_me failed — проверь TELEGRAM_BOT_TOKEN и сеть: %s", exc)
        raise SystemExit(f"TELEGRAM_BOT_TOKEN недействителен или нет сети: {exc}") from exc
    log.info("bot: mode=polling (webhook не настроен — слушаем getUpdates), mini_app=%s", MINI_APP_URL or "?")
    await setup_menu_button(bot)
    dp = build_dispatcher()
    # Повторы при сетевых сбоях; конфликт второго инстанса — сразу в лог без ретраев
    retries = 0
    while True:
        try:
            log.info("bot: polling started (attempt %s)", retries + 1)
            await dp.start_polling(bot)
            break  # штатная остановка
        except Exception as exc:
            name = type(exc).__name__
            msg = str(exc)
            if "Conflict" in name or "conflict" in msg or "terminated by other getUpdates" in msg:
                log.error(
                    "bot: polling CONFLICT — второй инстанс бота уже слушает обновления. "
                    "Останови дубль (Render/Docker) и перезапусти. %s: %s",
                    name, msg,
                )
                break
            retries += 1
            if retries >= 5:
                log.error("bot: polling failed %s раз подряд, сдаюсь: %s: %s", retries, name, msg)
                raise
            delay = min(5 * retries, 30)
            log.warning("bot: polling error (%s: %s), retry через %s c", name, msg, delay)
            await asyncio.sleep(delay)


if __name__ == "__main__":
    asyncio.run(main())
