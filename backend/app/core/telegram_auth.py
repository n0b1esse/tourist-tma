"""Валидация Telegram WebApp initData (Шаг 3.1).

Алгоритм по официальной документации Telegram:
1. initData — query-string вида ``query_id=...&user=<json>&auth_date=...&hash=...``.
2. Убираем ``hash``, остальные пары сортируем по ключу и склеиваем
   в ``data_check_string`` через ``"\\n"`` как ``key=value``.
3. ``secret_key = HMAC_SHA256(key="WebAppData", msg=BOT_TOKEN)``.
4. Ожидаемый хеш — ``HMAC_SHA256(key=secret_key, msg=data_check_string)`` (hex).
5. Сравниваем через ``hmac.compare_digest`` и проверяем свежесть ``auth_date``.

Только стандартная библиотека — модуль импортируется без FastAPI/SQLAlchemy,
что позволяет тестировать подпись на любой машине.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl


def build_data_check_string(init_data: str) -> tuple[str, str]:
    """Возвращает (data_check_string, hash_from_client). Бросает ValueError."""
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    client_hash = pairs.pop("hash", "")
    if not client_hash:
        raise ValueError("initData без поля 'hash'")
    data_check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    return data_check_string, client_hash


def compute_hash(data_check_string: str, bot_token: str) -> str:
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    return hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()


def validate_init_data(
    init_data: str, bot_token: str, max_age_seconds: int = 86400
) -> dict:
    """Проверяет подпись и свежесть. Возвращает распарсенные поля (user — dict).

    Бросает ValueError с понятной причиной при любой проблеме.
    """
    if not bot_token:
        raise ValueError("TELEGRAM_BOT_TOKEN не задан — проверка подписи невозможна")
    if not init_data:
        raise ValueError("пустой initData")

    data_check_string, client_hash = build_data_check_string(init_data)
    expected = compute_hash(data_check_string, bot_token)
    if not hmac.compare_digest(expected, client_hash):
        raise ValueError("неверная подпись initData (hash mismatch)")

    data = dict(parse_qsl(init_data, keep_blank_values=True))
    if max_age_seconds > 0:
        try:
            auth_date = int(data.get("auth_date", "0"))
        except ValueError:
            raise ValueError("поле 'auth_date' не число") from None
        if time.time() - auth_date > max_age_seconds:
            raise ValueError("initData устарел (auth_date старше лимита)")

    user_raw = data.get("user", "")
    try:
        user = json.loads(user_raw) if user_raw else {}
    except json.JSONDecodeError:
        raise ValueError("поле 'user' — невалидный JSON") from None
    if not isinstance(user, dict) or "id" not in user:
        raise ValueError("в initData нет user.id")
    data["user"] = user
    return data
