"""Use case: read the current scoreboard for a game (`GET /host/games/{id}/scoreboard`)."""

from __future__ import annotations

from uuid import UUID

from operation_nexus.domain.game.contracts import ScoreBreakdown
from operation_nexus.infrastructure.postgres.repositories.score_repository import ScoreRepository


class GetScoreboard:
    def __init__(self, score_repo: ScoreRepository) -> None:
        self._score_repo = score_repo

    async def execute(self, game_id: UUID) -> list[ScoreBreakdown]:
        return await self._score_repo.get_scoreboard(game_id)
