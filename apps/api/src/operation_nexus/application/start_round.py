"""Use case: explicitly start a round (`POST /host/games/{id}/rounds/{n}/start`).

Rounds must be started strictly in sequence -- starting round `n` requires
the game to currently be sitting at round `n - 1`. The per-round `PENDING ->
ACTIVE` transition itself is guarded by `RoundStateMachine`
(`IllegalRoundTransition`, mapped to HTTP 409).
"""

from __future__ import annotations

from uuid import UUID

from operation_nexus.application.errors import RoundSequenceError
from operation_nexus.application.ports import EventBroadcaster
from operation_nexus.domain.game.contracts import RoundState
from operation_nexus.infrastructure.postgres.repositories.game_repository import (
    GameNotFound,
    GameRepository,
)
from operation_nexus.infrastructure.postgres.repositories.team_repository import TeamRepository


class StartRound:
    def __init__(
        self,
        game_repo: GameRepository,
        team_repo: TeamRepository,
        broadcaster: EventBroadcaster,
    ) -> None:
        self._game_repo = game_repo
        self._team_repo = team_repo
        self._broadcaster = broadcaster

    async def execute(self, game_id: UUID, round_number: int) -> RoundState:
        game = await self._game_repo.get(game_id)
        if game is None:
            raise GameNotFound(game_id)

        expected = game.current_round + 1
        if round_number != expected:
            raise RoundSequenceError(requested=round_number, expected=expected)

        round_state = await self._game_repo.start_round(game_id, round_number)

        for team in await self._team_repo.list_for_game(game_id):
            await self._team_repo.award_round_credits(team.team_id, round_number)

        await self._broadcaster.broadcast_to_game(
            game_id,
            "ROUND_STARTED",
            {
                "round": round_state.number,
                "title": round_state.title,
                "narrative": round_state.narrative,
                "duration_seconds": round_state.duration_seconds,
                "credits_awarded": round_state.credits_awarded,
            },
        )
        return round_state
