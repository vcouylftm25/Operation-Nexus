# syntax=docker/dockerfile:1.7
#
# Operation Nexus — api image (FastAPI, uv-managed).
# Build context is the repo root (see infra/compose.yaml): `docker build -f
# infra/docker/api.Dockerfile .` from /Users/.../operation_nexus.
#
# Targets:
#   dev      hot-reload uvicorn, full dependency set (incl. `ai` extra + dev group)
#   runtime  slim, production dependency set only, no dev group

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS base

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:${PATH}"

WORKDIR /app

RUN groupadd --gid 1000 appuser \
    && useradd --uid 1000 --gid appuser --create-home --shell /bin/bash appuser

# --- dev -------------------------------------------------------------------
FROM base AS dev

# README.md ships with the metadata because pyproject declares it as the
# package readme; without it the hatchling build backend aborts the sync.
COPY apps/api/pyproject.toml apps/api/uv.lock apps/api/README.md /app/
COPY apps/api/src /app/src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --all-extras

COPY apps/api /app
COPY scenarios /app/scenarios

RUN chown -R appuser:appuser /app /opt/venv
USER appuser

EXPOSE 8000

ENV PYTHONPATH=/app/src
CMD ["uv", "run", "uvicorn", "operation_nexus.main:app", \
     "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "/app/src"]

# --- runtime -----------------------------------------------------------------
FROM base AS runtime

COPY apps/api/pyproject.toml apps/api/uv.lock apps/api/README.md /app/
COPY apps/api/src /app/src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --all-extras

COPY apps/api /app
COPY scenarios /app/scenarios

RUN chown -R appuser:appuser /app /opt/venv
USER appuser

EXPOSE 8000

ENV PYTHONPATH=/app/src
CMD ["uv", "run", "uvicorn", "operation_nexus.main:app", \
     "--host", "0.0.0.0", "--port", "8000"]
