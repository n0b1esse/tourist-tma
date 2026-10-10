"""Python-зеркало PG-перечислений из db/init/001_init.sql (Шаг 2)."""

import enum


class UserRole(str, enum.Enum):
    user = "user"
    tester = "tester"
    admin = "admin"
    super_admin = "super_admin"


# Иерархия ролей: user(0) < tester(1) < admin(2) < super_admin(3)
ROLE_LEVEL: dict[str, int] = {
    "user": 0,
    "tester": 1,
    "admin": 2,
    "super_admin": 3,
}


def role_level(role: "UserRole | str") -> int:
    value = role.value if isinstance(role, UserRole) else str(role)
    return ROLE_LEVEL.get(value, 0)


def has_role_or_higher(user_role: "UserRole | str", minimum: "UserRole | str") -> bool:
    return role_level(user_role) >= role_level(minimum)


class ContentStatus(str, enum.Enum):
    draft = "draft"
    review = "review"
    published = "published"
    rejected = "rejected"


class WaypointType(str, enum.Enum):
    # Базовые (совместимость со старыми данными)
    water = "water"
    camp = "camp"
    hazard = "hazard"
    viewpoint = "viewpoint"
    rest = "rest"
    # Расширенные категории ТЗ §4Б: водопады, озёра, пики, кемпинги, источники, зоны отдыха
    waterfall = "waterfall"
    lake = "lake"
    peak = "peak"
    camping = "camping"
    spring = "spring"
    recreation = "recreation"


class DifficultyLevel(str, enum.Enum):
    EASY = "Легкий"
    MEDIUM = "Средний"
    HARD = "Сложный"
    EXTREME = "Экстремальный"
