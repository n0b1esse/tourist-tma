"""Общие зависимости API (Шаг 3).

Временная схема аутентификации Шага 3: клиент после POST /api/auth/init-data
присылает свой Telegram ID в заголовке ``X-Telegram-Id``. Роль берётся из БД.
JWT-сессии по спецификации (§5) — следующим шагом.
"""

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.enums import UserRole
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


def require_roles(*roles: UserRole):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Нужна роль {[r.value for r in roles]}, текущая: {user.role.value}",
            )
        return user

    return checker


require_tester = require_roles(UserRole.tester, UserRole.admin)
require_admin = require_roles(UserRole.admin)
