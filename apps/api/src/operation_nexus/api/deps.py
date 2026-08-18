"""FastAPI dependencies: DB sessions, auth guards, shared singletons."""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.api.connection_manager import ConnectionManager
from operation_nexus.application.ports import (
    GraphReader,
    InvestigationRunner,
    NullGraphReader,
    NullInvestigationRunner,
)
from operation_nexus.application.session_tokens import hash_session_token
from operation_nexus.infrastructure.postgres.repositories.team_repository import TeamRepository
from operation_nexus.infrastructure.settings import Settings, get_settings


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    factory = request.app.state.session_factory
    async with factory() as session:
        yield session


def get_connection_manager(request: Request) -> ConnectionManager:
    return request.app.state.connection_manager


def get_settings_dep() -> Settings:
    return get_settings()


def get_scenarios_dir(settings: Settings = Depends(get_settings_dep)) -> Path:
    return settings.scenarios_dir


def get_scenario_slug(settings: Settings = Depends(get_settings_dep)) -> str:
    """The single scenario this deployment runs.

    Players never pick a scenario -- they type a team name and start -- so the
    slug is deployment configuration, not request input.
    """
    return settings.scenario_slug


async def require_team(
    authorization: str = Header(...),
    session: AsyncSession = Depends(get_session),
) -> UUID:
    """Resolve the bearer session token to a team_id. Routes must still check
    that this matches the `team_id` in the path -- this dependency only
    proves the caller holds *some* valid team session.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    team_repo = TeamRepository(session)
    team_id = await team_repo.resolve_session_token(hash_session_token(token))
    if team_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid or revoked session token"
        )
    return team_id


def require_matching_team(path_team_id: UUID, authenticated_team_id: UUID) -> None:
    if path_team_id != authenticated_team_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="team token does not match team_id"
        )


def get_investigation_runner(request: Request) -> InvestigationRunner:
    runner = getattr(request.app.state, "investigation_runner", None)
    if runner is None:
        return NullInvestigationRunner()
    return runner


def get_graph_reader(request: Request) -> GraphReader:
    reader = getattr(request.app.state, "graph_reader", None)
    if reader is None:
        return NullGraphReader()
    return reader
