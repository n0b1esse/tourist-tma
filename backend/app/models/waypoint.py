"""Модель waypoints — ядро двухрежимной системы draft/published (Шаг 2)."""

from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import ContentStatus, WaypointType


class Waypoint(Base):
    __tablename__ = "waypoints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    route_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("routes.id", ondelete="CASCADE"), nullable=True
    )
    created_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="SET NULL"), nullable=True
    )
    type: Mapped[WaypointType] = mapped_column(
        "type", SQLEnum(WaypointType, name="waypoint_type", native_enum=True), nullable=False
    )
    coordinates: Mapped[Any] = mapped_column(
        Geometry("POINT", srid=4326), nullable=False
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ContentStatus] = mapped_column(
        SQLEnum(ContentStatus, name="content_status", native_enum=True),
        default=ContentStatus.draft,
        nullable=False,
    )
    approved_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )
