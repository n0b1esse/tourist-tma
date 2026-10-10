"""ТЗ: super_admin, is_blocked, Экстремальный, новые типы точек, checkins/tickets.

Revision ID: 002_roles_checkins_tickets
Revises: 001_initial
"""

import sqlalchemy as sa
from alembic import op

revision = "002_roles_checkins_tickets"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Роль super_admin — PG enum нельзя ALTER через op напрямую портативно,
    #    поэтому сырой SQL с IF NOT EXISTS-подобной защитой.
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin'")
    # 2. Сложность «Экстремальный» (ТЗ §4А: 4 уровня фильтра)
    op.execute("ALTER TYPE difficulty_level ADD VALUE IF NOT EXISTS 'Экстремальный'")
    # 3. Новые категории точек (ТЗ §4Б)
    for v in ("waterfall", "lake", "peak", "camping", "spring", "recreation"):
        op.execute(f"ALTER TYPE waypoint_type ADD VALUE IF NOT EXISTS '{v}'")

    # 4. Блокировка пользователей
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE"
    )

    # 5. Чек-ины
    op.create_table(
        "checkins",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("telegram_id", sa.BigInteger, sa.ForeignKey("users.telegram_id", ondelete="CASCADE"), nullable=False),
        sa.Column("waypoint_id", sa.Integer, sa.ForeignKey("waypoints.id", ondelete="SET NULL"), nullable=True),
        sa.Column("route_id", sa.Integer, sa.ForeignKey("routes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("latitude", sa.Float, nullable=True),
        sa.Column("longitude", sa.Float, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.current_timestamp(), nullable=False),
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_checkins_telegram ON checkins (telegram_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_checkins_waypoint ON checkins (waypoint_id)")

    # 6. Тикеты (feedback / bug)
    op.create_table(
        "tickets",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("telegram_id", sa.BigInteger, sa.ForeignKey("users.telegram_id", ondelete="SET NULL"), nullable=True),
        sa.Column("kind", sa.String(20), server_default="feedback", nullable=False),
        sa.Column("subject", sa.String(255), nullable=True),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("status", sa.String(20), server_default="open", nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.current_timestamp(), nullable=False),
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status)")


def downgrade() -> None:
    op.drop_table("tickets")
    op.drop_table("checkins")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_blocked")
    # Значения ENUM обратно не удаляем (PG не поддерживает без пересоздания типа).
