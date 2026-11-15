# Heat-Safe API (server.py): our endpoints, the agent chat and the ADK dev UI, for the short-lived team demo
# (infra/README.md).
# Built by Cloud Build for linux/amd64 (Cloud Run's architecture), not on the Mac (arm64).
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.9.4 /uv /bin/uv
WORKDIR /app

# Dependencies first, in their own layer: code changes then reuse the cached layer
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src/ src/
COPY agents/ agents/
COPY server.py ./
COPY data/heat_safe/ data/heat_safe/
RUN uv sync --frozen --no-dev

# Shell form so Cloud Run's $PORT expands. --no-sync: never resolve packages at start-up
CMD uv run --no-sync uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}
