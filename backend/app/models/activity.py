"""Модели fitness-трекинга: суточные логи шагов (шагомер).

StepLog — агрегат за календарный день: шаги, дистанция, калории.
PK (telegram_id, log_date) гарантирует один ряд на день.
"""

from datetime import date as date_type
from datetime import datetime

from sqlalchemy import BigInteger, Date, DateTime, Float, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class StepLog(Base):
    __tablename__ = "step_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    telegram_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE"), nullable=False
    )
    log_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    steps: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    distance_km: Mapped[float] = mapped_column(Float, default=0.0, nullable=False, server_default="0.0")
    calories: Mapped[float] = mapped_column(Float, default=0.0, nullable=False, server_default="0.0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
        nullable=False,
    )
