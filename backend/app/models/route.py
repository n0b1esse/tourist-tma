"""Модель routes (Шаг 2 + Fitness-трекинг). Трек хранится как MultiLineString 4326."""

from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import ActivityType, ContentStatus, DifficultyLevel


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    author_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    activity_type: Mapped[ActivityType] = mapped_column(
        SQLEnum(ActivityType, name="activity_type", native_enum=True),
        default=ActivityType.hiking,
        nullable=False,
        server_default="hiking",
    )
    difficulty: Mapped[DifficultyLevel] = mapped_column(
        SQLEnum(DifficultyLevel, name="difficulty_level", native_enum=True),
        default=DifficultyLevel.MEDIUM,
        nullable=False,
    )
    distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    elevation_gain_m: Mapped[int] = mapped_column(Integer, nullable=False)
    steps_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    estimated_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    max_elevation_m: Mapped[int | None] = mapped_column(Integer, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    geojson_points: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ContentStatus] = mapped_column(
        SQLEnum(ContentStatus, name="content_status", native_enum=True),
        default=ContentStatus.published,
        nullable=False,
        server_default="published",
    )
    gpx_data: Mapped[Any | None] = mapped_column(
        Geometry("MULTILINESTRING", srid=4326), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )
