"""Health checks: `/health` (shallow) and `/health/deep` (pings dependencies)."""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, Request, Response, status
from sqlalchemy import text

from operation_nexus.infrastructure.settings import get_settings

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/deep")
async def health_deep(request: Request, response: Response) -> dict[str, Any]:
    components: dict[str, str] = {}

    engine = getattr(request.app.state, "engine", None)
    if engine is None:
        components["postgres"] = "unconfigured"
    else:
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            components["postgres"] = "ok"
        except Exception as exc:
            logger.warning("health_deep_postgres_failed", error=str(exc))
            components["postgres"] = "down"

    # Guarded import: `infrastructure/neo4j` is owned by the graph agent and
    # may not have a driver factory yet. The `neo4j` package itself is an
    # installed dependency, so we talk to it directly here rather than
    # depending on code that might not exist.
    try:
        from neo4j import AsyncGraphDatabase
    except ImportError:
        components["neo4j"] = "driver_not_installed"
    else:
        settings = get_settings()
        driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password.get_secret_value()),
        )
        try:
            await driver.verify_connectivity()
            components["neo4j"] = "ok"
        except Exception as exc:
            logger.warning("health_deep_neo4j_failed", error=str(exc))
            components["neo4j"] = "down"
        finally:
            await driver.close()

    healthy = all(value == "ok" for value in components.values())
    response.status_code = status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "ok" if healthy else "degraded", "components": components}
