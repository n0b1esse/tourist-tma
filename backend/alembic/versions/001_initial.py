"""Baseline: типы + таблицы по db/init/001_init.sql (Шаг 2).

На свежем docker-объёме схему уже создаёт db/init/*.sql — там делать
``alembic stamp head`` вместо upgrade. Эта миграция — для пустых БД
(CI, ручной Postgres без init-скриптов).

Revision ID: 001_initial
"""

import geoalchemy2
import sqlalchemy as sa
from alembic import op

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None

ENUM_DDLS = [
    "DO $$ BEGIN CREATE TYPE user_role AS ENUM ('user', 'tester', 'admin'); "
    "EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    "DO $$ BEGIN CREATE TYPE content_status AS ENUM ('draft', 'review', 'published', 'rejected'); "
    "EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    "DO $$ BEGIN CREATE TYPE waypoint_type AS ENUM ('water', 'camp', 'hazard', 'viewpoint', 'rest'); "
    "EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    "DO $$ BEGIN CREATE TYPE difficulty_level AS ENUM ('Легкий', 'Средний', 'Сложный'); "
    "EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
]

GIST_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_routes_gpx_data ON routes USING GIST (gpx_data)",
    "CREATE INDEX IF NOT EXISTS idx_waypoints_coordinates ON waypoints USING GIST (coordinates)",
    "CREATE INDEX IF NOT EXISTS idx_waypoints_status ON waypoints (status)",
    "CREATE INDEX IF NOT EXISTS idx_waypoints_route_id ON waypoints (route_id)",
    "CREATE INDEX IF NOT EXISTS idx_waypoints_type ON waypoints (type)",
    "CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)",
]


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    for ddl in ENUM_DDLS:
        op.execute(ddl)

    op.create_table(
        "users",
        sa.Column("telegram_id", sa.BigInteger, primary_key=True),
        sa.Column("username", sa.String(255)),
        sa.Column("full_name", sa.String(255)),
        sa.Column(
            "role",
            # create_type=False: тип уже создан DO-блоком выше, иначе дубль CREATE TYPE
            sa.Enum("user", "tester", "admin", name="user_role", native_enum=True, create_type=False),
            server_default="user",
            nullable=False,
        ),
        sa.Column("total_distance_km", sa.Float, server_default="0.0", nullable=False),
        sa.Column("total_elevation_m", sa.Integer, server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.current_timestamp(), nullable=False),
    )

    op.create_table(
        "routes",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column(
            "difficulty",
            sa.Enum("Легкий", "Средний", "Сложный", name="difficulty_level", native_enum=True, create_type=False),
            server_default="Средний",
            nullable=False,
        ),
        sa.Column("distance_km", sa.Float, nullable=False),
        sa.Column("elevation_gain_m", sa.Integer, nullable=False),
        sa.Column("estimated_time", sa.String(50)),
        sa.Column("max_elevation_m", sa.Integer),
        sa.Column("gpx_data", geoalchemy2.Geometry("MULTILINESTRING", srid=4326)),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.current_timestamp(), nullable=False),
    )

    op.create_table(
        "waypoints",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("route_id", sa.Integer, sa.ForeignKey("routes.id", ondelete="CASCADE")),
        sa.Column("created_by", sa.BigInteger, sa.ForeignKey("users.telegram_id", ondelete="SET NULL")),
        sa.Column(
            "type",
            sa.Enum("water", "camp", "hazard", "viewpoint", "rest", name="waypoint_type", native_enum=True, create_type=False),
            nullable=False,
        ),
        sa.Column("coordinates", geoalchemy2.Geometry("POINT", srid=4326), nullable=False),
        sa.Column("title", sa.String(255)),
        sa.Column("description", sa.Text),
        sa.Column("photo_url", sa.Text),
        sa.Column(
            "status",
            sa.Enum("draft", "review", "published", "rejected", name="content_status", native_enum=True, create_type=False),
            server_default="draft",
            nullable=False,
        ),
        sa.Column("approved_by", sa.BigInteger, sa.ForeignKey("users.telegram_id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.current_timestamp(), nullable=False),
    )

    op.create_table(
        "achievements",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("code_name", sa.String(100), unique=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("icon_url", sa.Text),
        sa.Column("condition_type", sa.String(50)),
        sa.Column("condition_value", sa.Float),
    )

    op.create_table(
        "user_achievements",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("telegram_id", sa.BigInteger, sa.ForeignKey("users.telegram_id", ondelete="CASCADE")),
        sa.Column("achievement_id", sa.Integer, sa.ForeignKey("achievements.id", ondelete="CASCADE")),
        sa.Column("unlocked_at", sa.DateTime, server_default=sa.func.current_timestamp(), nullable=False),
        sa.UniqueConstraint("telegram_id", "achievement_id"),
    )

    for idx in GIST_INDEXES:
        op.execute(idx)


def downgrade() -> None:
    op.drop_table("user_achievements")
    op.drop_table("achievements")
    op.drop_table("waypoints")
    op.drop_table("routes")
    op.drop_table("users")
    for name in ("content_status", "waypoint_type", "difficulty_level", "user_role"):
        sa.Enum(name=name).drop(op.get_bind(), checkfirst=True)
