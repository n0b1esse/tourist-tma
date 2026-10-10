"""Общие зависимости API (Шаг 3 + ТЗ: иерархия ролей и блокировки).

Иерархия: user(0) → tester(1) → admin(2) → super_admin(3).
Проверки идут «не ниже уровня»: tester пускает tester/admin/super_admin и т.д.
Заблокированные (is_blocked) не проходят ни одну require_* проверку, кроме чтения профиля.
"""

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.enums import UserRole, has_role_or_higher
from app.models.user import User


async def get_current_user(
    x_telegram_id: int | None = Header(default=None, alias="X-Telegram-Id"),
    db: AsyncSession = Depends(get_db),
) -> User:
    if x_telegram_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Нужен заголовок X-Telegram-Id (сначала POST /api/auth/init-data)",
        )
    user = await db.get(User, x_telegram_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Пользователь не найден — сначала POST /api/auth/init-data",
        )
    return user


def _ensure_not_blocked(user: User) -> None:
    if bool(getattr(user, "is_blocked", False)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Пользователь заблокирован супер-админом",
        )


def require_roles(*roles: UserRole):
    """Точное совпадение с одной из ролей (для обратной совместимости)."""
    async def checker(user: User = Depends(get_current_user)) -> User:
        _ensure_not_blocked(user)
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Нужна роль {[r.value for r in roles]}, текущая: {user.role.value}",
            )
        return user

    return checker


def require_min_role(minimum: UserRole):
    """Иерархическая проверка: роль не ниже minimum (ТЗ §2)."""
    async def checker(user: User = Depends(get_current_user)) -> User:
        _ensure_not_blocked(user)
        if not has_role_or_higher(user.role, minimum):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Нужна роль не ниже {minimum.value}, текущая: {user.role.value}",
            )
        return user

    return checker


# Иерархия ТЗ §2:
# user — всё базовое; tester — + тикеты/тестовые точки;
# admin — + свои маршруты/привязка тестеров; super_admin — всё.
require_tester = require_min_role(UserRole.tester)
require_admin = require_min_role(UserRole.admin)
require_super_admin = require_min_role(UserRole.super_admin)
