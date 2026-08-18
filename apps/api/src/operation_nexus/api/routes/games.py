"""`/games` routes -- read a game's phase catalogue and roster.

Games are created implicitly by the first team that types a name (see
`/play/start`); these endpoints are read-only views used by the projector.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.api.deps import get_session
from operation_nexus.domain.game.contracts import GameState
from operation_nexus.infrastructure.postgres.repositories.game_repository import GameRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import TeamRepository

router = APIRouter(prefix="/games", tags=["games"])


@router.get("/{game_id}")
async def get_game(game_id: UUID, session: AsyncSession = Depends(get_session)) -> GameState:
    game = await GameRepository(session).get(game_id)
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="game not found")
    teams = await TeamRepository(session).list_for_game(game_id)
    return game.model_copy(update={"teams": teams})
