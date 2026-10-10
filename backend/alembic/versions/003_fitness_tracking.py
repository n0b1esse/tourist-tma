"""Fitness-трекинг: activity_type, статусы маршрутов, шаги, step_logs.

Revision ID: 003_fitness_tracking
Revises: 002_roles_checkins_tickets
"""

import sqlalchemy as sa
from alembic import op

revision = "003_fitness_tracking"
down_revision = "002_roles_checkins_tickets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Новый ENUM activity_type
    op.execute(
        "DO $$ BEGIN CREATE TYPE activity_type AS ENUM "
        "('hiking', 'walking', 'bike', 'run', 'offroad'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
    )

    # 2. routes: новые колонки
    op.execute(
        "ALTER TABLE routes ADD COLUMN IF NOT EXISTS author_id BIGINT "
        "REFERENCES users(telegram_id) ON DELETE SET NULL"
    )
    op.execute(
        "ALTER TABLE routes ADD COLUMN IF NOT EXISTS activity_type activity_type "
        "NOT NULL DEFAULT 'hiking'"
    )
    op.execute(
        "ALTER TABLE routes ADD COLUMN IF NOT EXISTS steps_count INTEGER NOT NULL DEFAULT 0"
    )
    op.execute("ALTER TABLE routes ADD COLUMN IF NOT EXISTS photo_url TEXT")
    op.execute("ALTER TABLE routes ADD COLUMN IF NOT EXISTS geojson_points TEXT")
    op.execute(
        "ALTER TABLE routes ADD COLUMN IF NOT EXISTS status content_status "
        "NOT NULL DEFAULT 'published'"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_routes_author ON routes (author_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_routes_activity ON routes (activity_type)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_routes_status ON routes (status)")

    # 3. users: шаги / калории / хайки
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS total_steps INTEGER NOT NULL DEFAULT 0")
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS total_calories FLOAT NOT NULL DEFAULT 0.0"
    )
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS total_hikes INTEGER NOT NULL DEFAULT 0")

    # 4. step_logs — суточная агрегация шагомера
    op.create_table(
        "step_logs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "telegram_id",
            sa.BigInteger,
            sa.ForeignKey("users.telegram_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("log_date", sa.Date, nullable=False),
        sa.Column("steps", sa.Integer, server_default="0", nullable=False),
        sa.Column("distance_km", sa.Float, server_default="0.0", nullable=False),
        sa.Column("calories", sa.Float, server_default="0.0", nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.current_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.current_timestamp(), nullable=False),
        sa.UniqueConstraint("telegram_id", "log_date", name="uq_step_logs_user_date"),
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_step_logs_user ON step_logs (telegram_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_step_logs_date ON step_logs (log_date)")

    # 5. Новые бейджи геймификации
    op.execute(
        """
        INSERT INTO achievements (code_name, title, description, condition_type, condition_value)
        VALUES
          ('first_10k_steps', 'Первые 10 000 шагов', 'Набери 10 000 шагов за день', 'steps_day', 10000),
          ('marathon_50k', 'Марафонец (50 км)', 'Пройди суммарно 50 км треков', 'distance', 50),
          ('trail_conqueror', 'Покоритель троп', 'Заверши 5 записанных треков', 'tracks', 5),
          ('early_bird_50k_steps', 'Шагомер PRO', 'Набери 50 000 суммарных шагов', 'steps_total', 50000),
          ('calorie_burner', 'Сжигатель калорий', 'Сожги 2000 ккал активностью', 'calories', 2000)
        ON CONFLICT (code_name) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_step_logs_date")
    op.execute("DROP INDEX IF EXISTS idx_step_logs_user")
    op.drop_table("step_logs")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS total_hikes")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS total_calories")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS total_steps")
    op.execute("DROP INDEX IF EXISTS idx_routes_status")
    op.execute("DROP INDEX IF EXISTS idx_routes_activity")
    op.execute("DROP INDEX IF EXISTS idx_routes_author")
    op.execute("ALTER TABLE routes DROP COLUMN IF EXISTS status")
    op.execute("ALTER TABLE routes DROP COLUMN IF EXISTS geojson_points")
    op.execute("ALTER TABLE routes DROP COLUMN IF EXISTS photo_url")
    op.execute("ALTER TABLE routes DROP COLUMN IF EXISTS steps_count")
    op.execute("ALTER TABLE routes DROP COLUMN IF EXISTS activity_type")
    op.execute("ALTER TABLE routes DROP COLUMN IF EXISTS author_id")
