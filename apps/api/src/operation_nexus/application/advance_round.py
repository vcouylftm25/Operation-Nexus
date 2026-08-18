"""Use case: end the currently active round (`POST /host/games/{id}/rounds/next`).

This only *ends* the active round; the host separately calls `start_round`
to begin the next one (`POST /host/games/{id}/rounds/{n}/start`), keeping the
"end this" and "begin that" decisions explicit and independently retryable.
"""

from __future__ import annotations

from uuid import UUID

from operation_nexus.application.errors import NoActiveRound
from operation_nexus.application.ports import EventBroadcaster
from operation_nexus.domain.game.contracts import RoundState
from operation_nexus.infrastructure.postgres.repositories.game_repository import GameRepository


class AdvanceRound:
    def __init__(self, game_repo: GameRepository, broadcaster: EventBroadcaster) -> None:
        self._game_repo = game_repo
        self._broadcaster = broadcaster

    async def execute(self, game_id: UUID) -> RoundState:
        active = await self._game_repo.get_active_round(game_id)
        if active is None:
            raise NoActiveRound(game_id)

        ended = await self._game_repo.end_round(game_id, active.number)

        await self._broadcaster.broadcast_to_game(game_id, "ROUND_ENDED", {"round": ended.number})
        return ended
