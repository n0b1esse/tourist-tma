"""Smoke-тест Шага 3 без Docker: подменяем БД фейком, проверяем HTTP-логику.

Запуск:  python tests/test_step3_smoke.py   (из папки backend/)
Проверяет:
  1. POST /api/auth/init-data с валидной подписью -> 200 + профиль с ролью
  2. POST /api/auth/init-data с битой подписью -> 401
  3. GET /api/waypoints?mode=tester обычным user -> 403
  4. GET /api/waypoints?mode=production -> 200, []
  5. POST /api/waypoints обычным user -> 403 (только tester/admin)
"""

import hashlib
import hmac
import json
import sys
import time
from urllib.parse import urlencode

sys.path.insert(0, ".")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.enums import UserRole  # noqa: E402
from app.models.user import User  # noqa: E402

TOKEN = "smoke-test-token"
settings.TELEGRAM_BOT_TOKEN = TOKEN
settings.AUTH_DATE_MAX_AGE = 86400


def make_init_data(tg_id: int = 777) -> str:
    fields = {
        "query_id": "q1",
        "user": json.dumps(
            {"id": tg_id, "first_name": "Smoke", "username": "smoker"},
            separators=(",", ":"),
        ),
        "auth_date": str(int(time.time())),
    }
    dcs = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret = hmac.new(b"WebAppData", TOKEN.encode(), hashlib.sha256).digest()
    signed = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields) + "&hash=" + signed


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None

    def one(self):
        assert len(self._rows) == 1
        return self._rows[0]

    def scalars(self):
        class _S:
            def all(self):
                return []

        return _S()


class FakeSession:
    """Минимум AsyncSession для наших эндпоинтов."""

    def __init__(self, user: User | None):
        self._user = user

    async def get(self, model, pk):
        if model.__name__ == "User" and self._user and pk == self._user.telegram_id:
            return self._user
        return None

    def add(self, obj):
        if isinstance(obj, User):
            self._user = obj

    async def commit(self):
        pass

    async def refresh(self, obj):
        pass

    async def execute(self, stmt):
        return FakeResult([])


def client_with(user: User | None) -> TestClient:
    async def fake_db():
        yield FakeSession(user)

    app.dependency_overrides[get_db] = fake_db
    return TestClient(app)


def main() -> None:
    # 1. валидный initData -> новый пользователь role=user
    c = client_with(None)
    r = c.post("/api/auth/init-data", json={"initData": make_init_data()})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["telegram_id"] == 777 and body["role"] == "user", body
    print("1. auth valid -> 200 + role=user OK:", body)

    # 2. битая подпись -> 401
    bad = make_init_data().replace("777", "778")
    r = c.post("/api/auth/init-data", json={"initData": bad})
    assert r.status_code == 401, r.text
    print("2. auth tampered -> 401 OK:", r.json()["detail"])

    # 3-5. обычный user и режимы
    user = User(
        telegram_id=777, username="smoker", full_name="Smoke",
        role=UserRole.user, total_distance_km=0.0, total_elevation_m=0,
    )
    cu = client_with(user)
    h = {"X-Telegram-Id": "777"}

    r = cu.get("/api/waypoints", params={"mode": "tester"}, headers=h)
    assert r.status_code == 403, r.text
    print("3. tester mode as user -> 403 OK")

    r = cu.get("/api/waypoints", params={"mode": "production"}, headers=h)
    assert r.status_code == 200 and r.json() == [], r.text
    print("4. production mode -> 200 [] OK")

    r = cu.post(
        "/api/waypoints",
        json={"type": "water", "latitude": 56.8, "longitude": 60.6},
        headers=h,
    )
    assert r.status_code == 403, r.text
    print("5. POST waypoint as user -> 403 OK")

    # 6. без заголовка -> 401
    r = cu.get("/api/waypoints")
    assert r.status_code == 401, r.text
    print("6. no X-Telegram-Id -> 401 OK")

    print("SMOKE_OK: 6/6")


if __name__ == "__main__":
    main()
