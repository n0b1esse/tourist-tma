-- Tourist TMA — Fitness-трекинг (шагомер, типы активности, статусы маршрутов)
-- Применяется после 001/002: идемпотентно (IF NOT EXISTS / ON CONFLICT).

CREATE EXTENSION IF NOT EXISTS postgis;

DO $$ BEGIN
  CREATE TYPE activity_type AS ENUM ('hiking', 'walking', 'bike', 'run', 'offroad');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- routes: автор, тип активности, шаги, фото, geojson, статус
ALTER TABLE routes ADD COLUMN IF NOT EXISTS author_id BIGINT REFERENCES users(telegram_id) ON DELETE SET NULL;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS activity_type activity_type NOT NULL DEFAULT 'hiking';
ALTER TABLE routes ADD COLUMN IF NOT EXISTS steps_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS geojson_points TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS status content_status NOT NULL DEFAULT 'published';
CREATE INDEX IF NOT EXISTS idx_routes_author ON routes (author_id);
CREATE INDEX IF NOT EXISTS idx_routes_activity ON routes (activity_type);
CREATE INDEX IF NOT EXISTS idx_routes_status ON routes (status);

-- users: суммарные шаги / калории / хайки
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_steps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_calories FLOAT NOT NULL DEFAULT 0.0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_hikes INTEGER NOT NULL DEFAULT 0;

-- step_logs: суточная агрегация шагомера
CREATE TABLE IF NOT EXISTS step_logs (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE NOT NULL,
  log_date DATE NOT NULL,
  steps INTEGER NOT NULL DEFAULT 0,
  distance_km FLOAT NOT NULL DEFAULT 0.0,
  calories FLOAT NOT NULL DEFAULT 0.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE (telegram_id, log_date)
);
CREATE INDEX IF NOT EXISTS idx_step_logs_user ON step_logs (telegram_id);
CREATE INDEX IF NOT EXISTS idx_step_logs_date ON step_logs (log_date);

-- Новые бейджи геймификации
INSERT INTO achievements (code_name, title, description, condition_type, condition_value) VALUES
  ('first_10k_steps', 'Первые 10 000 шагов', 'Набери 10 000 шагов за день', 'steps_day', 10000),
  ('marathon_50k', 'Марафонец (50 км)', 'Пройди суммарно 50 км треков', 'distance', 50),
  ('trail_conqueror', 'Покоритель троп', 'Заверши 5 записанных треков', 'tracks', 5),
  ('early_bird_50k_steps', 'Шагомер PRO', 'Набери 50 000 суммарных шагов', 'steps_total', 50000),
  ('calorie_burner', 'Сжигатель калорий', 'Сожги 2000 ккал активностью', 'calories', 2000)
ON CONFLICT (code_name) DO NOTHING;

-- Существующие маршруты: автор неизвестен, тип hiking, статус published
UPDATE routes SET activity_type = 'hiking' WHERE activity_type IS NULL;
UPDATE routes SET status = 'published' WHERE status IS NULL;
