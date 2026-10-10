-- Tourist TMA — initial schema (PostgreSQL + PostGIS)
-- Шаг 1: типы и таблицы по §4 спецификации
-- Применяется автоматически через docker-entrypoint-initdb.d

CREATE EXTENSION IF NOT EXISTS postgis;

-- Перечисления (идемпотентно, чтобы повторный запуск не падал)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'tester', 'admin', 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE content_status AS ENUM ('draft', 'review', 'published', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE waypoint_type AS ENUM ('water', 'camp', 'hazard', 'viewpoint', 'rest',
    'waterfall', 'lake', 'peak', 'camping', 'spring', 'recreation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE difficulty_level AS ENUM ('Легкий', 'Средний', 'Сложный', 'Экстремальный');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Пользователи
CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  username VARCHAR(255),
  full_name VARCHAR(255),
  role user_role DEFAULT 'user' NOT NULL,
  is_blocked BOOLEAN DEFAULT FALSE NOT NULL,
  total_distance_km FLOAT DEFAULT 0.0 NOT NULL,
  total_elevation_m INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Маршруты
CREATE TABLE IF NOT EXISTS routes (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  difficulty difficulty_level DEFAULT 'Средний' NOT NULL,
  distance_km FLOAT NOT NULL,
  elevation_gain_m INT NOT NULL,
  estimated_time VARCHAR(50),
  max_elevation_m INT,
  gpx_data GEOMETRY(MultiLineString, 4326),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Путевые точки (с поддержкой модерации и черновиков)
CREATE TABLE IF NOT EXISTS waypoints (
  id SERIAL PRIMARY KEY,
  route_id INT REFERENCES routes(id) ON DELETE CASCADE,
  created_by BIGINT REFERENCES users(telegram_id) ON DELETE SET NULL,
  type waypoint_type NOT NULL,
  coordinates GEOMETRY(Point, 4326) NOT NULL,
  title VARCHAR(255),
  description TEXT,
  photo_url TEXT,
  status content_status DEFAULT 'draft' NOT NULL,
  approved_by BIGINT REFERENCES users(telegram_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Достижения
CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  code_name VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  icon_url TEXT,
  condition_type VARCHAR(50), -- distance, elevation, count
  condition_value FLOAT
);

-- Пройденные ачивки пользователей
CREATE TABLE IF NOT EXISTS user_achievements (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  achievement_id INT REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE (telegram_id, achievement_id)
);

-- Чек-ины (быстрый чек-ин в радиусе локации, ТЗ §4Б) — после routes/waypoints из-за FK
CREATE TABLE IF NOT EXISTS checkins (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE NOT NULL,
  waypoint_id INT REFERENCES waypoints(id) ON DELETE SET NULL,
  route_id INT REFERENCES routes(id) ON DELETE SET NULL,
  latitude FLOAT,
  longitude FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checkins_telegram ON checkins (telegram_id);
CREATE INDEX IF NOT EXISTS idx_checkins_waypoint ON checkins (waypoint_id);

-- Тикеты: feedback (поддержка) / bug (баг-репорт тестера супер-админу)
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT REFERENCES users(telegram_id) ON DELETE SET NULL,
  kind VARCHAR(20) DEFAULT 'feedback' NOT NULL,
  subject VARCHAR(255),
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'open' NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);

-- Индексы для геозапросов и фильтрации по режимам production/tester
CREATE INDEX IF NOT EXISTS idx_routes_gpx_data ON routes USING GIST (gpx_data);
CREATE INDEX IF NOT EXISTS idx_waypoints_coordinates ON waypoints USING GIST (coordinates);
CREATE INDEX IF NOT EXISTS idx_waypoints_status ON waypoints (status);
CREATE INDEX IF NOT EXISTS idx_waypoints_route_id ON waypoints (route_id);
CREATE INDEX IF NOT EXISTS idx_waypoints_type ON waypoints (type);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
