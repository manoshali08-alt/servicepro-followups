# --- build the React app ---
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ .
RUN npm run build

# --- FastAPI runtime (serves /api and the built React app) ---
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY --from=web /web/dist ./static
ENV APP_ENV=production DATABASE_PATH=/data/servicepro.db
RUN useradd -m app && mkdir -p /data && chown app /data
USER app
EXPOSE 8000
# One worker: SQLite is single-writer and the login throttle is in-process.
CMD uvicorn app.main:create_app --factory --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --proxy-headers --forwarded-allow-ips="*"
