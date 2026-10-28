# Tourist TMA — Telegram Mini App для туризма и трекинга

Интерактивная карта маршрутов, краудсорсинг точек и система достижений.
Двухрежимная система: **Production** (проверенные точки) и **Tester/Draft**
(жёлтый слой черновиков от тестеров с модерацией админом).

## Стек

| Слой | Технологии |
|---|---|
| Frontend (TMA) | Next.js 14, TypeScript, Tailwind CSS, Leaflet, @telegram-apps/sdk |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 (async), GeoAlchemy2, Alembic |
| База | PostgreSQL + PostGIS (прод — Supabase) |
| Кеш | Redis (прод — Render Key Value) |
| Деплой | Docker, `render.yaml` (Render Blueprint) |

## Структура

```
backend/          # FastAPI: app/{api,core,models,schemas}, alembic/, tests/
frontend/         # Next.js: src/{app,components,types,utils,styles}
db/init/          # 001_init.sql (типы + таблицы), 002_seed.sql (демо-данные)
docs/             # SUPABASE.md, DEPLOY.md
render.yaml       # Blueprint: backend (Docker) + Redis
docker-compose.yml# локально: PostGIS + Redis + backend + frontend
```

## Локальный запуск

```powershell
cp .env.example .env   # заполнить TELEGRAM_BOT_TOKEN при наличии
docker compose up --build
```

- Frontend: http://localhost:3000 (вне Telegram — dev-вход по Telegram ID)
- Backend: http://localhost:8000/docs · health: `/api/health`
- PostGIS: `localhost:5432`, Redis: `localhost:6379`

Без Docker — проверки логики:

```powershell
cd backend
python -m compileall -q app alembic tests
python tests/test_step3_smoke.py   # API smoke 6/6 без базы
```

## Деплой

1. База: `docs/SUPABASE.md` (создать проект → включить PostGIS → `alembic upgrade head`).
2. Бэкенд + Redis: `docs/DEPLOY.md` (Render → New → Blueprint → 3 секрета:
   `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_ID`).
3. Фронтенд: Vercel/Static с `NEXT_PUBLIC_API_URL=<backend-url>`, URL — в @BotFather.

## Ключевые эндпоинты

- `POST /api/auth/init-data` — вход по подписи Telegram WebApp
- `POST /api/auth/dev-login` — локальный вход без подписи (кнопка «Войти локально», только при `DEV_LOGIN_ENABLED=true`, в проде выключен)
- `GET /api/routes?difficulty=&max_distance_km=` — маршруты + GPX (фильтры ТЗ §4А)
- `POST /api/routes`, `PATCH /api/routes/{id}`, `DELETE /api/routes/{id}` — CRUD гида/админа
- `GET /api/waypoints?mode=production|tester` — точки (tester — tester/admin/super_admin)
- `POST /api/waypoints` — черновик от тестера (+ уведомление супер-админу)
- `PATCH /api/waypoints/{id}` / `DELETE /api/waypoints/{id}` — правки меток на карте (админка)
- `PATCH /api/waypoints/{id}/moderate` — модерация админа
- `POST /api/checkins`, `GET /api/checkins/my` — быстрый чек-ин в радиусе 300 м + автобейджи
- `POST /api/tickets/feedback`, `POST /api/tickets/bug` — поддержка / баг-репорты супер-админу
- `GET /api/users/profile` — статистика и достижения
- `GET /api/admin/users`, `PATCH /api/admin/users/{id}/role|status` — супер-админ: роли и блокировки
- `GET /api/admin/stats`, `POST /api/admin/notifications` — статистика и рассылки
- `GET /api/admin/tickets` — тикеты супер-админу

## Роли и Telegram-бот

Иерархия: `user` → `tester` → `admin` → `super_admin`. Блок: `is_blocked` (403 на записи).
Супер-админа назначать SQL: `UPDATE users SET role='super_admin' WHERE telegram_id=<ID>`.

Бот (`backend/app/bot.py`, aiogram): `/start` + инлайн-кнопки (Mini App, топ-5, профиль,
поддержка), Menu Button «Открыть карту» (`MINI_APP_URL`), пуши о бейджах/рассылках/модерации.
Запуск: `python -m app.bot` при заданных `TELEGRAM_BOT_TOKEN`, `MINI_APP_URL`;
на Render бот встроен в веб-сервис (FastAPI lifespan, `EMBED_TELEGRAM_BOT=true`
по умолчанию — free-план Render не даёт воркеров; отдельный запуск — платный воркер/локалка).

## Mini App (ТЗ)

- Старт: запрос GPS → центр на пользователе; отказ → Бишкек 42.8746, 74.5698.
- Вкладки: Главное (баннеры + фильтры хайков) · Карта (чек-ин в радиусе) · Маршруты ·
  Профиль (бейджи/статистика/темы) · Админка (только super_admin).
- Онбординг-тур при первом входе, тёмная/светлая тема из Telegram.
