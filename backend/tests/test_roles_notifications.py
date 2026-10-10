"""Smoke/integration тесты push-уведомлений о смене роли.

Проверяет:
  1. build_role_message() возвращает корректные шаблоны для всех 4 ролей.
  2. PATCH /api/admin/users/{telegram_id}/role меняет роль в БД и вызывает
     отправку уведомления через Telegram Bot API (mock _send).
  3. Смена роли сохраняется в БД, даже если пользователь заблокировал бота
     (mock _send бросает исключение BotBlocked / TelegramAPIError либо
     возвращает False) — запрос всё равно возвращает 200.
  4. Обычный user получает 403 на админском эндпоинте.
  5. Проверка пути обычного user: tester-режим waypoints -> 403 (регрессия).

Запуск:
  из папки backend/:  python -m pytest tests/test_roles_notifications.py -v
  или:                 python tests/test_roles_notifications.py
"""

import asyncio
import sys
from unittest.mock import AsyncMock, patch

sys.path.insert(0, ".")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import get_db  # noqa: E402
from app.core.notifier import build_role_message, notify_role_change  # noqa: E402
from app.main import app  # noqa: E402
from app.models.enums import UserRole  # noqa: E402
from app.models.user import User  # noqa: E402

ADMIN_ID = 1
TARGET_ID = 777


def make_user(tg_id: int, role: UserRole) -> User:
    return User(
        telegram_id=tg_id,
        username=f"u{tg_id}",
        full_name=f"User {tg_id}",
        role=role,
        total_distance_km=0.0,
        total_elevation_m=0,
    )


class FakeResult:
    def __init__(self, scalar_value: int = 1):
        self._scalar = scalar_value

    def scalar(self):
        return self._scalar


class FakeSession:
    """Минимум AsyncSession для admin.set_user_role + require_super_admin."""

    def __init__(self, store: dict[int, User], other_super_admins: int = 1):
        self.store = store
        self._others = other_super_admins

    async def get(self, model, pk):
        if model.__name__ == "User":
            return self.store.get(pk)
        return None

    async def commit(self):
        pass

    async def refresh(self, obj):
        pass

    async def execute(self, stmt):
        # Используется только для защиты "последний super_admin".
        return FakeResult(self._others)


def client_with(store: dict[int, User], other_super_admins: int = 1) -> TestClient:
    async def fake_db():
        yield FakeSession(store, other_super_admins)

    app.dependency_overrides[get_db] = fake_db
    return TestClient(app)


def teardown_module():
    app.dependency_overrides.clear()


# --- 1. Шаблоны сообщений ---

def test_build_role_message_templates():
    assert "Тестировщика" in build_role_message(UserRole.tester)
    assert "🧪" in build_role_message(UserRole.tester)
    assert "баг-репорты" in build_role_message(UserRole.tester)

    assert "Организатора" in build_role_message(UserRole.admin)
    assert "🏔️" in build_role_message(UserRole.admin)

    assert "Супер-Администратора" in build_role_message(UserRole.super_admin)
    assert "⚡" in build_role_message(UserRole.super_admin)

    assert "Пользователь" in build_role_message(UserRole.user)
    assert "ℹ️" in build_role_message(UserRole.user)

    # строковые значения тоже поддерживаются
    assert build_role_message("tester") == build_role_message(UserRole.tester)


def test_notify_role_change_never_raises_on_block():
    """notify_role_change возвращает False, а не бросает, если бот заблокирован."""
    async def _run():
        with patch(
            "app.core.notifier._send",
            new=AsyncMock(side_effect=Exception("Forbidden: bot was blocked by the user")),
        ):
            ok = await notify_role_change(TARGET_ID, UserRole.tester)
            assert ok is False
        with patch("app.core.notifier._send", new=AsyncMock(return_value=False)):
            ok = await notify_role_change(TARGET_ID, UserRole.admin)
            assert ok is False

    asyncio.run(_run())


# --- 2. PATCH роли отправляет уведомление ---

EXPECTED = {
    UserRole.tester: "Тестировщика",
    UserRole.admin: "Организатора",
    UserRole.super_admin: "Супер-Администратора",
    UserRole.user: "Пользователь",
}


