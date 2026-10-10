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
- `GET /api/routes`, `GET /api/routes/{id}` — маршруты + GPX
- `GET /api/waypoints?mode=production|tester` — точки (tester — только tester/admin)
- `POST /api/waypoints` — черновик от тестера (+ уведомление супер-админу)
- `PATCH /api/waypoints/{id}/moderate` — модерация админа
- `GET /api/users/profile` — статистика и достижения
