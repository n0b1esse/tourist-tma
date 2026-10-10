# Деплой: GitHub → Render (backend) + Supabase (БД)

## 0. Что куда едет

- **Supabase** — PostgreSQL + PostGIS (см. `docs/SUPABASE.md`).
- **Render, web-сервис** — FastAPI из `backend/Dockerfile` (`render.yaml`).
- **Render, Key Value** — Redis, подставляется в `REDIS_URL` автоматически.
- **Фронтенд** — отдельно (Vercel / Render Static / Cloudflare Pages),
  с `NEXT_PUBLIC_API_URL=https://<твой-backend>.onrender.com`.

## 1. Первый пуш в GitHub

```powershell
cd "C:\Users\user\Documents\Default Project\telegram-app"
git init
git add .
git status            # убедись, что нет .env / node_modules / __pycache__ / .next
git commit -m "Tourist TMA: backend FastAPI + PostGIS, TMA frontend, render.yaml"
git branch -M main
git remote add origin https://github.com/<твой-логин>/tourist-tma.git
git push -u origin main
```

Репозиторий можно создать заранее на github.com → New repository
(без README, чтобы не было конфликта) либо командой `gh repo create tourist-tma --public --source=. --push`.

## 2. Привязка Render

1. https://dashboard.render.com → **New → Blueprint** → выбери репозиторий.
   `render.yaml` в корне подхватится автоматически: создадутся
   `tourist-tma-backend` (Docker) и `tourist-tma-redis` (Key Value).
2. При первом применении Render попросит секреты (`sync: false`):
   - `DATABASE_URL` — строка Supabase с `postgresql+asyncpg://...`
     (бери пулер `:6543`, см. `docs/SUPABASE.md`);
   - `TELEGRAM_BOT_TOKEN` — токен от @BotFather;
   - `ADMIN_TELEGRAM_ID` — числовой Telegram ID супер-админа
     (узнать: @userinfobot). Сюда придут уведомления о черновиках.
   `JWT_SECRET` сгенерируется сам, `REDIS_URL` подставится от Key Value.
3. **Apply** → начнётся сборка Docker-образа → `alembic upgrade head`
   (preDeploy) → health-check `GET /api/health` → сервис Live.

Каждый следующий `git push` в `main` — автоматический редеплой.

## 3. Проверка прода

```powershell
curl https://tourist-tma-backend.onrender.com/api/health
# {"status":"ok","service":"tourist-tma-backend","redis":"up"}
```

Открой `/docs` — Swagger всех эндпоинтов. Создай точку тестером —
супер-админ должен получить сообщение «🧪 Новый черновик» в Telegram.

> Free-план Render засыпает без трафика: первый запрос после паузы ~30–60 сек.
> Для демо достаточно free-плана; для прода возьми Starter и включи бэкапы Supabase.

## 4. Фронтенд (кратко)

1. Залей тот же репозиторий на Vercel (root directory `frontend`)
   либо Render → New → Static Site (build: `npm run build`, publish: `.next` —
   проще Vercel: `npx vercel --prod` из `frontend/`).
2. Env: `NEXT_PUBLIC_API_URL=https://tourist-tma-backend.onrender.com`.
3. URL статики вставь в @BotFather → Bot Settings → Menu Button / Web App.
