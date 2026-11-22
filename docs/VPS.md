# Переезд Tourist TMA на VPS «Авто-ответчика» (поэтапно)

Хост: `178.219.159.34` (`nurlansatymbaev.vps`, Ubuntu 24.04.4, 1 vCPU, 961 МБ ОЗУ,
~200 МБ уже в swap, 15 ГБ диска / 7.6 ГБ свободно). На нём уже работают 4 контейнера
AImanager; **их мы не трогаем**, кроме добавления одного site-блока в Caddy.

## Что меняется относительно Render

| Было (Render + Vercel) | Стало (VPS) |
|---|---|
| Frontend: Next.js-сервер на Vercel | `next build` → `frontend/out` (~0.9 МБ), раздаёт существующий Caddy |
| Redis (только health-ping) | убран, `REDIS_URL=""` → `/api/health` отдаёт `redis: not_configured` |
| Backend: Docker на Render | один контейнер на VPS, сеть `avto-otvetchik_default`, порт 18000 наружу не публикуется |
| БД: Supabase | **пока Supabase** (перенос в Postgres хоста — отдельный финальный шаг) |
| Бот внутри uvicorn | без изменений (polling, входящий порт не нужен) |

## Подготовлено в репозитории

- `frontend/next.config.js` → `output: "export"` (проверено: `npm run build` проходит, `out/` = 0.92 МБ).
- `backend/Dockerfile` → без apt/build-essential/libgdal-dev (все зависимости — wheels), `PIP_NO_CACHE_DIR=1`.
- `backend/.dockerignore` → не тащим `__pycache__`, `.env`, `.git` в образ.
- `docker-compose.vps.yml` → только `backend`, `mem_limit: 320m`, внешняя сеть Caddy, ротация логов.
- `.github/workflows/deploy-vps.yml` → `workflow_dispatch`: сборка статики, scp на хост, `up -d --build`, health-check.

## Secrets в репозитории `tourist-tma` (GitHub → Settings → Secrets)

Транспорт (такие же, как в AImanager): `SSH_HOST_VPS`, `SSH_USER_VPS`, `SSH_PORT_VPS`, `SSH_KEY_VPS`.
Приложение: `DATABASE_URL` (Supabase, `postgresql+asyncpg://...`), `TELEGRAM_BOT_TOKEN`,
`ADMIN_TELEGRAM_ID`, `JWT_SECRET`, `CORS_ORIGINS`, `MINI_APP_URL` (временная ссылка на
`tma.avto-otvetchik.com` — в @BotFather меняем только после успешной проверки).

`DEV_LOGIN_ENABLED` в `.env` на хосте должен быть `false` (в compose уже принудительно `"false"`).

## Разовый шаг: DNS и Caddy (делается вручную на хосте)

1. В GoDaddy: A-запись `tma` → `178.219.159.34` (нужен только поддомен, корневой домен AImanager не трогаем).
2. Дописать в конец `/opt/avto-otvetchik/Caddyfile`:

```
tma.avto-otvetchik.com {
    encode gzip

    handle /api/* {
        reverse_proxy tourist-tma-backend:18000
    }

    handle {
        root * /opt/tourist-tma/frontend/out
        file_server
    }
}
```

3. Перезагрузить конфиг (без рестарта контейнера):

```bash
docker exec avto-otvetchik-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

Caddy сам получит сертификат Let's Encrypt для нового поддомена (80/443 уже проброшены).

## Порядок выкладки

1. `gh workflow run deploy-vps.yml` (сначала только этот воркфлоу, без переезда БД).
2. Проверить: `https://tma.avto-otvetchik.com/` открывается, `https://tma.avto-otvetchik.com/api/health`
   → `{"status":"ok",...,"redis":"not_configured"}`.
3. Проверить на хосте: `free -m`, `docker stats --no-stream`, `df -h /` — убедиться, что swap не вырос.
4. Только после этого менять Mini App URL в @BotFather и отключать keep-alive workflow в `tourist-tma`.
5. Финальный отдельный шаг: `pg_dump` из Supabase → restore в Postgres хоста с установленным PostGIS.

## Откат

- Вернуть старый Mini App URL в @BotFather — Render остаётся Live, откат занимает минуты.
- На хосте: `docker compose -f /opt/tourist-tma/docker-compose.vps.yml down` и убрать site-блок из Caddyfile.
