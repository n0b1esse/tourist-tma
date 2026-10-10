-- Tourist TMA — seed для локального теста (Шаг 1)
-- Демо-маршрут + базовые достижения. Безопасно перезапускать.

INSERT INTO achievements (code_name, title, description, condition_type, condition_value) VALUES
  ('first_km', 'Первый километр', 'Пройдите первый километр маршрута', 'distance', 1),
  ('peak_1000', 'Выше облаков', 'Наберите 1000 м суммарного набора высоты', 'elevation', 1000),
  ('explorer_5', 'Исследователь', 'Откройте 5 опубликованных точек', 'count', 5)
ON CONFLICT (code_name) DO NOTHING;

INSERT INTO routes (title, description, difficulty, distance_km, elevation_gain_m, estimated_time, max_elevation_m, gpx_data) VALUES
  (
    'Демо-трейл вокруг озера',
    'Тестовый маршрут для проверки карты и режимов production/tester',
    'Легкий',
    8.5,
    320,
    '3-4 часа',
    1450,
    ST_GeomFromText('MULTILINESTRING((60.59 56.83, 60.61 56.84, 60.63 56.845))', 4326)
  )
ON CONFLICT DO NOTHING;
