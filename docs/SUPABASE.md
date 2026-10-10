# Supabase как БД проекта

## 1. Создание проекта

1. Зарегистрируйся на https://supabase.com → **New project**.
2. Запомни **Database password** — он понадобится в строке подключения.
3. Дождись развёртывания (~1–2 мин).

## 2. Включение PostGIS (обязательно)

Без расширения упадут миграции (`Geometry`/`GIST`).

1. В панели проекта: **Database → Extensions**.
2. Найди **postgis** → **Enable** (схема `extensions`, так задумано).
3. Проверка в **SQL Editor**:
   ```sql
   select * from pg_extension where extname = 'postgis';
   ```
   Дополнительно скрипты проекта делают `CREATE EXTENSION IF NOT EXISTS postgis`,
   но на Supabase расширение должно быть разрешено именно через Dashboard.

## 3. Строка подключения

**Project Settings → Database → Connection string → URI**.

- Для миграций/DDL используй **прямое подключение** (порт `5432`):
  `postgresql://postgres:<pass>@db.<ref>.supabase.co:5432/postgres`
- Для работы приложения можно пулер **Supavisor** (порт `6543`, transaction mode):
  `postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:6543/postgres`

В `DATABASE_URL` замени схему на `postgresql+asyncpg://`:

```env
DATABASE_URL=postgresql+asyncpg://postgres.<ref>:<pass>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

Код сам включает TLS и `statement_cache_size=0` для хостов
`*.supabase.co` / `pooler.supabase.com` (см. `build_connect_args` в
`backend/app/core/database.py`): для `postgresql+asyncpg://` это `ssl=True`,
для `postgresql+psycopg://` (alembic offline) — `sslmode=require`.
Вручную `?ssl=` дописывать не нужно — этот legacy-параметр вырезается
из URL автоматически, т.к. psycopg падает на нём с
`invalid connection option "ssl"`.

## 4. Применение схемы

Вариант А — Alembic с ноутбука (рекомендуется для DDL — напрямую, порт 5432):

```powershell
$env:DATABASE_URL="postgresql+asyncpg://postgres:<pass>@db.<ref>.supabase.co:5432/postgres"
cd backend
alembic upgrade head
```

Вариант Б — на Render: `preDeployCommand: "alembic upgrade head"` в `render.yaml`
выполнит то же самое при каждом деплое.

Сид-достижения и демо-маршрут — `db/init/002_seed.sql` (выполнить в SQL Editor).

## 5. Типичные ошибки

| Симптом | Причина / лечение |
|---|---|
| `no pg_hba.conf entry / SSL` | нет TLS — проверь, что URL идёт через код с авто-SSL, а не напрямую |
| `invalid connection option "ssl"` (psycopg) | в `DATABASE_URL` голый `postgresql://` без драйвера или legacy `?ssl=` — нужна схема `postgresql+asyncpg://` (код теперь чинит оба случая сам, но лучше поправить значение в Render) |
| `prepared statement already exists` | пулер в transaction mode — лечится `statement_cache_size=0` (уже в коде) |
| `type "geometry" does not exist` | не включён PostGIS в Dashboard (п. 2) |