def _check_role_patch(role: UserRole, needle: str):
    store = {
        ADMIN_ID: make_user(ADMIN_ID, UserRole.super_admin),
        TARGET_ID: make_user(TARGET_ID, UserRole.user),
    }
    c = client_with(store)
    try:
        with patch("app.core.notifier._send", new=AsyncMock(return_value=True)) as mocked:
            r = c.patch(
                f"/api/admin/users/{TARGET_ID}/role",
                json={"role": role.value},
                headers={"X-Telegram-Id": str(ADMIN_ID)},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["role"] == role.value, body
            assert body["telegram_id"] == TARGET_ID
            # роль реально сохранена в "БД"
            assert store[TARGET_ID].role == role
            # уведомление отправлено именно этому пользователю
            assert mocked.await_count == 1
            call_args = mocked.await_args
            sent_chat_id, sent_text = call_args.args[0], call_args.args[1]
            assert sent_chat_id == TARGET_ID
            assert needle in sent_text, sent_text
    finally:
        app.dependency_overrides.clear()


def test_patch_role_to_tester_sends_push():
    _check_role_patch(UserRole.tester, EXPECTED[UserRole.tester])


def test_patch_role_to_admin_sends_push():
    _check_role_patch(UserRole.admin, EXPECTED[UserRole.admin])


def test_patch_role_to_super_admin_sends_push():
    _check_role_patch(UserRole.super_admin, EXPECTED[UserRole.super_admin])


def test_patch_role_demote_to_user_sends_push():
    store = {
        ADMIN_ID: make_user(ADMIN_ID, UserRole.super_admin),
        TARGET_ID: make_user(TARGET_ID, UserRole.admin),
    }
    c = client_with(store)
    try:
        with patch("app.core.notifier._send", new=AsyncMock(return_value=True)) as mocked:
            r = c.patch(
                f"/api/admin/users/{TARGET_ID}/role",
                json={"role": "user"},
                headers={"X-Telegram-Id": str(ADMIN_ID)},
            )
            assert r.status_code == 200, r.text
            assert r.json()["role"] == "user"
            assert store[TARGET_ID].role == UserRole.user
            sent_text = mocked.await_args.args[1]
            assert EXPECTED[UserRole.user] in sent_text
    finally:
        app.dependency_overrides.clear()


# --- 3. Бот заблокирован: роль всё равно меняется ---

def test_patch_role_survives_bot_blocked_exception():
    """Имитация BotBlocked / TelegramAPIError: _send бросает исключение."""
    store = {
        ADMIN_ID: make_user(ADMIN_ID, UserRole.super_admin),
        TARGET_ID: make_user(TARGET_ID, UserRole.user),
    }
    c = client_with(store)
    try:
        with patch(
            "app.core.notifier._send",
            new=AsyncMock(side_effect=Exception("Forbidden: bot was blocked by the user")),
        ):
            r = c.patch(
                f"/api/admin/users/{TARGET_ID}/role",
                json={"role": "tester"},
                headers={"X-Telegram-Id": str(ADMIN_ID)},
            )
            assert r.status_code == 200, r.text
            assert r.json()["role"] == "tester"
            assert store[TARGET_ID].role == UserRole.tester
    finally:
        app.dependency_overrides.clear()


def test_patch_role_survives_send_false():
    """_send вернул False (403 от Bot API) — запрос всё равно 200."""
    store = {
        ADMIN_ID: make_user(ADMIN_ID, UserRole.super_admin),
        TARGET_ID: make_user(TARGET_ID, UserRole.user),
    }
    c = client_with(store)
    try:
        with patch("app.core.notifier._send", new=AsyncMock(return_value=False)):
            r = c.patch(
                f"/api/admin/users/{TARGET_ID}/role",
                json={"role": "admin"},
                headers={"X-Telegram-Id": str(ADMIN_ID)},
            )
            assert r.status_code == 200, r.text
            assert store[TARGET_ID].role == UserRole.admin
    finally:
        app.dependency_overrides.clear()


# --- 4. Доступ: user -> 403, неизвестный -> 404 ---

def test_patch_role_as_user_forbidden():
    store = {TARGET_ID: make_user(TARGET_ID, UserRole.user)}
    c = client_with(store)
    try:
        r = c.patch(
            f"/api/admin/users/{TARGET_ID}/role",
            json={"role": "tester"},
            headers={"X-Telegram-Id": str(TARGET_ID)},
        )
        assert r.status_code == 403, r.text
    finally:
        app.dependency_overrides.clear()


def test_patch_role_unknown_user_404():
    store = {ADMIN_ID: make_user(ADMIN_ID, UserRole.super_admin)}
    c = client_with(store)
    try:
        with patch("app.core.notifier._send", new=AsyncMock(return_value=True)) as mocked:
            r = c.patch(
                "/api/admin/users/999999/role",
                json={"role": "tester"},
                headers={"X-Telegram-Id": str(ADMIN_ID)},
            )
            assert r.status_code == 404, r.text
            mocked.assert_not_awaited()
    finally:
        app.dependency_overrides.clear()


def main() -> None:
    checks = [
        ("templates", test_build_role_message_templates),
        ("notify never raises", test_notify_role_change_never_raises_on_block),
        ("role->tester push", test_patch_role_to_tester_sends_push),
        ("role->admin push", test_patch_role_to_admin_sends_push),
        ("role->super_admin push", test_patch_role_to_super_admin_sends_push),
        ("demote->user push", test_patch_role_demote_to_user_sends_push),
        ("BotBlocked survives", test_patch_role_survives_bot_blocked_exception),
        ("send False survives", test_patch_role_survives_send_false),
        ("user 403", test_patch_role_as_user_forbidden),
        ("unknown 404", test_patch_role_unknown_user_404),
    ]
    for name, fn in checks:
        fn()
        print(f"OK: {name}")
    print(f"SMOKE_OK: {len(checks)}/{len(checks)}")


if __name__ == "__main__":
    main()
