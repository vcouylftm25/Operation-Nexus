"""Use case: submit (or resubmit) a team's final accusation.

Deliberately does not touch ground truth or compute a score -- scoring is
100% deterministic and happens once, for every team, in `finish_game`
(CONTRACT.md golden rule #5). This is why `POST /teams/{id}/accusation`
returns 202: the accusation is accepted, not judged.
"""

from __future__ import annotations

from uuid import UUID

from operation_nexus.application.ports import EventBroadcaster
from operation_nexus.domain.game.contracts import Accusation
from operation_nexus.infrastructure.postgres.repositories.game_repository import GameRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import (
    TeamNotFound,
    TeamRepository,
)


class SubmitAccusation:
    def __init__(
        self,
        team_repo: TeamRepository,
        game_repo: GameRepository,
        broadcaster: EventBroadcaster,
    ) -> None:
        self._team_repo = team_repo
        self._game_repo = game_repo
        self._broadcaster = broadcaster

    async def execute(self, team_id: UUID, accusation: Accusation) -> None:
        team = await self._team_repo.get(team_id)
        if team is None:
            raise TeamNotFound(team_id)

        game = await self._game_repo.get(team.game_id)
        current_round = game.current_round if game is not None else 0

        await self._team_repo.save_accusation(team_id, current_round, accusation)

        # Announce that *a* team accused -- never the content, so rivals
        # can't infer strategy from the broadcast.
        await self._broadcaster.broadcast_to_game(
            team.game_id,
            "ACCUSATION_SUBMITTED",
            {"team_id": str(team_id)},
        )
