"""`/games` routes (CONTRACT.md §8) -- create/read games, create teams."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.api.deps import get_session
from operation_nexus.application.create_game import CreateGame
from operation_nexus.application.create_team import CreateTeam
from operation_nexus.domain.game.contracts import GameState
from operation_nexus.infrastructure.postgres.repositories.game_repository import GameRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import TeamRepository

router = APIRouter(prefix="/games", tags=["games"])


class CreateGameRequest(BaseModel):
    scenario_slug: str


class CreateTeamRequest(BaseModel):
    name: str


class CreateTeamResponse(BaseModel):
    team_id: UUID
    join_code: str


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_game(
    body: CreateGameRequest, session: AsyncSession = Depends(get_session)
) -> GameState:
    use_case = CreateGame(GameRepository(session))
    return await use_case.execute(body.scenario_slug)


@router.get("/{game_id}")
async def get_game(game_id: UUID, session: AsyncSession = Depends(get_session)) -> GameState:
    game_repo = GameRepository(session)
    game = await game_repo.get(game_id)
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="game not found")
    team_repo = TeamRepository(session)
    game = game.model_copy(update={"teams": await team_repo.list_for_game(game_id)})
    return game


@router.post("/{game_id}/teams", status_code=status.HTTP_201_CREATED)
async def create_team(
    game_id: UUID, body: CreateTeamRequest, session: AsyncSession = Depends(get_session)
) -> CreateTeamResponse:
    game_repo = GameRepository(session)
    if await game_repo.get(game_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="game not found")

    use_case = CreateTeam(TeamRepository(session))
    team = await use_case.execute(game_id, body.name)
    return CreateTeamResponse(team_id=team.team_id, join_code=team.join_code)
