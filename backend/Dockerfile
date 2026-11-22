FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Все зависимости ставляются готовыми wheels (shapely несёт GEOS,
# psycopg[binary] — libpq, asyncpg — свой C-код). Компилятор и libgdal-dev
# не нужны: убираем apt, образ получается ~3–4× меньше и собрать его можно
# даже на 1 vCPU / 961 МБ VPS.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Прод-CMD: миграции + uvicorn. На VPS порт задаётся в docker-compose.vps.yml
# (по умолчанию 8000 — для Render/локального docker-compose).
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
