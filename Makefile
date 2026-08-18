# Operation Nexus — dev workflow
#
# Quickstart:
#   make bootstrap && make up-core && make seed && make api
#
# Run `make help` to list every target.

SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

COMPOSE_FILE := infra/compose.yaml
COMPOSE := docker compose -f $(COMPOSE_FILE) --env-file .env

# Pull values from .env when present so psql/cypher targets and native
# `make api`/`make web` runs match whatever docker-compose is using.
# (Explicit `export VAR` names below, not a bare `export`, for compatibility
# with GNU Make 3.81 — the version macOS still ships out of the box.)
-include .env

POSTGRES_USER ?= nexus
POSTGRES_DB ?= nexus
NEO4J_USER ?= neo4j
NEO4J_PASSWORD ?= nexus_dev_password
API_HOST ?= 0.0.0.0
API_PORT ?= 8000
SCENARIO_SLUG ?= vero_express

export POSTGRES_USER POSTGRES_DB NEO4J_USER NEO4J_PASSWORD API_HOST API_PORT SCENARIO_SLUG

.PHONY: help up up-core down nuke logs api web seed validate test test-int lint fmt \
        typecheck migrate revision psql cypher bootstrap

help: ## Show this help
	@echo "Operation Nexus — available targets:"
	@grep -E '^[a-zA-Z0-9_-]+:.*##' $(firstword $(MAKEFILE_LIST)) | sort | awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-13s\033[0m %s\n", $$1, $$2}'

.env: .env.example
	cp .env.example .env
	@echo "Created .env from .env.example — edit it if you need non-default values."

bootstrap: .env ## Install all deps (uv + pnpm) and create .env if missing
	cd apps/api && uv sync --all-extras
	cd apps/web && corepack enable && pnpm install
	@echo "Bootstrap complete. Next: make up-core && make seed && make api"

up: .env ## Start the full dev stack (postgres, neo4j, api, web) in docker
	$(COMPOSE) --profile full up -d --build

up-core: .env ## Start only the databases (postgres, neo4j)
	$(COMPOSE) --profile core up -d

down: .env ## Stop all services, keep volumes
	$(COMPOSE) --profile full down

nuke: .env ## Stop everything and delete volumes (destroys local db/graph data)
	$(COMPOSE) --profile full down -v

logs: .env ## Tail logs for the full dev stack
	$(COMPOSE) --profile full logs -f

api: ## Run the API locally with hot reload (uv, not docker)
	cd apps/api && uv run --env-file $(CURDIR)/.env uvicorn operation_nexus.main:app \
		--host $(API_HOST) --port $(API_PORT) --reload

web: ## Run the web dev server locally (pnpm, not docker)
	cd apps/web && pnpm dev --host

seed: ## Seed neo4j from scenarios/$(SCENARIO_SLUG) (ARGS="--drop --embeddings")
	cd apps/api && uv run --env-file $(CURDIR)/.env operation-nexus seed $(SCENARIO_SLUG) $(ARGS)

validate: ## Validate the scenario files offline (no database needed)
	cd apps/api && uv run operation-nexus validate $(SCENARIO_SLUG)

test: ## Run unit tests (excludes integration + ai markers)
	cd apps/api && uv run pytest -m "not integration and not ai"

test-int: ## Run integration tests (requires `make up-core` running)
	cd apps/api && uv run pytest -m integration

lint: ## Lint the API (ruff) and web (eslint)
	cd apps/api && uv run ruff check .
	cd apps/web && pnpm lint

fmt: ## Format the API (ruff format)
	cd apps/api && uv run ruff format .

typecheck: ## Type-check the API (pyright) and web (tsc)
	cd apps/api && uv run pyright
	cd apps/web && pnpm typecheck

migrate: ## Apply database migrations (alembic upgrade head)
	cd apps/api && uv run --env-file $(CURDIR)/.env alembic upgrade head

revision: ## Create a new migration (usage: make revision m="add teams table")
	cd apps/api && uv run alembic revision --autogenerate -m "$(m)"

psql: .env ## Open a psql shell in the postgres container
	$(COMPOSE) exec postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

cypher: .env ## Open a cypher-shell in the neo4j container
	$(COMPOSE) exec neo4j cypher-shell -u $(NEO4J_USER) -p $(NEO4J_PASSWORD)
