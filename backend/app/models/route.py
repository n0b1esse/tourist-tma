"""Модель routes (Шаг 2). Трек хранится как MultiLineString 4326."""

from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import DifficultyLevel


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    difficulty: Mapped[DifficultyLevel] = mapped_column(
        SQLEnum(DifficultyLevel, name="difficulty_level", native_enum=True),
        default=DifficultyLevel.MEDIUM,
        nullable=False,
    )
    distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    elevation_gain_m: Mapped[int] = mapped_column(Integer, nullable=False)
    estimated_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    max_elevation_m: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gpx_data: Mapped[Any | None] = mapped_column(
        Geometry("MULTILINESTRING", srid=4326), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )
