# syntax=docker/dockerfile:1.7
#
# Operation Nexus — web image (React + Vite, pnpm-managed monorepo).
# Build context is the repo root (see infra/compose.yaml): `docker build -f
# infra/docker/web.Dockerfile .` from /Users/.../operation_nexus.
#
# This is a pnpm workspace (see /pnpm-workspace.yaml), so the lockfile and
# workspace manifest live at the repo root, not inside apps/web.
#
# Targets:
#   dev      `pnpm dev --host`, source bind-mounted for hot reload
#   runtime  static build served by `vite preview`

FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"

RUN corepack enable
WORKDIR /app

# --- dev ---------------------------------------------------------------
FROM base AS dev

COPY pnpm-workspace.yaml package.json* pnpm-lock.yaml* /app/
COPY apps/web/package.json /app/apps/web/package.json
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install

COPY apps/web /app/apps/web
WORKDIR /app/apps/web

EXPOSE 5173

CMD ["pnpm", "dev", "--host"]

# --- runtime -------------------------------------------------------------
FROM base AS runtime

COPY pnpm-workspace.yaml package.json* pnpm-lock.yaml* /app/
COPY apps/web/package.json /app/apps/web/package.json
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile || pnpm install

COPY apps/web /app/apps/web
WORKDIR /app/apps/web
RUN pnpm build

EXPOSE 5173

CMD ["pnpm", "preview", "--host", "--port", "5173"]
