"""Python-зеркало PG-перечислений из db/init/001_init.sql (Шаг 2)."""

import enum


class UserRole(str, enum.Enum):
    user = "user"
    tester = "tester"
    admin = "admin"


class ContentStatus(str, enum.Enum):
    draft = "draft"
    review = "review"
    published = "published"
    rejected = "rejected"


class WaypointType(str, enum.Enum):
    water = "water"
    camp = "camp"
    hazard = "hazard"
    viewpoint = "viewpoint"
    rest = "rest"


class DifficultyLevel(str, enum.Enum):
    EASY = "Легкий"
    MEDIUM = "Средний"
    HARD = "Сложный"
