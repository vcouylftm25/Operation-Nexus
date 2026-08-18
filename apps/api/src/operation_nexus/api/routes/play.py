"""`/play` routes -- entering the game and reading the public ranking.

The only way in: type a team name. No lobby, no host, no join code.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.api.deps import get_scenario_slug, get_session
from operation_nexus.application.get_leaderboard import GetLeaderboard
from operation_nexus.application.start_play import StartPlay
from operation_nexus.domain.game.contracts import LeaderboardRow, RoundState, TeamState
from operation_nexus.infrastructure.postgres.repositories.game_repository import GameRepository
from operation_nexus.infrastructure.postgres.repositories.guess_repository import GuessRepository
from operation_nexus.infrastructure.postgres.repositories.hint_repository import HintRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import TeamRepository

router = APIRouter(prefix="/play", tags=["play"])


class StartPlayRequest(BaseModel):
    team_name: str


class StartPlayResponse(BaseModel):
    team: TeamState
    session_token: str
    #: True when this name matched a team that already existed, i.e. the
    #: player came back rather than starting fresh.
    resumed: bool
    rounds: list[RoundState]


@router.post("/start", status_code=status.HTTP_200_OK)
async def start_play(
    body: StartPlayRequest,
    session: AsyncSession = Depends(get_session),
    scenario_slug: str = Depends(get_scenario_slug),
) -> StartPlayResponse:
    game_repo = GameRepository(session)
    use_case = StartPlay(TeamRepository(session), game_repo, scenario_slug)
    result = await use_case.execute(body.team_name)
    game = await game_repo.require(result.team.game_id)
    return StartPlayResponse(
        team=result.team,
        session_token=result.session_token,
        resumed=result.resumed,
        rounds=game.rounds,
    )


@router.get("/games/{game_id}/leaderboard")
async def leaderboard(
    game_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[LeaderboardRow]:
    """Public standings. Deliberately unauthenticated -- it goes on a wall."""
    if await GameRepository(session).get(game_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="game not found")
    use_case = GetLeaderboard(
        TeamRepository(session), GuessRepository(session), HintRepository(session)
    )
    return await use_case.execute(game_id)
